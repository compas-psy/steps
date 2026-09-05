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
import { dirname, join } from 'node:path';
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

/**
 * Где искать базу. Два кандидата, а не один угаданный: `app_data_dir()`
 * (`crates/shagi-sqlite`) на Windows отображается в `%APPDATA%` (Roaming),
 * но рядом Tauri заводит `%LOCALAPPDATA%\<identifier>` под данные WebView2 —
 * и на прогоне `e2bac5f` появился ИМЕННО он, а базы не было ни там, ни там.
 * Скрипт принимает любой из двух и печатает, где нашёл: утверждение
 * «приложение создало свою базу» не зависит от того, какой каталог
 * выбирает платформа, а вот моя догадка о нём — зависела и была неверной.
 */
const roamingDataDir = join(process.env.APPDATA ?? localAppData, identifier);
const localDataDir = join(localAppData, identifier);
const candidateDataDirs = [roamingDataDir, localDataDir];
const dbFileName = 'shagi.db';

function findDb() {
  return candidateDataDirs.map((dir) => join(dir, dbFileName)).find((path) => existsSync(path));
}

function step(message) {
  process.stdout.write(`\n=== ${message}\n`);
}

step(`Тихая установка: ${installer}`);
execFileSync(installer, ['/S'], { stdio: 'inherit' });

/**
 * Каталог установки НЕ угадывается, а читается из реестра — из той самой
 * записи деинсталляции, которую NSIS создаёт сам.
 *
 * Первая версия этого скрипта складывала путь руками
 * (`%LOCALAPPDATA%\Programs\<productName>`) и упала на живом раннере:
 * установка прошла, а файла там не оказалось. Угадывать второй раз
 * бессмысленно — раскладка принадлежит шаблону NSIS в Tauri и может
 * поменяться с его версией. `InstallLocation` и `UninstallString` —
 * авторитетный источник, который переживёт такую смену.
 */
let installation = null;
// NSIS с `/S` возвращает управление до того, как допишет реестр. Ждём
// появления записи, а не фиксированную паузу: пауза «на глазок» — это либо
// потерянное время, либо ложное падение на медленном раннере.
await waitFor(
  () => {
    installation = findInstallationSync();
    return installation !== null && Boolean(installation.InstallLocation);
  },
  60_000,
  'в реестре не появилась запись об установке',
);

const installDir = installation.InstallLocation.replace(/"/g, '').replace(/\\$/, '');
const exePath = join(installDir, binaryName);
await waitFor(() => existsSync(exePath), 30_000, `не появился ${exePath}`);
step(`Установлено: ${exePath}`);
process.stdout.write(`${readdirSync(installDir).join('\n')}\n`);

// Предыдущего состояния быть не должно — иначе «база создалась» окажется
// правдой и для приложения, которое её не создавало.
for (const dir of candidateDataDirs) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    step(`Каталог данных очищен до запуска: ${dir}`);
  }
}

step('Запуск приложения');
const app = spawn(exePath, [], { detached: true, stdio: 'ignore' });
app.unref();

try {
  await waitFor(
    () => findDb() !== undefined,
    90_000,
    `приложение не создало ${dbFileName} ни в одном из каталогов: ${candidateDataDirs.join(', ')}`,
    dumpAppDiagnostics,
  );
  const dbPath = findDb();
  step(`База создана: ${dbPath}`);

  // WAL включается при открытии соединения (`crates/shagi-sqlite`), но файл
  // `-wal` появляется с первой записью — а первая запись случается на
  // миграциях схемы `@shagi/storage`, то есть сразу.
  await waitFor(
    () => existsSync(`${dbPath}-wal`),
    30_000,
    `рядом с базой нет ${dbPath}-wal — journal_mode не WAL (нарушение 00§2)`,
    dumpAppDiagnostics,
  );
  step('WAL-файл на месте — journal_mode=WAL');

  process.stdout.write(`${readdirSync(dirname(dbPath)).join('\n')}\n`);

  // Приложение обязано быть ЖИВО к этому моменту: база, созданная упавшим
  // процессом, ничего не доказывает.
  const alive = processCount();
  if (alive === 0) throw new Error('процесс приложения умер до конца проверки');
  step(`Процесс жив (экземпляров: ${alive})`);
} finally {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Get-Process -Name '${config.mainBinaryName}' -ErrorAction SilentlyContinue | Stop-Process -Force`,
  ]);
}

step('Тихое удаление');
// `UninstallString` — тоже из реестра, а не собранный руками путь: имя
// деинсталлятора принадлежит шаблону NSIS ровно так же, как каталог.
const uninstaller = String(installation.UninstallString).replace(/"/g, '');
if (!existsSync(uninstaller)) throw new Error(`деинсталлятор не найден: ${uninstaller}`);
execFileSync(uninstaller, ['/S'], { stdio: 'inherit' });
await waitFor(() => !existsSync(exePath), 60_000, `после удаления остался ${exePath}`);

step('Install smoke пройден: установка → запуск → база с WAL → удаление');

/** Синхронная обёртка над чтением реестра — `waitFor` принимает предикат. */
function findInstallationSync() {
  try {
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $roots = @(
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
      )
      $found = foreach ($root in $roots) {
        Get-ChildItem $root | ForEach-Object { Get-ItemProperty $_.PSPath } |
          Where-Object { $_.DisplayName -eq '${productName}' -or $_.PSChildName -like '*${identifier}*' }
      }
      $found | Select-Object -First 1 |
        Select-Object DisplayName, InstallLocation, UninstallString |
        ConvertTo-Json -Compress
    `;
    const raw = execFileSync('powershell', ['-NoProfile', '-Command', script]).toString().trim();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function processCount() {
  return Number(
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-Process -Name '${config.mainBinaryName}' -ErrorAction SilentlyContinue | Measure-Object).Count`,
    ])
      .toString()
      .trim(),
  );
}

/**
 * Диагностика падения запуска — ОДНИМ прогоном, а не серией догадок.
 * Прогон `e2bac5f` дал ровно один факт («базы нет по угаданному пути») и
 * стоил десяти минут; этот дамп отвечает сразу на все вопросы, которые
 * иначе пришлось бы задавать по одному: жив ли процесс, что вообще
 * появилось в каталогах приложения, есть ли `shagi.db` хоть где-нибудь в
 * профиле пользователя и не записала ли Windows отчёт о падении.
 */
function dumpAppDiagnostics() {
  const userProfile = process.env.USERPROFILE ?? localAppData;
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    Write-Output '--- процессы приложения ---'
    Get-Process -Name '${config.mainBinaryName}' | Select-Object Id, ProcessName, Responding | Format-Table | Out-String
    Write-Output '--- каталоги приложения ---'
    foreach ($dir in @('${roamingDataDir}', '${localDataDir}')) {
      Write-Output ('== ' + $dir)
      Get-ChildItem -Path $dir -Recurse -Depth 2 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
    }
    Write-Output '--- поиск shagi.db во всём профиле ---'
    Get-ChildItem -Path '${userProfile}' -Filter 'shagi.db*' -Recurse -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName
    Write-Output '--- журнал приложений Windows за последние 10 минут ---'
    Get-WinEvent -FilterHashtable @{ LogName='Application'; StartTime=(Get-Date).AddMinutes(-10) } -ErrorAction SilentlyContinue |
      Where-Object { $_.Message -like '*shagi*' -or $_.LevelDisplayName -eq 'Error' } |
      Select-Object -First 20 TimeCreated, ProviderName, LevelDisplayName, Message | Format-List | Out-String
  `;
  try {
    process.stdout.write(
      `\n--- ДИАГНОСТИКА ---\n${execFileSync('powershell', ['-NoProfile', '-Command', script]).toString()}\n`,
    );
  } catch (error) {
    process.stdout.write(`\nдиагностику собрать не удалось: ${String(error)}\n`);
  }
}

async function waitFor(condition, timeoutMs, failure, onFailure) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(500);
  }
  if (onFailure) {
    onFailure();
  } else {
    // Диагностика в момент падения: без неё следующий прогон снова уйдёт на
    // угадывание, а он стоит десять минут.
    try {
      const dump = execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `Get-ChildItem '${localAppData}' -Directory | Select-Object -ExpandProperty Name`,
      ]).toString();
      process.stdout.write(`\nКаталоги на момент падения:\n${dump}\n`);
    } catch {
      // Диагностика не обязана работать, чтобы падение было честным.
    }
  }
  throw new Error(`${failure} (ожидание ${timeoutMs} мс)`);
}
