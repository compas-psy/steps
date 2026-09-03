#!/usr/bin/env node
/**
 * Дымовой тест собранного APK на эмуляторе: приложение реально
 * запускается, WebView реально рисует продукт, и по нему реально можно
 * пройти сценарий — а не «скомпилировалось и подписалось».
 *
 * ── Почему через DevTools, а не тапами по координатам ───────────────────────
 *
 * `adb shell input tap x y` целится в пиксели: любая правка вёрстки (а их в
 * этом продукте много) молча уводит тап мимо, и тест либо краснеет на ровном
 * месте, либо — хуже — «проходит», ткнув не туда. Отладка WebView в
 * debug-сборке включена самим wry
 * (`#[cfg(any(debug_assertions, feature = "devtools"))]` →
 * `setWebContentsDebuggingEnabled`, wry `src/android/main_pipe.rs`), поэтому
 * сценарий ведётся по DOM: ищем кнопку по её видимому тексту и нажимаем
 * именно её. Это тот же уровень надёжности, что у Playwright на вебе.
 *
 * ── Что именно проверяется ─────────────────────────────────────────────────
 *
 * 1. Процесс жив после `am start` (не упал на старте — типичная поломка
 *    релизной сборки без правил R8 для JNI-моста).
 * 2. WebView отрисовал НЕПУСТОЙ продукт: в `[data-shagi-app-root]` есть
 *    видимый текст. Это ловит белый экран — ровно ту поломку, которая на
 *    вебе однажды уже случилась (`node:sqlite` в браузерном бандле).
 * 3. Проходится живой сценарий онбординга до Today и создаётся настоящая
 *    задача — то есть работает не только рендер, но и доменный слой поверх
 *    хранилища.
 *
 * 4. Задача переживает ЗАКРЫТИЕ приложения: процесс гасится `am force-stop`
 *    (не «свернуть» — именно убить), приложение открывается заново, задача
 *    ищется на экране снова. Это единственная проверка, которая отличает
 *    настоящее хранилище от красивого состояния в памяти, и до ADR-0006 её
 *    здесь не было, потому что и персистентности не было (`storageBackend:
 *    {kind:'memory'}`). Теперь она есть — и падает, если IndexedDB в
 *    webview Android поведёт себя не так, как обещает Chromium.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  clickByLabel,
  clickByText,
  openTaskRow,
  READ_APP_TEXT,
  READ_BACKEND,
  READ_STORAGE_STATE,
  READ_TASK_ROW_TITLES,
  typeIntoFirstInput,
  typeIntoLabeled,
} from './page-actions.mjs';

const APPLICATION_ID = process.env['SHAGI_APPLICATION_ID'] ?? 'ru.cmpas.shagi';
const DEVTOOLS_PORT = 9222;

function adb(args, options = {}) {
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
function findDevtoolsSocket(pid) {
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
function adbSoft(args) {
  try {
    return adb(args);
  } catch {
    return '';
  }
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/** Пробует условие, пока не выйдет время. Возвращает результат или `null`. */
async function waitFor(label, attempts, delayMs, probe) {
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

  return {
    ready,
    close: () => socket.close(),
    /** Сырой CDP-запрос (не `Runtime.evaluate`) — нужен диагностике белого
     * экрана ниже для `Page.enable`/`Runtime.enable`/`Page.reload` и т.п. */
    async send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      const response = await new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
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
      const response = await new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true },
          }),
        );
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
function listAppFiles() {
  return adbSoft(['shell', 'run-as', APPLICATION_ID, 'ls', '-l']);
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
function pullDatabase(label) {
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

/** Читает содержимое снятой базы — то, что физически лежит в SQLite. */
function inspectDatabase(path) {
  const db = new DatabaseSync(path, { readBigInts: true });
  const one = (sql) => db.prepare(sql).get();
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name`)
    .all()
    .map((row) => row.name);
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n);
  const snapshot = {
    journalMode: one('PRAGMA journal_mode').journal_mode,
    sqliteVersion: one('SELECT sqlite_version() AS v').v,
    fts5: Number(one(`SELECT sqlite_compileoption_used('ENABLE_FTS5') AS used`).used) === 1,
    tables,
    tasks: count('tasks'),
    tombstones: Number(
      db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NOT NULL').get().n,
    ),
    subtasks: Number(
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL',
        )
        .get().n,
    ),
    labels: count('labels'),
    taskLabels: count('task_labels'),
    recurrenceSeries: count('recurrence_series'),
    outbox: count('sync_outbox'),
    titles: db
      .prepare('SELECT title FROM tasks ORDER BY title')
      .all()
      .map((row) => row.title),
  };
  db.close();
  return snapshot;
}

// --- Сценарий ---------------------------------------------------------------

/** Запускает приложение и подключается к его WebView. Вынесено отдельно,
 * потому что вызывается ДВАЖДЫ: второй раз — после `am force-stop`, чтобы
 * проверить, что задача пережила закрытие. */
async function launchAndAttach(label) {
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

const LIVE_SUBTASK = 'Живая подзадача';
const DOOMED_SUBTASK = 'Лишняя подзадача';
const RECURRING_TASK = 'Полить цветы каждый день @дом';
/** Заголовок, каким его сохранит домен: NLP вырезает и повтор, и метку. */
const RECURRING_TITLE = 'Полить цветы';
const AFTER_ERASE_TASK = 'Задача после стирания';

async function main() {
  const taskTitle = 'Проверка сборки';

  console.log('── Установка APK ──');
  const apkPath = process.argv[2];
  if (apkPath === undefined) fail('не передан путь к APK: node android-smoke.mjs <путь.apk>');
  adb(['install', '-r', apkPath], { stdio: 'inherit' });

  const first = await launchAndAttach('первый запуск');

  console.log('── Онбординг: «Начать» ──');
  if ((await first.cdp.evaluate(clickByText('Начать'))) !== true) {
    fail(
      `кнопка «Начать» не найдена. Экран показывает: ${JSON.stringify(first.screen.slice(0, 200))}`,
    );
  }
  await sleep(1200);

  console.log('── Создание настоящей задачи ──');
  if ((await first.cdp.evaluate(typeIntoFirstInput(taskTitle))) !== true) {
    fail('поле ввода первой задачи не найдено');
  }
  await sleep(400);
  if ((await first.cdp.evaluate(clickByText('Добавить задачу'))) !== true) {
    fail('кнопка «Добавить задачу» не найдена');
  }
  await sleep(1500);

  console.log('── Проход до Today ──');
  if ((await first.cdp.evaluate(clickByText('Понятно'))) !== true) {
    fail('кнопка «Понятно» (экран разбора русского текста) не найдена');
  }
  await sleep(1500);

  const todayText = await first.cdp.evaluate(READ_APP_TEXT);
  if (typeof todayText !== 'string' || !todayText.includes(taskTitle)) {
    fail(
      `созданной задачи «${taskTitle}» нет на экране Today. Экран показывает: ` +
        JSON.stringify(String(todayText).slice(0, 300)),
    );
  }
  console.log(`Задача «${taskTitle}» видна на Today.`);

  // ── Данные, которые обязаны пережить перезапуск ──────────────────────────
  //
  // Одной задачи мало: список ADR-0005 требует доказать, что переживают и
  // иерархия, и метки со связями, и состояние повторов, и tombstone, и
  // очередь синхронизации. Сценарий подобран так, чтобы получить всё это
  // минимумом действий (проверен на веб-сборке до переноса сюда):
  // две подзадачи, одна из них удаляется, и одна задача через Quick Add с
  // повтором и меткой.
  console.log('── Иерархия: две подзадачи, одна удаляется (tombstone) ──');
  if ((await first.cdp.evaluate(openTaskRow(taskTitle))) !== true) {
    fail(`строка задачи «${taskTitle}» не открылась — карточка недоступна`);
  }
  await sleep(1200);
  for (const subtask of [LIVE_SUBTASK, DOOMED_SUBTASK]) {
    if ((await first.cdp.evaluate(typeIntoLabeled('Новая подзадача', subtask))) !== true) {
      fail('поле «Новая подзадача» не найдено в карточке задачи');
    }
    await sleep(400);
    // Точное совпадение: «Добавить дату»/«Добавить заметку» стоят выше по
    // DOM и перехватили бы подстроку.
    if ((await first.cdp.evaluate(clickByText('Добавить', { exact: true }))) !== true) {
      fail(`кнопка добавления подзадачи «${subtask}» не найдена`);
    }
    await sleep(1200);
  }
  if ((await first.cdp.evaluate(clickByLabel(`Удалить подзадачу «${DOOMED_SUBTASK}»`))) !== true) {
    fail(`кнопка удаления подзадачи «${DOOMED_SUBTASK}» не найдена`);
  }
  await sleep(1200);
  if ((await first.cdp.evaluate(clickByText('Готово', { exact: true }))) !== true) {
    fail('кнопка «Готово» карточки задачи не найдена');
  }
  await sleep(1200);

  console.log('── Повтор и метка через Quick Add ──');
  if ((await first.cdp.evaluate(clickByLabel('Быстрое добавление'))) !== true) {
    fail('кнопка быстрого добавления не найдена');
  }
  await sleep(1000);
  if ((await first.cdp.evaluate(typeIntoFirstInput(RECURRING_TASK))) !== true) {
    fail('поле Quick Add не найдено');
  }
  await sleep(800);
  // В Quick Add кнопка отправки — иконка: видимого текста нет, имя живёт в
  // `aria-label` (поймано локальной проверкой выражений, а не эмулятором).
  if ((await first.cdp.evaluate(clickByLabel('Добавить задачу'))) !== true) {
    fail('кнопка «Добавить задачу» в Quick Add не найдена');
  }
  // НЕ фиксированный `sleep`: `handleSubmit` (`QuickAdd.tsx`) для этого
  // ввода выполняет ТРИ последовательные транзакции (find-or-create метки,
  // создание повторяющейся задачи + серии, привязка метки), и на нативной
  // SQLite (ADR-0005) каждая идёт через Tauri IPC, а не через IndexedDB —
  // на медленном эмуляторе CI это может не уложиться в фиксированный
  // таймаут, хотя приложение делает всё правильно (весь путь `await`-ится
  // до `closeQuickAdd()`). Опрашиваем экран Today до появления задачи —
  // ровно то, что нужно, а не гадание с числом.
  //
  // Именно СТРОКУ СПИСКА (`READ_TASK_ROW_TITLES`), не весь текст страницы
  // (`READ_APP_TEXT`): Quick Add показывает живой предпросмотр
  // распознанного заголовка (`ParsingPreview`) на каждое нажатие клавиши —
  // «Полить цветы» видно на экране уже на шаге ввода текста, до всякой
  // отправки формы. Первая версия опрашивала `READ_APP_TEXT` и матч
  // случался на предпросмотре за секунды до реальной записи — `waitFor`
  // «срабатывал», но задача так и не была создана, и force-stop двумя
  // секундами позже терял её целиком (найдено разбором лога
  // провалившегося прогона: `labels:1, taskLabels:0, recurrenceSeries:0`,
  // самой задачи нет в `titles`). Строка списка появляется только после
  // того, как Quick Add закрылся и Today перерисовался с сохранённой
  // задачей — раньше её взять неоткуда.
  const created = await waitFor(
    'запись повторяющейся задачи через Quick Add',
    20,
    500,
    async () => {
      const rows = await first.cdp.evaluate(READ_TASK_ROW_TITLES);
      return typeof rows === 'string' && rows.includes(RECURRING_TITLE) ? rows : null;
    },
  );
  if (created === null) {
    const last = await first.cdp.evaluate(READ_APP_TEXT);
    fail(
      `после «Добавить задачу» в Quick Add задача «${RECURRING_TITLE}» не появилась на экране. ` +
        `Экран показывает: ${JSON.stringify(String(last).slice(0, 300))}`,
    );
  }

  // Приложение не должно было умереть по дороге.
  if (adbSoft(['shell', 'pidof', APPLICATION_ID]).trim() === '') {
    fail('приложение упало в процессе сценария');
  }
  first.cdp.close();

  console.log('── Закрытие приложения (force-stop) ──');
  // Пауза перед убийством процесса — не суеверие: запись в IndexedDB
  // асинхронна, и убийство ровно в момент коммита транзакции проверяло бы
  // устойчивость к сбою питания, а не персистентность как таковую.
  await sleep(2000);
  adb(['shell', 'am', 'force-stop', APPLICATION_ID], { stdio: 'inherit' });
  const stopped = await waitFor('остановку процесса', 15, 1000, () =>
    adbSoft(['shell', 'pidof', APPLICATION_ID]).trim() === '' ? true : null,
  );
  if (stopped === null) fail('процесс не умер после `am force-stop` — перезапуск не проверить');

  const second = await launchAndAttach('после перезапуска');

  console.log('── Онбординг не начался заново? ──');
  // Отдельная проверка перед поиском задачи, и она первая по порядку не
  // случайно: если приложение снова открылось приветствием, то задачи на
  // экране нет ПО ДРУГОЙ причине, и сообщение «хранилище не пережило
  // закрытие» было бы ложным диагнозом (ровно это и случилось в прогоне
  // `33618474899`).
  if (second.screen.includes('Что мне делать дальше?')) {
    fail(
      'после перезапуска приложение снова показало приветствие: онбординг начинается заново, ' +
        'даже если данные на месте (M01 «Launch», `packages/app/src/screens/Launch.tsx`)',
    );
  }

  console.log('── Задача пережила перезапуск? ──');
  const afterRestart = await waitFor('восстановленный экран с задачей', 20, 1000, async () => {
    const text = await second.cdp.evaluate(READ_APP_TEXT);
    return typeof text === 'string' && text.includes(taskTitle) ? text : null;
  });
  if (afterRestart === null) {
    const last = await second.cdp.evaluate(READ_APP_TEXT);
    fail(
      `после перезапуска задачи «${taskTitle}» нет: хранилище не пережило закрытие приложения. ` +
        `Экран показывает: ${JSON.stringify(String(last).slice(0, 300))}`,
    );
  }

  console.log('── Файл базы в app-private каталоге ──');
  console.log(listAppFiles());
  const dbPath = pullDatabase('after-restart');
  const state = inspectDatabase(dbPath);
  console.log(`Содержимое базы: ${JSON.stringify(state)}`);

  // Свойства самой базы (`00§2`) — не по отчёту приложения, а по файлу.
  if (state.journalMode.toLowerCase() !== 'wal') {
    fail(`journal_mode файла базы = ${state.journalMode}, ожидался wal`);
  }
  if (!state.fts5) fail('движок SQLite на устройстве собран без FTS5 (00§2)');
  for (const table of [
    'tasks',
    'projects',
    'labels',
    'task_labels',
    'recurrence_series',
    'sync_outbox',
    'tasks_fts',
  ]) {
    if (!state.tables.includes(table)) {
      fail(`в базе нет таблицы ${table}. Есть: ${state.tables.join(', ')}`);
    }
  }

  // Всё, что должно было пережить закрытие приложения, проверяется ПО ФАЙЛУ.
  if (!state.titles.includes(taskTitle)) {
    fail(`в файле базы нет задачи «${taskTitle}»: ${JSON.stringify(state.titles)}`);
  }
  if (!state.titles.includes(LIVE_SUBTASK)) {
    fail(`в файле базы нет подзадачи «${LIVE_SUBTASK}» — иерархия не сохранилась`);
  }
  if (state.subtasks < 1) fail('в базе нет ни одной живой подзадачи — иерархия потеряна');
  if (state.tombstones < 1) {
    fail('в базе нет ни одного tombstone — удаление не сохранилось (02§9)');
  }
  if (state.outbox < 1) {
    fail('очередь синхронизации пуста — outbox не сохранился (00§7)');
  }
  if (state.labels < 1 || state.taskLabels < 1) {
    fail(`метки или их связи не сохранились: меток ${state.labels}, связей ${state.taskLabels}`);
  }
  if (state.recurrenceSeries < 1) {
    fail('состояние повторов не сохранилось: нет ни одной серии (01§11)');
  }
  if (!state.titles.includes(RECURRING_TITLE)) {
    fail(`в базе нет повторяющейся задачи «${RECURRING_TITLE}»`);
  }
  console.log(
    `В базе: задач ${state.tasks} (tombstone ${state.tombstones}, подзадач ${state.subtasks}), ` +
      `меток ${state.labels}/связей ${state.taskLabels}, серий ${state.recurrenceSeries}, ` +
      `очередь ${state.outbox}.`,
  );

  // ── Перенос из IndexedDB: базы прежней сборки на устройстве быть не должно ─
  const storageState = await second.cdp.evaluate(READ_STORAGE_STATE);
  if (typeof storageState === 'string' && /"базы":\[[^\]]*"shagi@/.test(storageState)) {
    fail(
      `база IndexedDB прежней сборки осталась на устройстве: ${storageState}. ` +
        'Без её удаления стёртые данные воскресали бы при следующем запуске.',
    );
  }
  console.log(`Перенос: ${JSON.stringify(second.backend.migration ?? null)}`);

  // ── Стирание локальных данных реально чистит НАТИВНУЮ базу ───────────────
  console.log('── Удаление локальных данных (M52) ──');
  if ((await second.cdp.evaluate(clickByLabel('Настройки'))) !== true) {
    fail('кнопка «Настройки» не найдена на Today');
  }
  await sleep(1200);
  if ((await second.cdp.evaluate(clickByText('Данные и конфиденциальность'))) !== true) {
    fail('строка «Данные и конфиденциальность» не найдена в настройках');
  }
  await sleep(1200);
  const privacyText = await second.cdp.evaluate(READ_APP_TEXT);
  if (!String(privacyText).includes('База на устройстве')) {
    fail(
      'экран «Данные и конфиденциальность» не называет хранилищем базу на устройстве. ' +
        `Показывает: ${JSON.stringify(String(privacyText).slice(0, 300))}`,
    );
  }
  if ((await second.cdp.evaluate(clickByText('Удалить', { exact: true }))) !== true) {
    fail('кнопка удаления локальных данных не найдена');
  }
  await sleep(900);
  if ((await second.cdp.evaluate(clickByText('Удалить всё'))) !== true) {
    fail('подтверждение удаления не найдено');
  }
  await sleep(2500);

  const erased = inspectDatabase(pullDatabase('after-erase'));
  console.log(`База после стирания: ${JSON.stringify(erased)}`);
  // M52-регресс (найден этим же прогоном ранее): eraseAllLocalData падала
  // FOREIGN KEY constraint failed на DELETE FROM "tasks", и НИ ОДНА из этих
  // таблиц не очищалась — проверяем весь FK-граф, не только tasks/outbox.
  const dirty = Object.entries({
    tasks: erased.tasks,
    tombstones: erased.tombstones,
    labels: erased.labels,
    taskLabels: erased.taskLabels,
    recurrenceSeries: erased.recurrenceSeries,
    outbox: erased.outbox,
  }).filter(([, count]) => count !== 0);
  if (dirty.length > 0) {
    fail(
      `eraseAllLocalData не очистила нативную базу: ${dirty.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    );
  }
  if (!erased.tables.includes('tasks')) {
    fail('после стирания в базе нет таблиц — стёрта схема, а не данные');
  }
  console.log('Стирание очистило данные и сохранило схему.');

  // ── База остаётся пригодной к работе после стирания ──────────────────────
  console.log('── Работа после стирания ──');
  if ((await second.cdp.evaluate(clickByText('Начать'))) !== true) {
    fail('после стирания приложение не показало приветствие с кнопкой «Начать»');
  }
  await sleep(1200);
  if ((await second.cdp.evaluate(typeIntoFirstInput(AFTER_ERASE_TASK))) !== true) {
    fail('после стирания поле первой задачи не найдено');
  }
  await sleep(400);
  if ((await second.cdp.evaluate(clickByText('Добавить задачу'))) !== true) {
    fail('после стирания кнопка «Добавить задачу» не найдена');
  }
  await sleep(2000);
  const reused = inspectDatabase(pullDatabase('after-reuse'));
  if (!reused.titles.includes(AFTER_ERASE_TASK)) {
    fail(`после стирания база не принимает новые задачи: в ней ${JSON.stringify(reused.titles)}`);
  }
  console.log('После стирания база снова принимает записи.');

  second.cdp.close();

  console.log(
    'Дымовой тест пройден: приложение запускается на НАТИВНОЙ SQLite, рисует продукт, ' +
      'создаёт задачи, иерархию, метки, повтор и tombstone — всё это лежит в файле базы ' +
      'в app-private каталоге, переживает закрытие приложения, стирается по требованию ' +
      'и продолжает работать после стирания.',
  );
}

await main();
