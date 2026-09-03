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
  READ_DEVICE_TIME,
  READ_STORAGE_STATE,
  READ_TASK_ROW_TITLES,
  selectDialOption,
  selectTodayInDateGrid,
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

// --- Настоящие OS-level alarm'ы (Task B8) ------------------------------------
//
// «Реальный alarm существует» (см. брифу задачи, преамбула) означает ровно
// одно: запись в `AlarmManagerService`, которую видно через
// `adb shell dumpsys alarm`, — не строку `reminders` в SQLite (это уже
// проверяет `inspectDatabase`) и не то, что помнит JS-мост
// (`notification-bridge.ts`'s `Map`, который пуст на каждом свежем
// процессе). Каждая claim'а из таблицы брифа («существует», «отменён»,
// «не задвоился», «пережил force-stop/reboot») сводится к чтению ЭТОГО
// дампа, а не к доверию тому, что сказало приложение о себе.

/** Все строки дампа `AlarmManagerService`, упоминающие наш пакет —
 * ровно то, что задаёт Step 1 брифа. */
function listSystemAlarms() {
  const output = adb(['shell', 'dumpsys', 'alarm'], { encoding: 'utf8' });
  const lines = output.split('\n').filter((line) => line.includes(APPLICATION_ID));
  return lines;
}

/**
 * Тот же алгоритм id, что и `apps/mobile/src/notification-bridge.ts`
 * (`fnv1a32`) — СКОПИРОВАН сюда, а не импортирован: этот файл — `.mjs` вне
 * TypeScript-графа сборки мобильного приложения, а копия детерминированной
 * чистой функции здесь не дублирует бизнес-логику, а независимо
 * пересчитывает тот же контракт со стороны наблюдателя — тем же приёмом,
 * что `pullDatabase`/`inspectDatabase` выше не спрашивают приложение о
 * содержимом своей базы, а читают файл сами. Раз `nativeId(reminderId)` —
 * чистая функция строки (UUID напоминания), она даёт ОДИНАКОВЫЙ 32-битный
 * id на каждом прогоне независимо от того, жив ли ещё in-memory `Map`
 * моста — это и есть тот самый механизм, который делает claim #8 (id
 * стабилен между перезапусками) верным по построению, а не везением.
 */
function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

/**
 * Различает «точный, не подлежащий батчингу» alarm (`setExactAndAllowWhileIdle`)
 * от «неточного» (обычный `set`/`setWindow`) ПО ТЕКСТУ строки дампа — то,
 * что бриф задачи (Step 2b) прямо описывает как единственный механический
 * признак: `dumpsys alarm` не печатает буквальных слов «exact»/«inexact»,
 * но печатает поле `window=<миллисекунды>` — 0 для alarm'ов, у которых ОС
 * не имеет права сдвинуть момент срабатывания ради группировки, и ненулевое
 * значение для батчируемых. Формат ПОДТВЕРЖДЁН только описанием брифа, НЕ
 * живым прогоном — см. TODO ниже.
 *
 * // TODO(B8-controller): формат `dumpsys alarm` для установленной версии
 * // Android/AOSP этого образа эмулятора живьём не наблюдался (в этой
 * // песочнице нет `adb`/эмулятора вовсе, см. отчёт задачи). Название поля
 * // (`window=`) взято из официального описания механизма в самом брифе
 * // задачи и общего знания формата `AlarmManagerService`/`Alarm.java`
 * // (AOSP), но НЕ вычитано из реального дампа этой сборки. После первого
 * // живого прогона (Step 11, контроллер) — свериться с настоящей строкой и
 * // либо оставить этот regexp, либо заменить на реально увиденный маркер,
 * // одной правкой здесь.
 */
function alarmWindowMs(line) {
  const match = /\bwindow=(\d+)/.exec(line);
  return match === null ? null : Number(match[1]);
}

/**
 * Триггерное время alarm'а из строки дампа — нужно и Step 3 (замена времени
 * при update), и Step 9b (смена часового пояса). НЕ гадаем вслепую (бриф
 * прямо это запрещает и для 3, и для 9b): пробуем оба формата, которые
 * реально встречаются в разных версиях AOSP `Alarm.dump()`/
 * `TimeUtils.formatDuration` — абсолютный календарный штамп
 * (`YYYY-MM-DD HH:MM:SS`) и относительную длительность от «сейчас»
 * (`+1h23m45s678ms`). Второй формат — ЛОВУШКА, если принять его за
 * абсолютное значение буквально: строка меняется на КАЖДОМ вызове дампа
 * просто потому, что время идёт, даже если реальный запланированный
 * instant не менялся ни на миллисекунду — поэтому там, где формат
 * относительный, эта функция возвращает МИЛЛИСЕКУНДЫ ДО СРАБАТЫВАНИЯ,
 * посчитанные из самой строки, а не эпоху — сравнение остаётся сравнением
 * той же величины, но абсолютная и относительная формы НЕ смешиваются
 * между двумя снимками одного прогона (`compareTriggerSnapshots` ниже).
 *
 * // TODO(B8-controller): оба regexp — лучшее обоснованное предположение
 * // по документированному/общеизвестному формату `AlarmManagerService`,
 * // НЕ вычитаны из реального дампа (нет эмулятора в этой песочнице).
 * // После Step 11 — подставить реально увиденную строку сюда одной
 * // правкой (и в `parseAlarmWindow` выше).
 */
function parseTriggerSnapshot(line) {
  const absolute = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/.exec(line);
  if (absolute !== null) {
    return { kind: 'absolute', value: absolute[1] };
  }
  const relative = /\+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?(?:(\d+)ms)?/.exec(line);
  if (relative !== null && (relative[1] || relative[2] || relative[3] || relative[4])) {
    const hours = Number(relative[1] ?? 0);
    const minutes = Number(relative[2] ?? 0);
    const seconds = Number(relative[3] ?? 0);
    const millis = Number(relative[4] ?? 0);
    const totalMs = ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
    return { kind: 'relative', value: totalMs };
  }
  return null;
}

/**
 * true, если ДВА снимка триггерного времени (одного и того же alarm'а, до
 * и после действия — update в Step 3, смена таймзоны в Step 9b) явно
 * различаются. Возвращает `null`, если сравнение технически невозможно
 * (не удалось распарсить хотя бы одну сторону, либо разные представления
 * — например, до было `absolute`, после `relative`; такое сравнение
 * недостоверно, а не «не изменилось»). Вызывающий код обязан различать
 * `false` (уверенно НЕ изменилось — настоящая проблема) от `null`
 * (сравнение не удалось — TODO для контроллера, не провал теста).
 */
function triggerChanged(before, after) {
  if (before === null || after === null || before.kind !== after.kind) return null;
  if (before.kind === 'absolute') return before.value !== after.value;
  // Относительное представление: «сейчас» на втором снимке позже, чем на
  // первом (несколько секунд ушло на UI-действие), поэтому НЕИЗМЕНИВШИЙСЯ
  // alarm покажет МЕНЬШУЮ разницу до срабатывания — допуск в 90с покрывает
  // это естественное убывание с большим запасом (Step 3/9b двигают время
  // минимум на 15-20 минут), но не маскирует реальное отсутствие изменения.
  return Math.abs(before.value - after.value) > 90_000;
}

/**
 * Строки дампа, буквально содержащие десятичный нативный id (claim #8,
 * best-effort) — НЕ единственное доказательство стабильности id ниже: то,
 * что UUID напоминания в SQLite не меняется между циклами
 * (`assertSameReminderRow`), уже доказывает стабильность по построению
 * (`fnv1a32` — чистая функция того UUID, см. комментарий у неё). Эта
 * функция — дополнительная, необязательная сверка с текстом дампа.
 *
 * // TODO(B8-controller): НЕ подтверждено, что `PendingIntent.requestCode`
 * // (наш `id32`) вообще печатается в `toString()`/дампе современных версий
 * // Android — начиная с определённых версий AOSP `PendingIntent` намеренно
 * // скрывает часть внутренностей из соображений приватности. Если после
 * // живого прогона выяснится, что id никогда не встречается в тексте —
 * // это ОЖИДАЕМО и не проблема: `assertSameReminderRow`/сравнение счётчика
 * // остаются главным доказательством claim #8, эта проверка — бонус.
 */
function linesWithNativeId(lines, nativeId) {
  const needle = String(nativeId);
  return lines.filter((line) => line.includes(needle));
}

/** Та же включённая explicit-запись (Step 6b/7, Task B8) обязана остаться
 * ТЕМ ЖЕ UUID между циклами BOOT_COMPLETED — если бы какой-то код на пути
 * реконсиляции пересоздавал сущность (новый `id`) вместо чистого
 * `schedule()`/`cancel()`, это значило бы лишний, никем не запрошенный
 * write в SQLite на каждый boot. Отдельная функция, не инлайн — вызывается
 * трижды (Step 6, дважды Step 6b) с одним и тем же смыслом ошибки. */
function assertSameReminderRow(dbPath, taskTitle, expected, cycleLabel) {
  const current = readEnabledReminder(dbPath, taskTitle);
  if (current === null) {
    fail(`${cycleLabel}: в базе больше нет включённого explicit-напоминания для «${taskTitle}»`);
  }
  if (current.id !== expected.id) {
    fail(
      `${cycleLabel}: UUID напоминания изменился (${expected.id} → ${current.id}) — что-то на пути ` +
        'реконсиляции пересоздало сущность вместо чистого schedule()/cancel() (claim #8 брифа).',
    );
  }
  return current;
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
    // Task B8, Step 8: та же роль, что `labels`/`taskLabels` выше — общий
    // счётчик строк таблицы, нужный и до, и после M52-стирания (нулю после
    // стирания и посвящена расширенная проверка ниже).
    reminders: count('reminders'),
    titles: db
      .prepare('SELECT title FROM tasks ORDER BY title')
      .all()
      .map((row) => row.title),
  };
  db.close();
  return snapshot;
}

/**
 * Единственная ВКЛЮЧЁННАЯ explicit-напоминалка задачи по её заголовку —
 * нужна отдельно от `inspectDatabase()` (Task B8, Steps 2-9b): проверки
 * «id стабилен между перезапусками»/«count не растёт» должны знать РЕАЛЬНЫЙ
 * UUID напоминания этой конкретной задачи, чтобы посчитать его нативный id
 * (`fnv1a32`) тем же способом, что и `notification-bridge.ts`. `enabled=1`
 * в фильтре — тот же смысл, что `explicitReminder` в `TaskDetail.tsx`
 * (строка 979): отменённая (но не стёртая, `reminder-cancel.ts`) запись не
 * в счёт.
 */
function readEnabledReminder(dbPath, taskTitle) {
  const db = new DatabaseSync(dbPath, { readBigInts: true });
  const row = db
    .prepare(
      `SELECT r.id AS id FROM reminders r
       JOIN tasks t ON t.id = r.task_id
       WHERE t.title = ? AND r.kind = 'explicit' AND r.enabled = 1
       LIMIT 1`,
    )
    .get(taskTitle);
  db.close();
  return row === undefined ? null : { id: row.id, nativeId: fnv1a32(row.id) };
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

// --- Task B8: явные напоминания — подписи циферблата и вторая задача --------
//
// Подписи диалов — те же строки, что `packages/i18n/src/catalog/ru-RU/
// taskDetail.json` (`planning.reminder.hourListLabel`/`minuteListLabel`):
// продуктовые строки в тестовом скрипте — тот же приём, что уже есть в этом
// файле для `clickByText('Начать')`/`typeIntoLabeled('Новая подзадача', …)`
// — параметризованные page-actions получают текст от вызывающего кода, а
// не хардкодят его сами (`page-actions.mjs`).
const REMINDER_HOUR_DIAL = 'Часы';
const REMINDER_MINUTE_DIAL = 'Минуты';
/** Вторая задача — НЕ «Проверка сборки» — специально для сценария
 * force-stop/reboot (Steps 5-9b брифа). Причина не переиспользовать первую
 * задачу: `countExplicitByTask` (`packages/storage`, задокументированный
 * шов, см. комментарий `TaskDetail.tsx` `handleSubmitReminder`) считает
 * ПО `kind='explicit'` БЕЗ фильтра `enabled` — после явной отмены
 * напоминания (Step 4) строка остаётся в базе с `enabled=0` и БЛОКИРУЕТ
 * повторное «Добавить напоминание» правилом 19 на той же задаче. Отдельная
 * задача без истории отмен обходит этот шов, не маскируя его — он всё
 * равно наблюдаем в Step 4→попытка-Add-снова, если бы кто-то захотел его
 * проверить отдельно, просто этот сценарий его не задевает по конструкции.
 */
const REMINDER_TASK_B = 'Напоминание переживает перезапуск';

/** Паддинг до двух разрядов («9» → «09») — тот же обязательный паддинг,
 * что и у самого циферблата (`packages/ui` `TimePicker.tsx` `pad2`), не
 * форматирование под locale. Вынесена из `pickReminderTime` в область
 * модуля (`oxlint` `unicorn/consistent-function-scoping`): она не замыкает
 * ничего из тела функции, пересоздавать её на каждый вызов незачем. */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Выбирает «сейчас устройства + N минут», округлённое ВВЕРХ к шагу
 * циферблата (5 минут, `TimePicker` `minuteStep` по умолчанию,
 * `packages/ui`) — round-up, не round-to-nearest: обязано остаться в
 * БУДУЩЕМ относительно момента чтения, иначе неудачное округление вниз
 * могло бы попасть на уже прошедшую минуту. Время читается ПРЯМО СО
 * СТРАНИЦЫ (`READ_DEVICE_TIME`), не с хоста CI — часы эмулятора могут не
 * совпадать с часами раннера, а кликается циферблат самого устройства.
 */
async function pickReminderTime(session, minutesAhead) {
  const now = JSON.parse(await session.cdp.evaluate(READ_DEVICE_TIME));
  const totalMinutes = now.hour * 60 + now.minute + minutesAhead;
  const rounded = Math.ceil(totalMinutes / 5) * 5;
  const hour = Math.floor(rounded / 60) % 24;
  const minute = rounded % 60;
  const pad = pad2;
  if ((await session.cdp.evaluate(selectDialOption(REMINDER_HOUR_DIAL, pad(hour)))) !== true) {
    fail(`циферблат часов напоминания: значение «${pad(hour)}» не найдено`);
  }
  await sleep(300);
  if ((await session.cdp.evaluate(selectDialOption(REMINDER_MINUTE_DIAL, pad(minute)))) !== true) {
    fail(`циферблат минут напоминания: значение «${pad(minute)}» не найдено`);
  }
  await sleep(300);
  return { hour, minute };
}

async function main() {
  const taskTitle = 'Проверка сборки';

  console.log('── Установка APK ──');
  const apkPath = process.argv[2];
  if (apkPath === undefined) fail('не передан путь к APK: node android-smoke.mjs <путь.apk>');
  adb(['install', '-r', apkPath], { stdio: 'inherit' });

  // Найдено при первом реальном прогоне Task B8 (не в брифе — это
  // инфраструктурный пробел смоук-теста, не продуктовый баг): свежий образ
  // эмулятора запускает приложение с НЕ выданным на уровне ОС
  // `POST_NOTIFICATIONS` (Android 13+, runtime-permission) — манифест лишь
  // объявляет его (`android-permissions.txt`), реальную выдачу делает
  // человек в системном диалоге, которого в headless CI нет. Без гранта
  // `notification-bridge.ts`'s `schedule()` корректно (SPEC ST10 — «молча
  // не планировать без разрешения») просто НИЧЕГО не планирует —
  // `requestPermission()` резолвится не `'granted'`, `batch()` не
  // вызывается вовсе, и Step 2 навсегда падает на «dumpsys alarm пуст»,
  // даже когда весь остальной код полностью исправен. Грант — до первого
  // запуска, тем же механизмом, что Step 2c уже использует для
  // `SCHEDULE_EXACT_ALARM` через `appops`, только для `pm grant`
  // (runtime-permission, не app-op).
  adb(['shell', 'pm', 'grant', APPLICATION_ID, 'android.permission.POST_NOTIFICATIONS'], {
    stdio: 'inherit',
  });

  // `let`, не `const` (Task B8): блоки напоминаний ниже перезапускают
  // приложение несколько раз (revoke/restore capability, force-stop,
  // BOOT_COMPLETED×3) и каждый раз переприсваивают `first` свежей сессии
  // `launchAndAttach` — весь код ПОСЛЕ них (иерархия подзадач, Quick Add,
  // персистентность) обязан видеть уже АКТУАЛЬНУЮ сессию, а не первую.
  let first = await launchAndAttach('первый запуск');

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

  // ═══════════════════════════════════════════════════════════════════════
  // Task B8 — реальные OS-level alarm'ы явных напоминаний.
  //
  // АМЕНДМЕНТ ПОЛЬЗОВАТЕЛЯ (SDD-ledger, см. брифу задачи): официальный
  // плагин в дереве зависимостей — направление, не доказательство. Девять
  // claim'ов из таблицы брифа проверяются здесь эмпирически, на реальном
  // `AlarmManagerService` (`dumpsys alarm`), не пересказом чтения Kotlin.
  //
  // Две отдельные задачи, не одна (см. комментарий у `REMINDER_TASK_B`):
  // «Проверка сборки» — Steps 2/2b/2c/3/4 (schedule → exact-маркер →
  // degrade/restore capability → update → cancel), «Напоминание переживает
  // перезапуск» — Steps 5/6/6b/7 (force-stop-модель, reboot-реконсиляция,
  // стабильность id). Обе задачи доживают до конца прогона: M52 (Step 8)
  // стирает ВСЁ хранилище позже, обеим задачам всё равно, что от них
  // осталось на момент стирания.
  // ═══════════════════════════════════════════════════════════════════════

  console.log('── Напоминание: открытие карточки «Проверка сборки» ──');
  if ((await first.cdp.evaluate(openTaskRow(taskTitle))) !== true) {
    fail(`строка задачи «${taskTitle}» не открылась для планирования напоминания`);
  }
  await sleep(1200);

  console.log('── Step 2: явное напоминание на ближайшее будущее ──');
  const beforeAddText = await first.cdp.evaluate(READ_APP_TEXT);
  if (!String(beforeAddText).includes('Нет напоминания')) {
    fail(
      `ожидалось пустое состояние напоминания перед добавлением. Экран: ` +
        JSON.stringify(String(beforeAddText).slice(0, 300)),
    );
  }
  if ((await first.cdp.evaluate(clickByText('Добавить напоминание'))) !== true) {
    fail('кнопка «Добавить напоминание» не найдена');
  }
  await sleep(900);
  if ((await first.cdp.evaluate(selectTodayInDateGrid)) !== true) {
    fail('ячейка «сегодня» в сетке дат напоминания не найдена');
  }
  await sleep(500);
  await pickReminderTime(first, 5);
  if ((await first.cdp.evaluate(clickByText('Сохранить', { exact: true }))) !== true) {
    fail('кнопка «Сохранить» напоминания не найдена');
  }

  const scheduledAfterAdd = await waitFor(
    'OS-level alarm после создания напоминания',
    20,
    1000,
    () => {
      const lines = listSystemAlarms();
      return lines.length > 0 ? lines : null;
    },
  );
  if (scheduledAfterAdd === null) {
    fail(
      `после добавления напоминания \`dumpsys alarm\` не показывает ни одной записи ${APPLICATION_ID} — ` +
        'реальный OS-level alarm не создан, хотя приложение могло сообщить об успехе.',
    );
  }
  const dbPathAfterAdd = pullDatabase('reminder-scheduled');
  const dbAfterAdd = inspectDatabase(dbPathAfterAdd);
  const reminderA = readEnabledReminder(dbPathAfterAdd, taskTitle);
  if (dbAfterAdd.reminders < 1) {
    fail(
      `после добавления напоминания в файле базы нет ни одной строки reminders: ${dbAfterAdd.reminders}`,
    );
  }
  if (reminderA === null) {
    fail(
      'после добавления напоминания в базе нет включённой (enabled=1) explicit-записи для этой задачи',
    );
  }
  console.log(
    `Напоминание в базе: reminders=${dbAfterAdd.reminders}, id=${reminderA.id}, ` +
      `nativeId=${reminderA.nativeId}. Совпадающих строк dumpsys: ${scheduledAfterAdd.length}.`,
  );

  console.log('── Step 2b: exact/inexact маркер — claim #1 ──');
  for (const line of scheduledAfterAdd) console.log(`  dumpsys: ${line}`);
  const windowsAfterAdd = scheduledAfterAdd.map(alarmWindowMs).filter((value) => value !== null);
  if (windowsAfterAdd.length === 0) {
    fail(
      'ни одна строка `dumpsys alarm` не содержит поле `window=` — маркер exact/inexact из Step 2b брифа не ' +
        'удалось прочитать НИ ОДНИМ способом (TODO(B8-controller), см. `alarmWindowMs`). Реально увиденные ' +
        `строки залогированы выше. Строки: ${JSON.stringify(scheduledAfterAdd)}`,
    );
  }
  const hasStandaloneAfterAdd = windowsAfterAdd.some((value) => value === 0);
  if (!hasStandaloneAfterAdd) {
    fail(
      'ожидался хотя бы один standalone/unbatched (`window=0`) alarm сразу после создания напоминания при ' +
        `доступной точной alarm-возможности — найденные window: ${JSON.stringify(windowsAfterAdd)}. Если это ` +
        'действительно так на реальном устройстве — claim #1 брифа НЕ подтверждён, это не ошибка теста.',
    );
  }
  console.log(
    `Standalone (window=0) alarm найден — точный путь подтверждён: ${JSON.stringify(windowsAfterAdd)}`,
  );

  console.log('── Step 2c: деградация при отозванной exact-возможности (claim #2) ──');
  adb(['shell', 'cmd', 'appops', 'set', APPLICATION_ID, 'SCHEDULE_EXACT_ALARM', 'deny'], {
    stdio: 'inherit',
  });
  first.cdp.close();
  first = await launchAndAttach('после отзыва SCHEDULE_EXACT_ALARM');
  if ((await first.cdp.evaluate(openTaskRow(taskTitle))) !== true) {
    fail(`строка задачи «${taskTitle}» не открылась после отзыва exact-возможности`);
  }
  await sleep(1200);
  if ((await first.cdp.evaluate(clickByText('Изменить напоминание'))) !== true) {
    fail(
      'кнопка «Изменить напоминание» не найдена — предыдущее напоминание должно было сохраниться',
    );
  }
  await sleep(900);
  // Пересохраняем БЕЗ смены даты/времени: `handleSubmitReminder` (`TaskDetail.tsx`)
  // безусловно делает cancel-затем-create на КАЖДЫЙ submit независимо от
  // того, изменились ли значения — этого достаточно, чтобы форсировать
  // свежий `schedule()` (и вместе с ним свежий `getSchedulingCapability()`,
  // `reconcileTaskReminders`) с УЖЕ отозванной возможностью, не подбирая
  // новое время только ради этого.
  if ((await first.cdp.evaluate(clickByText('Сохранить', { exact: true }))) !== true) {
    fail('кнопка «Сохранить» не найдена при пересохранении напоминания с отозванной возможностью');
  }
  await sleep(2000);

  const inexactNoticeText = await waitFor(
    'уведомление о неточном напоминании (ST10, Task B6)',
    15,
    700,
    async () => {
      const text = await first.cdp.evaluate(READ_APP_TEXT);
      return typeof text === 'string' && text.includes('Точное время сейчас недоступно')
        ? text
        : null;
    },
  );
  if (inexactNoticeText === null) {
    const last = await first.cdp.evaluate(READ_APP_TEXT);
    fail(
      'после отзыва SCHEDULE_EXACT_ALARM экран не показал уведомление ST10 ' +
        `(planning.reminder.inexactNotice) — приложение молчит там, где обязано честно предупредить. ` +
        `Экран: ${JSON.stringify(String(last).slice(0, 300))}`,
    );
  }
  const linesAfterDeny = listSystemAlarms();
  console.log(`dumpsys после отзыва возможности (${linesAfterDeny.length} строк):`);
  for (const line of linesAfterDeny) console.log(`  dumpsys: ${line}`);
  const windowsAfterDeny = linesAfterDeny.map(alarmWindowMs).filter((value) => value !== null);
  if (windowsAfterDeny.length === 0) {
    fail(
      'после отзыва возможности не удалось прочитать `window=` ни в одной строке dumpsys — ' +
        `TODO(B8-controller), см. Step 2b. Строки: ${JSON.stringify(linesAfterDeny)}`,
    );
  }
  if (windowsAfterDeny.every((value) => value === 0)) {
    fail(
      'плагин продолжает планировать standalone/unbatched (`window=0`) alarm ПОСЛЕ отзыва ' +
        'SCHEDULE_EXACT_ALARM — приложение молча выдаёт себя за точное там, где Android честно не может это ' +
        `гарантировать (claim #2 брифа НЕ подтверждён). window'ы: ${JSON.stringify(windowsAfterDeny)}`,
    );
  }
  console.log('Деградация подтверждена: UI честно предупреждает, alarm перестал быть standalone.');

  adb(['shell', 'cmd', 'appops', 'set', APPLICATION_ID, 'SCHEDULE_EXACT_ALARM', 'allow'], {
    stdio: 'inherit',
  });
  console.log('SCHEDULE_EXACT_ALARM восстановлен — дальнейшие шаги видят обычное exact-состояние.');

  console.log('── Step 3: изменение времени заменяет alarm, не задваивает (claim #6) ──');
  const beforeUpdate = listSystemAlarms();
  const beforeUpdateSnapshots = beforeUpdate.map(parseTriggerSnapshot);
  if ((await first.cdp.evaluate(clickByText('Изменить напоминание'))) !== true) {
    fail('кнопка «Изменить напоминание» не найдена перед Step 3');
  }
  await sleep(900);
  // Заметно другое время, не то же значение, что Step 2/2c — иначе
  // «время не изменилось» и «время изменилось на то же самое» неразличимы.
  await pickReminderTime(first, 25);
  if ((await first.cdp.evaluate(clickByText('Сохранить', { exact: true }))) !== true) {
    fail('кнопка «Сохранить» изменённого напоминания не найдена');
  }
  await sleep(2000);

  const afterUpdate = await waitFor(
    'стабильное число OS-level alarm после обновления',
    15,
    700,
    () => {
      const lines = listSystemAlarms();
      return lines.length > 0 ? lines : null;
    },
  );
  if (afterUpdate === null) {
    fail(
      'после изменения времени `dumpsys alarm` пуст — update потерял alarm целиком, а не заменил его',
    );
  }
  if (afterUpdate.length !== beforeUpdate.length) {
    fail(
      `update изменил КОЛИЧЕСТВО строк dumpsys (${beforeUpdate.length} → ${afterUpdate.length}) — похоже на ` +
        `задвоение, а не замену (claim #6 брифа). До: ${JSON.stringify(beforeUpdate)}. ` +
        `После: ${JSON.stringify(afterUpdate)}`,
    );
  }
  const afterUpdateSnapshots = afterUpdate.map(parseTriggerSnapshot);
  const anyConfirmedChange = afterUpdateSnapshots.some((after) =>
    beforeUpdateSnapshots.some((before) => triggerChanged(before, after) === true),
  );
  const allInconclusive = afterUpdateSnapshots.every((after) =>
    beforeUpdateSnapshots.every((before) => triggerChanged(before, after) === null),
  );
  if (allInconclusive) {
    console.warn(
      '::warning::Step 3 (claim #6): не удалось распарсить триггерное время ни в одной строке dumpsys — ' +
        'TODO(B8-controller), см. `parseTriggerSnapshot`. Число строк НЕ выросло (задвоение исключено — реальная ' +
        'проверка пройдена), но смена момента срабатывания текстово не подтверждена. ' +
        `До: ${JSON.stringify(beforeUpdate)}. После: ${JSON.stringify(afterUpdate)}`,
    );
  } else if (!anyConfirmedChange) {
    fail(
      `после изменения времени напоминания триггерное время В ДАМПЕ не изменилось. ` +
        `До: ${JSON.stringify(beforeUpdate)}. После: ${JSON.stringify(afterUpdate)}`,
    );
  } else {
    console.log('Триггерное время в dumpsys действительно изменилось, число записей не выросло.');
  }
  const windowsAfterUpdate = afterUpdate.map(alarmWindowMs).filter((value) => value !== null);
  if (windowsAfterUpdate.some((value) => value === 0)) {
    console.log(
      'Бонус: после восстановления SCHEDULE_EXACT_ALARM новый alarm снова standalone (exact) — восстановление подтверждено.',
    );
  } else if (windowsAfterUpdate.length > 0) {
    console.warn(
      '::warning::после восстановления SCHEDULE_EXACT_ALARM alarm всё ещё не standalone — сверить на живом прогоне.',
    );
  }

  console.log('── Step 4: отмена снимает alarm (claim #7) ──');
  if ((await first.cdp.evaluate(clickByText('Отменить напоминание'))) !== true) {
    fail('кнопка «Отменить напоминание» не найдена');
  }
  const afterCancel = await waitFor('пустой `dumpsys alarm` после отмены', 15, 700, () => {
    const lines = listSystemAlarms();
    return lines.length === 0 ? lines : null;
  });
  if (afterCancel === null) {
    fail(
      `после отмены напоминания \`dumpsys alarm\` всё ещё показывает записи: ${JSON.stringify(listSystemAlarms())}`,
    );
  }
  console.log('Отмена подтверждена: `dumpsys alarm` для пакета пуст.');
  if ((await first.cdp.evaluate(clickByText('Готово', { exact: true }))) !== true) {
    fail('кнопка «Готово» карточки не найдена после отмены напоминания (Step 4)');
  }
  await sleep(900);

  // ── Блок B: вторая задача — force-stop-модель, reboot-реконсиляция ───────
  console.log('── Task B8, Блок B: вторая задача для force-stop/reboot-сценария ──');
  if ((await first.cdp.evaluate(clickByLabel('Быстрое добавление'))) !== true) {
    fail('кнопка быстрого добавления не найдена (Task B8, Блок B)');
  }
  await sleep(900);
  if ((await first.cdp.evaluate(typeIntoFirstInput(REMINDER_TASK_B))) !== true) {
    fail('поле Quick Add не найдено (Task B8, Блок B)');
  }
  await sleep(700);
  if ((await first.cdp.evaluate(clickByLabel('Добавить задачу'))) !== true) {
    fail('кнопка «Добавить задачу» в Quick Add не найдена (Task B8, Блок B)');
  }
  const createdTaskB = await waitFor('запись второй задачи через Quick Add', 20, 500, async () => {
    const rows = await first.cdp.evaluate(READ_TASK_ROW_TITLES);
    return typeof rows === 'string' && rows.includes(REMINDER_TASK_B) ? rows : null;
  });
  if (createdTaskB === null) fail(`задача «${REMINDER_TASK_B}» не появилась после Quick Add`);

  if ((await first.cdp.evaluate(openTaskRow(REMINDER_TASK_B))) !== true) {
    fail(`строка задачи «${REMINDER_TASK_B}» не открылась`);
  }
  await sleep(1200);

  console.log('── Step 5.0: планирование напоминания для force-stop-сценария ──');
  if ((await first.cdp.evaluate(clickByText('Добавить напоминание'))) !== true) {
    fail('кнопка «Добавить напоминание» не найдена (Блок B)');
  }
  await sleep(900);
  if ((await first.cdp.evaluate(selectTodayInDateGrid)) !== true) {
    fail('ячейка «сегодня» не найдена (Блок B)');
  }
  await sleep(500);
  await pickReminderTime(first, 10);
  if ((await first.cdp.evaluate(clickByText('Сохранить', { exact: true }))) !== true) {
    fail('кнопка «Сохранить» не найдена (Блок B)');
  }

  const baseline = await waitFor('OS-level alarm второй задачи', 20, 1000, () => {
    const lines = listSystemAlarms();
    return lines.length > 0 ? lines : null;
  });
  if (baseline === null) {
    fail(`после планирования второй задачи \`dumpsys alarm\` пуст для ${APPLICATION_ID}`);
  }
  const baselineCount = baseline.length;
  const dbPathB = pullDatabase('block-b-scheduled');
  const reminderB = readEnabledReminder(dbPathB, REMINDER_TASK_B);
  if (reminderB === null) {
    fail(`в базе нет включённого explicit-напоминания для «${REMINDER_TASK_B}»`);
  }
  const remindersRowCountBaseline = inspectDatabase(dbPathB).reminders;
  console.log(
    `Базовое число dumpsys-строк: ${baselineCount}. id=${reminderB.id}, nativeId=${reminderB.nativeId}. ` +
      `Строк reminders в базе: ${remindersRowCountBaseline}.`,
  );

  if ((await first.cdp.evaluate(clickByText('Готово', { exact: true }))) !== true) {
    fail('кнопка «Готово» карточки не найдена (Блок B, до force-stop)');
  }
  await sleep(1000);

  console.log(
    '── Step 5.1: обычная гибель процесса — alarm ДОЛЖЕН пережить (claim #3, сценарий 1) ──',
  );
  const pidBeforeKill = adbSoft(['shell', 'pidof', APPLICATION_ID]).trim().split(/\s+/u)[0];
  if (!pidBeforeKill) fail('не удалось получить pid процесса перед `kill` (Step 5.1)');
  // Обычный `kill`, НЕ `am force-stop` — разные операции ОС, brief прямо
  // требует не путать их: только force-stop переводит пакет в stopped
  // state и снимает alarm'ы, простая гибель процесса — нет.
  adb(['shell', 'kill', pidBeforeKill]);
  const deadAfterKill = await waitFor('гибель процесса после kill', 15, 500, () =>
    adbSoft(['shell', 'pidof', APPLICATION_ID]).trim() === '' ? true : null,
  );
  if (deadAfterKill === null) fail('процесс не умер после `kill` — Step 5.1 непроверяем');
  const afterKill = listSystemAlarms();
  if (afterKill.length !== baselineCount) {
    fail(
      `после обычного kill процесса alarm пропал/изменился (было ${baselineCount}, стало ${afterKill.length}) — ` +
        `это НЕ ожидаемое поведение AlarmManager (claim #3 брифа, ADR-0008). Строки: ${JSON.stringify(afterKill)}`,
    );
  }
  console.log('Обычная гибель процесса: alarm пережил, ровно так, как обещает AlarmManager.');

  console.log(
    '── Step 5.2: explicit Force Stop — alarm ДОЛЖЕН исчезнуть, это PASS (claim #3, сценарий 2) ──',
  );
  adb(['shell', 'am', 'force-stop', APPLICATION_ID], { stdio: 'inherit' });
  const afterForceStop = await waitFor('очистку alarm после force-stop', 15, 700, () => {
    const lines = listSystemAlarms();
    return lines.length === 0 ? lines : null;
  });
  if (afterForceStop === null) {
    fail(
      '`am force-stop` НЕ очистил `dumpsys alarm` — противоречит платформенной модели ADR-0008 (force-stop ' +
        `обязан перевести пакет в stopped state и снять его pending alarm'ы). Строки: ` +
        JSON.stringify(listSystemAlarms()),
    );
  }
  // ПУСТОЙ dumpsys здесь — ОЖИДАЕМЫЙ, ПРАВИЛЬНЫЙ результат, не повод для
  // fail(): обратное направление проверки, чем везде в этом файле (брифу
  // Step 5, п.2 — «Do NOT fail() on this, write the assertion the other
  // direction»).
  console.log(
    'Force Stop корректно снял alarm — ожидаемое поведение платформы (ADR-0008), не баг.',
  );

  console.log(
    '── Step 5.3: перезапуск после force-stop восстанавливает alarm без задвоения (claim #3, сценарий 3) ──',
  );
  first = await launchAndAttach('после force-stop (напоминание)');
  const afterRelaunch = await waitFor('восстановление alarm после перезапуска', 20, 1000, () => {
    const lines = listSystemAlarms();
    return lines.length > 0 ? lines : null;
  });
  if (afterRelaunch === null) {
    fail(
      'после перезапуска приложения (после force-stop) `dumpsys alarm` пуст — реконсиляция при старте ' +
        '(`useBootstrapReminderReconciliation`, `App.tsx`) не восстановила напоминание, найденное отсутствующим ' +
        'в `listScheduled()` (Task A4, безусловный boot-скан).',
    );
  }
  if (afterRelaunch.length !== baselineCount) {
    fail(
      `после перезапуска число dumpsys-строк изменилось (было ${baselineCount}, стало ${afterRelaunch.length}) — ` +
        `реконсиляция задвоила alarm вместо чистой замены. Строки: ${JSON.stringify(afterRelaunch)}`,
    );
  }
  assertSameReminderRow(
    pullDatabase('after-force-stop-relaunch'),
    REMINDER_TASK_B,
    reminderB,
    'после force-stop+перезапуска',
  );
  console.log(
    `Alarm восстановлен реконсиляцией при старте, без задвоения (${afterRelaunch.length} строк).`,
  );

  console.log('── Step 6: BOOT_COMPLETED вместо полного `adb reboot` (claim #4) ──');
  // `adb reboot` — минуты на полный цикл эмулятора, бюджет дымового теста
  // не резиновый (см. заголовок этого блока и брифу задачи, Step 6): вместо
  // этого посылается ровно тот broadcast, на который реагируют И
  // собственный boot-restore плагина (`LocalNotificationRestoreReceiver`),
  // И реконсиляция этого приложения при старте (`App.tsx`, Task A4 Step 7)
  // — тот же реальный механизм, без ожидания настоящей перезагрузки ядра.
  //
  // `am force-stop` ПЕРЕД broadcast'ом — не необязательная предосторожность:
  // без него `monkey -c LAUNCHER` ниже, скорее всего, просто вернёт УЖЕ
  // ЖИВУЮ activity на передний план (`onResume`, не `onCreate`), а
  // `useBootstrapReminderReconciliation`'s `useEffect(…, [])` (`App.tsx`)
  // МОНТИРУЕТСЯ РОВНО ОДИН РАЗ и second раз не сработает — весь смысл Step 6
  // (реконсиляция на СТАРТЕ приложения) остался бы непроверенным, хотя тест
  // выглядел бы проходящим. Настоящая перезагрузка убивает КАЖДЫЙ процесс
  // без исключения — `force-stop` здесь эмулирует именно это, а не то же
  // самое, что claim #3's «Force Stop» (это отдельная, уже проверенная выше
  // claim'а; здесь force-stop — вспомогательный механизм постановки, а не
  // предмет проверки): пустой dumpsys сразу после него ожидаем и не
  // проверяется — assertion этого шага смотрит на состояние ПОСЛЕ broadcast
  // и релонча, а не в промежутке.
  async function broadcastBootCompletedAndRelaunch(label) {
    adb(['shell', 'am', 'force-stop', APPLICATION_ID], { stdio: 'inherit' });
    const stoppedForBoot = await waitFor(`остановку процесса перед ${label}`, 15, 500, () =>
      adbSoft(['shell', 'pidof', APPLICATION_ID]).trim() === '' ? true : null,
    );
    if (stoppedForBoot === null) fail(`${label}: процесс не остановился перед BOOT_COMPLETED`);
    adb(
      [
        'shell',
        'am',
        'broadcast',
        '-a',
        'android.intent.action.BOOT_COMPLETED',
        '-p',
        APPLICATION_ID,
      ],
      { stdio: 'inherit' },
    );
    await sleep(1500);
    first = await launchAndAttach(label);
    const lines = await waitFor(`восстановление alarm ${label}`, 20, 1000, () => {
      const current = listSystemAlarms();
      return current.length > 0 ? current : null;
    });
    if (lines === null) fail(`${label}: \`dumpsys alarm\` пуст для ${APPLICATION_ID}`);
    return lines;
  }

  const afterBoot1 = await broadcastBootCompletedAndRelaunch('после BOOT_COMPLETED #1');
  if (afterBoot1.length !== baselineCount) {
    fail(
      `после BOOT_COMPLETED #1 число dumpsys-строк изменилось: было ${baselineCount}, стало ${afterBoot1.length}`,
    );
  }
  const dbAfterBoot1 = inspectDatabase(pullDatabase('after-boot-1'));
  if (dbAfterBoot1.reminders !== remindersRowCountBaseline) {
    fail(
      `после BOOT_COMPLETED #1 число строк reminders изменилось (было ${remindersRowCountBaseline}, стало ` +
        `${dbAfterBoot1.reminders}) — реконсиляция при старте что-то создала или потеряла в хранилище.`,
    );
  }
  const idLines1 = linesWithNativeId(afterBoot1, reminderB.nativeId);
  if (idLines1.length === 0) {
    console.warn(
      `::warning::TODO(B8-controller): нативный id ${reminderB.nativeId} НЕ найден буквально ни в одной строке ` +
        'dumpsys после BOOT_COMPLETED #1 — см. комментарий у `linesWithNativeId` (best-effort, не главное ' +
        'доказательство claim #8 — им остаётся неизменный UUID в SQLite, проверенный ниже).',
    );
  }
  console.log(
    `После BOOT_COMPLETED #1: alarm восстановлен без задвоения (${afterBoot1.length} строк), reminders=` +
      `${dbAfterBoot1.reminders}.`,
  );

  console.log(
    '── Step 6b: повтор ×2 — плагин не воюет с нашей реконсиляцией, id стабилен (claims #5, #8) ──',
  );
  for (const label of ['после BOOT_COMPLETED #2', 'после BOOT_COMPLETED #3']) {
    const lines = await broadcastBootCompletedAndRelaunch(label);
    if (lines.length !== baselineCount) {
      fail(
        `${label}: число dumpsys-строк изменилось (было ${baselineCount}, стало ${lines.length}) — плагин и ` +
          'app-level реконсиляция задвоили alarm вместо согласованного результата (claim #5 брифа).',
      );
    }
    const cycleDbPath = pullDatabase(label.replace(/[^\p{L}\p{N}]+/gu, '-'));
    const cycleDb = inspectDatabase(cycleDbPath);
    if (cycleDb.reminders !== remindersRowCountBaseline) {
      fail(
        `${label}: число строк reminders в базе изменилось (было ${remindersRowCountBaseline}, стало ` +
          `${cycleDb.reminders})`,
      );
    }
    assertSameReminderRow(cycleDbPath, REMINDER_TASK_B, reminderB, label);
    const idLines = linesWithNativeId(lines, reminderB.nativeId);
    if (idLines.length === 0) {
      console.warn(
        `::warning::TODO(B8-controller): нативный id не найден в тексте dumpsys (${label}).`,
      );
    }
  }
  console.log(
    'Claims #5/#8: alarm и UUID напоминания стабильны через три цикла BOOT_COMPLETED+перезапуск.',
  );

  console.log(
    '── Step 7: BOOT_COMPLETED не создаёт шторм alarm (сужено намеренно) ──\n' +
      '   Полное доказательство «просроченное напоминание не реплеится штормом» — юнит-тест Task A3\n' +
      '   (`reminder-reconciliation.test.ts`, третий тест-кейс Step 3 того брифа): там желаемое напоминание в\n' +
      '   прошлом относительно `nowLocal` НЕ реплеится, доказано юнит-тестом, не догадкой на эмуляторе. Здесь\n' +
      '   честно доступна только БОЛЕЕ УЗКАЯ проверка проводки: ещё один цикл BOOT_COMPLETED не раздувает число\n' +
      '   dumpsys-строк сверх уже установленного baseline. Это подстраховка «проводка не сломана на глаз», а не\n' +
      '   замена юнит-теста — сама эта разница явно задокументирована брифом задачи, не забыта здесь.',
  );
  const afterBoot4 = await broadcastBootCompletedAndRelaunch(
    'после BOOT_COMPLETED #4 (Step 7, sanity)',
  );
  if (afterBoot4.length !== baselineCount) {
    fail(
      `Step 7: после ещё одного BOOT_COMPLETED число dumpsys-строк не равно baseline (${baselineCount} → ` +
        `${afterBoot4.length}) — похоже на шторм повторного планирования.`,
    );
  }
  console.log('Step 7: шторма нет — число alarm по-прежнему равно baseline.');

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

  // `let` — Step 9b (Task B8) переприсваивает после смены таймзоны.
  let second = await launchAndAttach('после перезапуска');

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
    'reminders',
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
  // Task B8, Step 8 — сначала убедиться, что ЕСТЬ что стирать: «Напоминание
  // переживает перезапуск» (Блок B выше) пережило и force-stop, и три
  // цикла BOOT_COMPLETED — к этому моменту его alarm обязан быть на месте.
  // Без этой проверки пустой dumpsys ПОСЛЕ стирания ничего не доказывал бы
  // — alarm мог быть пуст и ДО кнопки «Удалить всё» по совсем другой причине.
  const beforeEraseAlarms = listSystemAlarms();
  if (beforeEraseAlarms.length === 0) {
    fail(
      'перед M52-стиранием `dumpsys alarm` уже пуст — проверка «M52 отменяет alarm» ниже была бы ' +
        'бессодержательной (нечего стирать). Напоминание Блока B должно было пережить force-stop/reboot выше.',
    );
  }
  console.log(`Перед стиранием: ${beforeEraseAlarms.length} строк dumpsys alarm.`);

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
  // `reminders` (Task B8, Step 8) — та же форма проверки, что и остальные:
  // `eraseAllLocalData()` чистит ТОЛЬКО SQLite/IndexedDB, но НЕ трогает
  // платформенный scheduler сама по себе (`DataPrivacy.tsx`, комментарий
  // «Реконсиляция напоминаний ПОСЛЕ стирания», Task B5 путь #6) — это
  // делает отдельный вызов `reconcileReminderSchedule(...)` СРАЗУ после
  // `eraseAllLocalData()` в том же `erase()`, УЖЕ реализованный Task B5 (НЕ
  // работа этой задачи, см. брифу Step 8 — «STALE PARAGRAPH REMOVED»). Этот
  // блок — эмпирическая проверка того фикса на реальном устройстве, не его
  // реализация.
  const dirty = Object.entries({
    tasks: erased.tasks,
    tombstones: erased.tombstones,
    labels: erased.labels,
    taskLabels: erased.taskLabels,
    recurrenceSeries: erased.recurrenceSeries,
    outbox: erased.outbox,
    reminders: erased.reminders,
  }).filter(([, count]) => count !== 0);
  if (dirty.length > 0) {
    fail(
      `eraseAllLocalData не очистила нативную базу: ${dirty.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    );
  }
  if (!erased.tables.includes('tasks')) {
    fail('после стирания в базе нет таблиц — стёрта схема, а не данные');
  }
  console.log('Стирание очистило данные (включая reminders) и сохранило схему.');

  // Task B8, Step 8 — «M52 удаляет alarm'ы» в буквальном, брифом заданном
  // смысле: НЕ строка `reminders=0` выше (это про SQLite), а реальный
  // `dumpsys alarm`, пустой для пакета. Если Task B5's `reconcileReminderSchedule`
  // после `eraseAllLocalData()` почему-то не отменила реальный OS-level
  // alarm на устройстве — это провал уровня «уведомление сработает на уже
  // стёртой задаче», и это должно быть видно здесь громко, а не тихо
  // замаскировано прошедшей проверкой SQLite.
  const alarmsAfterErase = listSystemAlarms();
  if (alarmsAfterErase.length > 0) {
    fail(
      'M52 (стирание локальных данных) НЕ очистило реальный OS-level alarm: `dumpsys alarm` всё ещё показывает ' +
        `${alarmsAfterErase.length} строк(и) ${APPLICATION_ID} ПОСЛЕ «Удалить всё», хотя Task B5's ` +
        '`reconcileReminderSchedule(...)` вызывается сразу после `eraseAllLocalData()` в `DataPrivacy.tsx` ' +
        '`erase()`. Это РЕГРЕСС/незакрытый разрыв между уровнями (SQLite чист, планировщик — нет), а не повод ' +
        `тихо чинить под давлением времени смоука. Строки: ${JSON.stringify(alarmsAfterErase)}`,
    );
  }
  console.log('M52 подтверждён на OS-уровне: `dumpsys alarm` для пакета пуст после стирания.');

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

  // Task B8, Step 9 — «scheduler снова пригоден для работы» ПОСЛЕ M52,
  // сделано конкретным: не просто новая строка задачи (уже проверено выше),
  // а НОВАЯ строка `reminders` И новый реальный OS-level alarm. Свежая
  // задача без истории отмен (та же причина, что у `REMINDER_TASK_B` —
  // `countExplicitByTask` не в игре, здесь и так пусто после стирания).
  console.log('── Step 9: напоминание снова планируется после стирания ──');
  if ((await second.cdp.evaluate(openTaskRow(AFTER_ERASE_TASK))) !== true) {
    fail(`строка задачи «${AFTER_ERASE_TASK}» не открылась после стирания`);
  }
  await sleep(1200);
  if ((await second.cdp.evaluate(clickByText('Добавить напоминание'))) !== true) {
    fail('кнопка «Добавить напоминание» не найдена после стирания (Step 9)');
  }
  await sleep(900);
  if ((await second.cdp.evaluate(selectTodayInDateGrid)) !== true) {
    fail('ячейка «сегодня» не найдена после стирания (Step 9)');
  }
  await sleep(500);
  await pickReminderTime(second, 15);
  if ((await second.cdp.evaluate(clickByText('Сохранить', { exact: true }))) !== true) {
    fail('кнопка «Сохранить» не найдена после стирания (Step 9)');
  }

  const afterEraseAlarm = await waitFor('OS-level alarm после стирания', 20, 1000, () => {
    const lines = listSystemAlarms();
    return lines.length > 0 ? lines : null;
  });
  if (afterEraseAlarm === null) {
    fail(
      'после стирания новое напоминание не создало ни одной записи `dumpsys alarm` — планировщик НЕ пригоден ' +
        'для работы после M52, хотя SQLite-запись создаётся.',
    );
  }
  const dbPathAfterEraseReminder = pullDatabase('after-erase-reminder');
  const dbAfterEraseReminder = inspectDatabase(dbPathAfterEraseReminder);
  const reminderAfterErase = readEnabledReminder(dbPathAfterEraseReminder, AFTER_ERASE_TASK);
  if (dbAfterEraseReminder.reminders < 1) {
    fail(`после стирания новая строка reminders не появилась: ${dbAfterEraseReminder.reminders}`);
  }
  if (reminderAfterErase === null) {
    fail('после стирания в базе нет включённого explicit-напоминания для новой задачи');
  }
  console.log(
    `Step 9 подтверждён: reminders=${dbAfterEraseReminder.reminders}, ` +
      `dumpsys-строк=${afterEraseAlarm.length}, id=${reminderAfterErase.id}.`,
  );

  // Task B8, Step 9b — плагин не создаёт конфликта с нашей timezone-семантикой
  // (claim #9, `01§19`, Task A5). `Schedule.at(date, …)` плагина принимает
  // голый JS `Date` — АБСОЛЮТНЫЙ instant без понятия часового пояса; после
  // смены зоны устройства нативный alarm остаётся на СТАРОМ instant, пока
  // что-то явно не пересчитает и не переотправит его — ровно для этого
  // существует стартовая (не foreground) реконсиляция Task A5. Проверяется
  // здесь против РЕАЛЬНОГО `AlarmManager`, а не только против JS-вывода
  // `reconcileReminderSchedule`.
  console.log('── Step 9b: смена таймзоны — реконсиляция пересчитывает alarm (claim #9) ──');
  if ((await second.cdp.evaluate(clickByText('Готово', { exact: true }))) !== true) {
    fail('кнопка «Готово» карточки не найдена перед Step 9b');
  }
  await sleep(900);
  const beforeTzChange = listSystemAlarms();
  const beforeTzSnapshots = beforeTzChange.map(parseTriggerSnapshot);
  const originalTimezone = adbSoft(['shell', 'settings', 'get', 'global', 'time_zone']).trim();
  const NEW_TIMEZONE = 'Asia/Tokyo';
  if (originalTimezone === '' || originalTimezone === 'null') {
    console.warn(
      '::warning::Step 9b: не удалось прочитать текущий часовой пояс устройства ' +
        '(`adb shell settings get global time_zone` вернул пусто/null) — восстановление в конце шага пропущено, ' +
        'TODO(B8-controller): проверить вручную на живом прогоне, что это не оставляет эмулятор в ' +
        `${NEW_TIMEZONE} для последующих прогонов CI.`,
    );
  }
  adb(['shell', 'settings', 'put', 'global', 'time_zone', NEW_TIMEZONE], { stdio: 'inherit' });
  await sleep(1000);

  second.cdp.close();
  // Task A5's детекция — старт-only (её собственное задокументированное
  // ограничение, нет foreground-слушателя в объёме этого плана): проверка
  // «применилось» держится на том, что `useBootstrapReminderReconciliation`
  // (`App.tsx`) реально ЗАМОНТИРУЕТСЯ ЗАНОВО, а не только на видимости
  // экрана. `monkey -c LAUNCHER` по уже живому процессу вернул бы старую
  // activity через `onResume`, а не `onCreate` — `useEffect(…, [])`
  // повторно НЕ сработал бы, и вся проверка молча стала бы бессодержательной
  // (та же ловушка, что чинит `force-stop` перед broadcast в Step 6 выше —
  // см. её комментарий). `am force-stop` здесь — тот же приём: гарантирует
  // НАСТОЯЩИЙ новый процесс, не «проверить, что можно».
  adb(['shell', 'am', 'force-stop', APPLICATION_ID], { stdio: 'inherit' });
  const stoppedForTz = await waitFor('остановку процесса перед сменой пояса', 15, 500, () =>
    adbSoft(['shell', 'pidof', APPLICATION_ID]).trim() === '' ? true : null,
  );
  if (stoppedForTz === null)
    fail('Step 9b: процесс не остановился перед перезапуском со сменой пояса');
  second = await launchAndAttach('после смены часового пояса');
  const afterTzChange = await waitFor(
    'пересчитанный alarm после смены часового пояса',
    20,
    1000,
    () => {
      const lines = listSystemAlarms();
      return lines.length > 0 ? lines : null;
    },
  );
  if (afterTzChange === null) {
    fail(
      'после смены часового пояса и перезапуска `dumpsys alarm` пуст — реконсиляция Task A5 потеряла ' +
        'напоминание вместо того, чтобы пересчитать его на новый instant.',
    );
  }
  if (afterTzChange.length !== beforeTzChange.length) {
    fail(
      `после смены часового пояса число dumpsys-строк изменилось (было ${beforeTzChange.length}, стало ` +
        `${afterTzChange.length}) — реконсиляция задвоила alarm вместо замены (claim #9, вторая половина). ` +
        `До: ${JSON.stringify(beforeTzChange)}. После: ${JSON.stringify(afterTzChange)}`,
    );
  }
  const afterTzSnapshots = afterTzChange.map(parseTriggerSnapshot);
  const tzChangeConfirmed = afterTzSnapshots.some((after) =>
    beforeTzSnapshots.some((before) => triggerChanged(before, after) === true),
  );
  const tzChangeInconclusive = afterTzSnapshots.every((after) =>
    beforeTzSnapshots.every((before) => triggerChanged(before, after) === null),
  );
  if (tzChangeInconclusive) {
    console.warn(
      '::warning::Step 9b (claim #9): не удалось распарсить триггерное время dumpsys ни до, ни после смены ' +
        'часового пояса — TODO(B8-controller), см. `parseTriggerSnapshot`. Задвоение исключено (число строк ' +
        `не выросло), но сам пересчёт instant текстово не подтверждён. До: ${JSON.stringify(beforeTzChange)}. ` +
        `После: ${JSON.stringify(afterTzChange)}`,
    );
  } else if (!tzChangeConfirmed) {
    fail(
      `после смены часового пояса триггерное время В ДАМПЕ не изменилось — нативный alarm остался на старом ` +
        `instant (ровно тот баг, ради которого существует Task A5). До: ${JSON.stringify(beforeTzChange)}. ` +
        `После: ${JSON.stringify(afterTzChange)}`,
    );
  } else {
    console.log('Step 9b подтверждён: триггерное время в dumpsys пересчитано, alarm не задвоен.');
  }

  if (originalTimezone !== '' && originalTimezone !== 'null') {
    adb(['shell', 'settings', 'put', 'global', 'time_zone', originalTimezone], {
      stdio: 'inherit',
    });
    console.log(`Часовой пояс восстановлен: ${originalTimezone}.`);
  }

  second.cdp.close();

  console.log(
    'Дымовой тест пройден: приложение запускается на НАТИВНОЙ SQLite, рисует продукт, ' +
      'создаёт задачи, иерархию, метки, повтор и tombstone — всё это лежит в файле базы ' +
      'в app-private каталоге, переживает закрытие приложения, стирается по требованию ' +
      'и продолжает работать после стирания.',
  );
}

await main();
