#!/usr/bin/env node
/**
 * Управление УСТРОЙСТВОМ: adb, DevTools-мост к WebView, файл базы, скриншоты.
 *
 * Отдельный модуль по той же причине, что и `page-actions.mjs`: этими
 * сорока строками `adb`/CDP пользуется не один сценарий. Пока сценарий был
 * один (`android-smoke.mjs`), инфраструктура жила внутри него; с появлением
 * короткой приёмки (`android-acceptance.mjs`) копия означала бы два
 * расходящихся `launchAndAttach` — а разошедшись, они перестали бы
 * проверять одно и то же на одном и том же устройстве, и разница вылезла
 * бы прогоном на эмуляторе, то есть в самом дорогом месте.
 *
 * Здесь только ПЛАТФОРМА: как дотянуться до приложения и до его данных.
 * Ни одного утверждения о продукте — они живут в сценариях, каждый в своём.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { clickByText, READ_APP_TEXT, READ_BACKEND, READ_STORAGE_STATE } from './page-actions.mjs';

export const APPLICATION_ID = process.env['SHAGI_APPLICATION_ID'] ?? 'ru.cmpas.shagi';
const DEVTOOLS_PORT = 9222;

export function adb(args, options = {}) {
  // При `stdio: 'inherit'` вывод уходит прямо в лог, а `execFileSync`
  // возвращает `null` — без этой проверки вызов падал бы на `.trim()`
  // раньше, чем успел бы что-то проверить.
  const output = execFileSync('adb', args, { encoding: 'utf8', ...options });
  return typeof output === 'string' ? output.trim() : '';
}

/** Имя abstract-сокета DevTools, который открыл наш процесс. Спрашиваем сам
 * Android (`/proc/net/unix`), а не собираем строку из pid: у приложения может
 * быть несколько процессов, и WebView живёт не обязательно в том, чей pid
 * первым вернул `pidof`. */
export function findDevtoolsSocket(pid) {
  const lines = adbSoft(['shell', 'cat', '/proc/net/unix']).split('\n');
  const found = new Set();
  for (const line of lines) {
    const match = /(webview_devtools_remote_\d+)/.exec(line);
    if (match !== null) found.add(match[1]);
  }
  // Сокет НАШЕГО процесса, а не первый попавшийся: WebView есть и у других
  // приложений эмулятора, и подключиться к чужому — значит проверять чужой
  // экран, ничего об этом не подозревая.
  const own = `webview_devtools_remote_${pid}`;
  if (found.has(own)) return own;
  return null;
}

/** То же самое, но код возврата — ЧАСТЬ ОТВЕТА, а не сбой. `adb shell pidof`
 * завершается единицей, когда процесса нет: это ровно то, что мы и
 * спрашиваем во время ожидания запуска, а `execFileSync` на ненулевом коде
 * бросает исключение и роняет весь тест. Поймано первым прогоном, который
 * досюда дошёл. */
export function adbSoft(args) {
  try {
    return adb(args);
  } catch {
    return '';
  }
}

export function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/** Пробует условие, пока не выйдет время. Возвращает результат или `null`. */
export async function waitFor(label, attempts, delayMs, probe) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- опрос по своей природе последователен
    const value = await probe();
    if (value !== null && value !== undefined && value !== false) return value;
    // eslint-disable-next-line no-await-in-loop -- то же самое
    await sleep(delayMs);
    if (attempt % 5 === 0) console.log(`  …жду: ${label} (попытка ${attempt}/${attempts})`);
  }
  return null;
}

/**
 * Взаимодействие со страницей с ОЖИДАНИЕМ (открыть строку задачи,
 * напечатать в поле, выбрать «сегодня» в сетке дат): выполнить
 * скрипт-действие, пока оно не вернёт `true`.
 *
 * Прогон `33939706659` упал на `openTaskRow` («строка задачи … не
 * открылась после стирания») — тот же класс, что и одноразовые клики,
 * просто другое действие: после M52-стирания список перерисовывается, и
 * фиксированного `sleep` перед одной попыткой снова не хватило. Условие
 * не ослаблено: действие обязано удаться, иначе вызывающий код падает
 * прежним сообщением.
 */
export async function actWhenReady(session, script, attempts = 12, delayMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await session.cdp.evaluate(script)) === true) return true;
    await sleep(delayMs);
  }
  return false;
}

/**
 * Клик по видимому тексту, но с ОЖИДАНИЕМ его появления, а не одной
 * попыткой после фиксированного `sleep`.
 *
 * Так было написано всё остальное ожидание в этом файле (`waitFor`), и
 * только клики оставались одноразовыми: «подождали 1.5 с — кликнули —
 * если не нашли, шаг провален». Прогон `33929233806` упал ровно на этом
 * («кнопка «Понятно» … не найдена») в месте, которое проходило десятки
 * раз до того: экран просто не успел отрисоваться в отведённые секунды.
 *
 * Проверка от этого не слабеет: кнопка по-прежнему ОБЯЗАНА появиться, и
 * если её нет — вызывающий код падает своим прежним сообщением. Меняется
 * только то, что «ещё не отрисовалось» перестаёт быть неотличимо от «нет
 * вовсе». На успешном пути первая же попытка возвращает true, никакой
 * лишней задержки не добавляется.
 */
export async function clickByTextWhenReady(
  session,
  text,
  options = {},
  attempts = 12,
  delayMs = 500,
) {
  return actWhenReady(session, clickByText(text, options), attempts, delayMs);
}

// --- DevTools ---------------------------------------------------------------

/** Страница WebView в списке DevTools. Появляется не мгновенно: сокет
 * открывается только после того, как wry создал WebView. */
async function findWebViewTarget() {
  const response = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`).catch(() => null);
  if (response === null || !response.ok) return null;
  const targets = await response.json();
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  return page ?? null;
}

/** Минимальный клиент Chrome DevTools Protocol: одно соединение, запросы по
 * возрастающему `id`. Полноценная библиотека здесь избыточна — нужны
 * `Runtime.evaluate` плюс (для диагностики белого экрана, ниже) сырой
 * `send`/подписка на события по `method` (у событий CDP нет `id` — их
 * рассылка отделена от резолвинга запросов по `pending`). */
function createCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('WebSocket DevTools не открылся')));
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const resolver = pending.get(message.id);
      if (resolver !== undefined) {
        pending.delete(message.id);
        resolver(message);
      }
      return;
    }
    // Событие CDP (`method`+`params`, без `id`) — например
    // `Runtime.exceptionThrown`/`Runtime.consoleAPICalled`.
    const handlers = listeners.get(message.method);
    if (handlers !== undefined) for (const handler of handlers) handler(message.params);
  });

  // Ожидание ответа CDP ОГРАНИЧЕНО по времени.
  //
  // Без этого потеря WebView-таргета вешала весь смоук намертво: два
  // прогона подряд (`33942250857`, `33944433959`) не упали, а завершились
  // предупреждением Node «Detected unsettled top-level await» — обещание
  // ответа не разрешалось никогда. Оба раза рядом в логе эмулятора стояло
  // `Failed to find ColorBuffer` (сбой swiftshader), то есть страница
  // умирала под нами. Молчаливое зависание хуже провала: оно не говорит ни
  // что сломалось, ни где.
  //
  // Проверки от таймаута не слабеют — он не делает ни одного вывода о
  // продукте, только превращает «ответа не будет никогда» в осмысленную
  // ошибку с именем метода.
  const CDP_TIMEOUT_MS = 30_000;
  function awaitResponse(id, method, payload) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `DevTools ${method}: ответа нет ${CDP_TIMEOUT_MS} мс — страница/таргет потеряны ` +
              '(в логе эмулятора рядом обычно `Failed to find ColorBuffer`).',
          ),
        );
      }, CDP_TIMEOUT_MS);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      socket.send(JSON.stringify(payload));
    });
  }

  return {
    ready,
    close: () => socket.close(),
    /** Сырой CDP-запрос (не `Runtime.evaluate`) — нужен диагностике белого
     * экрана ниже для `Page.enable`/`Runtime.enable`/`Page.reload` и т.п. */
    async send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      const response = await awaitResponse(id, method, { id, method, params });
      if (response.error) throw new Error(`DevTools ${method}: ${response.error.message}`);
      return response.result;
    },
    /** Подписка на события CDP (не запросы) по имени метода. */
    on(method, handler) {
      const handlers = listeners.get(method) ?? [];
      handlers.push(handler);
      listeners.set(method, handlers);
    },
    /** Выполняет выражение В СТРАНИЦЕ и возвращает значение по значению. */
    async evaluate(expression) {
      const id = nextId;
      nextId += 1;
      const response = await awaitResponse(id, 'Runtime.evaluate', {
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      });
      if (response.error) throw new Error(`DevTools: ${response.error.message}`);
      const details = response.result?.exceptionDetails;
      if (details)
        throw new Error(
          `Ошибка в странице: ${details.text} ${details.exception?.description ?? ''}`,
        );
      return response.result?.result?.value;
    },
  };
}

/**
 * Диагностика ПУСТОГО экрана — вызывается ТОЛЬКО из уже провалившейся ветки
 * (после того, как `waitFor('первый отрисованный экран', ...)` исчерпал все
 * попытки), поэтому не меняет тайминг/поведение проходящего сценария ни на
 * миллисекунду и не ослабляет ни одну существующую проверку — только
 * добавляет текст к уже принятому решению `fail()`.
 *
 * `adb logcat` для этого бесполезен (проверено разбором прогона
 * `33742579888`): WebView не форвардит `console.*`/необработанные исключения
 * в logcat сам по себе — это должен явно включить хост через
 * `WebChromeClient.onConsoleMessage`, чего wry/tauri не делает. Единственный
 * способ узнать РЕАЛЬНУЮ ошибку — слушать CDP `Runtime.exceptionThrown`/
 * `Runtime.consoleAPICalled` и `window.onerror`/`unhandledrejection` внутри
 * самой страницы. Подписка на CDP-события могла не успеть до первого краша
 * (сокет открывается почти сразу после старта WebView, но не гарантированно
 * раньше первого исполнения скрипта) — поэтому дополнительно ставим
 * `Page.addScriptToEvaluateOnNewDocument` (сработает до любого скрипта
 * страницы при следующей навигации) и один раз перезагружаем страницу, чтобы
 * гарантированно поймать даже самый ранний краш вживую, а не только то, что
 * случайно попало в буфер CDP-событий до этого момента.
 */
async function captureBlankScreenDiagnostics(cdp) {
  const cdpEvents = [];
  cdp.on('Runtime.exceptionThrown', (params) => {
    const ex = params.exceptionDetails;
    cdpEvents.push({
      kind: 'exception',
      text: ex?.text,
      description: ex?.exception?.description ?? ex?.exception?.value,
      url: ex?.url,
      line: ex?.lineNumber,
    });
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type !== 'error' && params.type !== 'warning') return;
    cdpEvents.push({
      kind: `console.${params.type}`,
      args: (params.args ?? []).map((a) => a.description ?? a.value ?? a.type),
    });
  });
  cdp.on('Log.entryAdded', (params) => {
    if (params.entry?.level !== 'error') return;
    cdpEvents.push({ kind: 'log', text: params.entry.text, source: params.entry.source });
  });

  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__shagiDiag__ = [];
        window.addEventListener('error', (e) => {
          window.__shagiDiag__.push('error: ' + String(e.error && e.error.stack || e.message));
        });
        window.addEventListener('unhandledrejection', (e) => {
          window.__shagiDiag__.push('unhandledrejection: ' + String((e.reason && e.reason.stack) || e.reason));
        });
      `,
    });
    await cdp.send('Page.reload', { ignoreCache: true });
    // Фиксированная пауза ВНУТРИ уже провалившейся ветки, не новый таймаут
    // прохождения сценария: сценарий уже решил `fail()`, дальше только
    // собираем максимум объяснения перед выходом с ненулевым кодом.
    await sleep(5000);
    const pageErrors = await cdp
      .evaluate('JSON.stringify(window.__shagiDiag__ || [])')
      .catch((error) => `evaluate после reload не удался: ${error.message}`);
    return JSON.stringify({ cdpEvents, pageErrorsAfterReload: pageErrors });
  } catch (error) {
    return JSON.stringify({ cdpEvents, captureError: error.message });
  }
}

// --- Работа с НАСТОЯЩИМ файлом базы на устройстве ---------------------------

/**
 * Список файлов в app-private каталоге приложения. `run-as` открывает
 * оболочку с рабочим каталогом ПРЯМО В КОРНЕ данных приложения (`/data/
 * user/0/<id>/`), а не в `files/`: `sqlite_open` (`src-tauri/src/sqlite.rs`)
 * кладёт `shagi.db` через `app.path().app_data_dir()`, и на Android это
 * корень, не `Context.getFilesDir()`. Первая версия смотрела в `files/` —
 * там реально лежит только `profileInstalled` (ART-профилировщик),
 * `shagi.db` там нет и не может быть.
 */
export function listAppFiles() {
  return adbSoft(['shell', 'run-as', APPLICATION_ID, 'ls', '-l']);
}

/** Каталог артефактов приёмки: скриншоты установленной сборки. */
const SCREENSHOT_DIR = process.env.SHAGI_SCREENSHOT_DIR ?? join(process.cwd(), 'smoke-screenshots');

/**
 * Снимок экрана устройства в каталог артефактов прогона. Владелец продукта
 * потребовал скриншоты как ЧАСТЬ приёмки, а не как приятное дополнение:
 * зелёный прогон сам по себе больше не считается доказательством того, что
 * интерфейсом можно пользоваться. Снимок делается с установленной сборки на
 * устройстве, а не с браузера.
 */
export function screenshot(name) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const target = join(SCREENSHOT_DIR, `${name}.png`);
  const png = execFileSync('adb', ['exec-out', 'screencap', '-p'], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  // `screencap -p` на некоторых образах отдаёт текст ошибки вместо PNG —
  // сигнатура проверяется, чтобы в артефактах не оказалось пустышки,
  // выданной за скриншот.
  if (png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50) {
    console.log(`ВНИМАНИЕ: скриншот «${name}» не снят (adb вернул ${png.length} байт, не PNG)`);
    return;
  }
  writeFileSync(target, png);
  console.log(`Скриншот: ${target} (${png.length} байт)`);
}

/**
 * Снимает файл базы (и её WAL) с устройства и открывает его тем же
 * `node:sqlite`, что и тесты.
 *
 * Почему именно так, а не «спросим приложение через DevTools»: вопрос
 * стоит «лежат ли данные в НАСТОЯЩЕЙ SQLite», и ответить на него может
 * только сам файл. Приложение на этот вопрос отвечать не должно —
 * диагностический хук в продукте доказывал бы лишь то, что хук написан.
 *
 * WAL копируется вместе с базой и под тем же именем: последние коммиты
 * могут лежать ещё в нём, и без него снимок был бы «почти правдой».
 */
export function pullDatabase(label) {
  const dir = mkdtempSync(join(tmpdir(), `shagi-db-${label}-`));
  const local = join(dir, 'shagi.db');
  // Пути — БЕЗ `files/`: см. разбор в `listAppFiles`. Первая версия смотрела
  // не туда и снимала не файл базы, а текст ошибки `run-as` (47 байт вместо
  // настоящей SQLite) — найдено этим же прогоном на эмуляторе, а не
  // рассуждением: `node:sqlite` честно ответил `file is not a database`.
  for (const [remote, target] of [
    ['shagi.db', local],
    ['shagi.db-wal', `${local}-wal`],
    ['shagi.db-shm', `${local}-shm`],
  ]) {
    const bytes = execFileSync('adb', ['exec-out', 'run-as', APPLICATION_ID, 'cat', remote], {
      maxBuffer: 256 * 1024 * 1024,
    });
    // `-wal`/`-shm` могут отсутствовать — это нормально (контрольная точка
    // уже слита в базу). Сама база отсутствовать не может.
    if (bytes.length === 0 && target === local) {
      fail(`файл базы ${remote} пуст или не читается — нативной SQLite на устройстве нет`);
    }
    if (bytes.length > 0) writeFileSync(target, bytes);
  }
  if (!existsSync(local)) fail('файл базы не снялся с устройства');
  console.log(`Файл базы снят: ${local}, ${statSync(local).size} байт`);
  return local;
}

/** Запускает приложение и подключается к его WebView. Вынесено отдельно,
 * потому что вызывается ДВАЖДЫ: второй раз — после `am force-stop`, чтобы
 * проверить, что задача пережила закрытие. */
/**
 * Запуск с ОДНОЙ повторной попыткой, если сорвалось само подключение.
 *
 * Ровно один сценарий: эмулятор теряет GPU-поверхность (`Failed to find
 * ColorBuffer` в его логе), WebView-таргет умирает, и ответ CDP не
 * приходит никогда. Раньше это вешало прогон намертво, теперь даёт
 * таймаут — но одного таймаута мало, чтобы дойти до конца сценария.
 *
 * Повторяется ТОЛЬКО брошенное исключение подключения. Диагностированные
 * провалы (процесс не поднялся, сокета нет, пустой экран) идут через
 * `fail()` и завершают прогон немедленно, как и раньше: пересоздание
 * сессии не должно превращаться в способ не заметить сломанное
 * приложение.
 */
export async function launchAndAttach(label) {
  try {
    return await attemptLaunchAndAttach(label);
  } catch (error) {
    console.warn(
      `::warning::Подключение к приложению (${label}) сорвалось: ` +
        `${String(error?.message ?? error)}. Одна повторная попытка.`,
    );
    adbSoft(['shell', 'am', 'force-stop', APPLICATION_ID]);
    await sleep(2000);
    return await attemptLaunchAndAttach(`${label}, повтор после сорванного подключения`);
  }
}

async function attemptLaunchAndAttach(label) {
  console.log(`── Запуск приложения (${label}) ──`);
  // `monkey` с категорией LAUNCHER, а не `am start -n <id>/.MainActivity`:
  // имя класса активности задаёт шаблон Tauri, и привязываться к нему —
  // значит красить тест при обновлении шаблона. Здесь запускается ровно то,
  // что запустил бы человек с домашнего экрана.
  adb(['shell', 'monkey', '-p', APPLICATION_ID, '-c', 'android.intent.category.LAUNCHER', '1'], {
    stdio: 'inherit',
  });

  const pid = await waitFor('процесс приложения', 30, 1000, () => {
    const found = adbSoft(['shell', 'pidof', APPLICATION_ID]).trim();
    return found === '' ? null : found.split(/\s+/u)[0];
  });
  if (pid === null) fail(`приложение не запустилось (${label}): процесс не появился`);
  console.log(`Процесс жив, pid=${pid}`);

  const socket = await waitFor('сокет DevTools', 30, 1000, () => findDevtoolsSocket(pid));
  if (socket === null) {
    fail(
      `WebView не открыл сокет отладки (${label}). В debug-сборке его включает сам wry — ` +
        'если сокета нет, значит WebView не создан вовсе (приложение упало на старте).',
    );
  }
  adb(['forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:${socket}`]);

  const target = await waitFor('WebView в DevTools', 30, 1000, findWebViewTarget);
  if (target === null) {
    fail(`сокет ${socket} открыт, но страницы в нём нет: WebView создан, а документ не загрузился`);
  }
  // Адрес важен сам по себе: IndexedDB (ADR-0006) работает на HTTP-origin и
  // НЕ работает на `file://`. Если однажды Tauri начнёт отдавать страницу
  // файлом, это будет видно в логе прогона прямо здесь.
  console.log(`WebView найден: ${target.url}`);

  const cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.ready;

  const screen = await waitFor('первый отрисованный экран', 30, 1000, async () => {
    const text = await cdp.evaluate(READ_APP_TEXT);
    return typeof text === 'string' && text.length > 0 ? text : null;
  });
  if (screen === null) {
    const diagnostics = await captureBlankScreenDiagnostics(cdp);
    fail(
      `WebView отрисовал ПУСТОЙ экран (${label}): в [data-shagi-app-root] нет ни одного видимого символа. ` +
        `Диагностика (CDP + перезагрузка с перехватом ошибок): ${diagnostics}`,
    );
  }
  console.log(`Видимый текст: ${JSON.stringify(screen.slice(0, 120))}`);
  console.log(`Хранилище (страница): ${await cdp.evaluate(READ_STORAGE_STATE)}`);

  // Какой backend оболочка СОБРАЛА на самом деле. Проверка отдельная и
  // жёсткая: молчаливого отката на IndexedDB в ADR-0005 нет, и если он
  // когда-нибудь появится, тест обязан покраснеть здесь, а не «пройти» на
  // подменённом хранилище.
  const backendRaw = await cdp.evaluate(READ_BACKEND);
  const backend = typeof backendRaw === 'string' ? JSON.parse(backendRaw) : null;
  console.log(`Хранилище (оболочка): ${backendRaw}`);
  if (backend === null) {
    fail(
      `оболочка не сообщила о собранном хранилище (${label}). Либо prepareStorage() упал, ` +
        'либо главная точка входа изменилась и диагностику потеряли.',
    );
  }
  if (backend.backend !== 'sqlite') {
    fail(
      `backend оболочки — «${backend.backend}», а обязан быть «sqlite» (ADR-0005). ` +
        'Это и есть тихий откат на прежнее хранилище, которого быть не должно.',
    );
  }
  if (!String(backend.native?.path ?? '').startsWith('/data/')) {
    fail(
      `файл базы лежит не в app-private каталоге: ${JSON.stringify(backend.native?.path)}. ` +
        'Ожидался путь под /data/ — там, куда система кладёт приватные данные приложения.',
    );
  }
  if (String(backend.native?.journalMode ?? '').toLowerCase() !== 'wal') {
    fail(`journal_mode=${backend.native?.journalMode}, а 00§2 требует WAL`);
  }

  return { cdp, screen, backend };
}
