/**
 * Install smoke Windows-оболочки ШАГОВ (ADR-0009, шаг 1 критического пути).
 *
 * Что доказывает этот скрипт и почему именно это:
 *
 *  1. Инсталлятор ставится тихой установкой (`/S`) — то, что реально делает
 *     пользователь, а не «файл существует и весит N байт».
 *  2. Установленный `.exe` лежит там, где обещает `installMode:
 *     currentUser` — в `%LOCALAPPDATA%\Programs`.
 *  3. Приложение ЗАПУСКАЕТСЯ и не падает в первые секунды.
 *  4. Оно СОЗДАЁТ ФАЙЛ БАЗЫ в app-private каталоге. Это главное
 *     утверждение: до профиля `MVP 1.0-local` десктопная оболочка работала
 *     на `kind: 'memory'`, и смоук «окно открылось» прошёл бы на сборке,
 *     которая теряет всё при перезапуске. Файл базы — единственное
 *     наблюдаемое снаружи доказательство, что local-first на этой платформе
 *     действительно есть.
 *  5. Рядом с базой появляется WAL-файл — `00§2` требует journal_mode=WAL,
 *     и `shagi-sqlite` включает его при открытии. Нет `-wal` рядом с базой
 *     — значит база открыта не так, как требует ТЗ.
 *  6. Приложение чисто удаляется, и деинсталлятор не оставляет `.exe`.
 *
 * Скрипт НЕ проверяет UI: экраны живут в `packages/app` и проверяются
 * e2e веба на том же коде. Здесь — граница платформы, и только она.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const installer = process.argv[2];
if (!installer) {
  throw new Error('Использование: windows-install-smoke.mjs <путь к *-setup.exe>');
}

/** `identifier` из `tauri.conf.json` — имя app-private каталога, которое
 * Tauri отдаёт через `app.path().app_data_dir()`. Читается из конфига, а не
 * дублируется строкой: разойдясь, они дали бы смоук, который ищет базу не
 * там и падает по непонятной причине. */
const config = JSON.parse(
  execFileSync(
    'node',
    ['-p', "JSON.stringify(require('./apps/desktop/src-tauri/tauri.conf.json'))"],
    {
      encoding: 'utf8',
    },
  ),
);
const identifier = config.identifier;
const productName = config.productName;
const binaryName = `${config.mainBinaryName}.exe`;

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error('LOCALAPPDATA не задан — это не Windows-раннер');

const installDir = join(localAppData, 'Programs', productName);
const exePath = join(installDir, binaryName);
const dataDir = join(process.env.APPDATA ?? localAppData, identifier);
const dbPath = join(dataDir, 'shagi.db');

function step(message) {
  process.stdout.write(`\n=== ${message}\n`);
}

step(`Тихая установка: ${installer}`);
execFileSync(installer, ['/S'], { stdio: 'inherit' });

// NSIS с `/S` возвращает управление до того, как распакует всё до конца.
// Ждём появления файла, а не фиксированную паузу: пауза «на глазок» — это
// либо потерянное время, либо ложное падение на медленном раннере.
await waitFor(() => existsSync(exePath), 60_000, `не появился ${exePath}`);
step(`Установлено: ${exePath}`);

// Предыдущего состояния быть не должно — иначе «база создалась» окажется
// правдой и для приложения, которое её не создавало.
if (existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
  step(`Каталог данных очищен до запуска: ${dataDir}`);
}

step('Запуск приложения');
const app = spawn(exePath, [], { detached: true, stdio: 'ignore' });
app.unref();

try {
  await waitFor(() => existsSync(dbPath), 90_000, `приложение не создало базу ${dbPath}`);
  step(`База создана: ${dbPath}`);

  // WAL включается при открытии соединения (`crates/shagi-sqlite`), но файл
  // `-wal` появляется с первой записью — а первая запись случается на
  // миграциях схемы `@shagi/storage`, то есть сразу.
  await waitFor(
    () => existsSync(`${dbPath}-wal`),
    30_000,
    `рядом с базой нет ${dbPath}-wal — journal_mode не WAL (нарушение 00§2)`,
  );
  step('WAL-файл на месте — journal_mode=WAL');

  process.stdout.write(`${readdirSync(dataDir).join('\n')}\n`);

  // Приложение обязано быть ЖИВО к этому моменту: база, созданная упавшим
  // процессом, ничего не доказывает.
  const alive = execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `(Get-Process -Name '${config.mainBinaryName}' -ErrorAction SilentlyContinue | Measure-Object).Count`,
  ])
    .toString()
    .trim();
  if (alive === '0') throw new Error('процесс приложения умер до конца проверки');
  step(`Процесс жив (экземпляров: ${alive})`);
} finally {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Get-Process -Name '${config.mainBinaryName}' -ErrorAction SilentlyContinue | Stop-Process -Force`,
  ]);
}

step('Тихое удаление');
const uninstaller = join(installDir, 'uninstall.exe');
if (!existsSync(uninstaller)) throw new Error(`деинсталлятор не найден: ${uninstaller}`);
execFileSync(uninstaller, ['/S'], { stdio: 'inherit' });
await waitFor(() => !existsSync(exePath), 60_000, `после удаления остался ${exePath}`);

step('Install smoke пройден: установка → запуск → база с WAL → удаление');

async function waitFor(condition, timeoutMs, failure) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(500);
  }
  throw new Error(`${failure} (ожидание ${timeoutMs} мс)`);
}
