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
import { setTimeout as sleep } from 'node:timers/promises';

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
 * возрастающему `id`. Полноценная библиотека здесь избыточна — нужен ровно
 * `Runtime.evaluate`. */
function createCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('WebSocket DevTools не открылся')));
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const resolver = pending.get(message.id);
    if (resolver === undefined) return;
    pending.delete(message.id);
    resolver(message);
  });

  return {
    ready,
    close: () => socket.close(),
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

// --- Выражения, исполняемые внутри страницы ---------------------------------

/** Видимый текст продукта. Пустая строка = белый экран. */
const READ_APP_TEXT = `
  (() => {
    const root = document.querySelector('[data-shagi-app-root]');
    return root === null ? '' : (root.innerText || '').trim();
  })()
`;

/** Нажимает кнопку по её видимому тексту. Возвращает `true`, если нашлась. */
function clickByText(text) {
  return `
    (() => {
      const wanted = ${JSON.stringify(text)};
      const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
      const target = nodes.find((node) => (node.innerText || '').trim().includes(wanted));
      if (!target) return false;
      target.click();
      return true;
    })()
  `;
}

/** Пишет в поле ввода так, как это делает человек: через нативный сеттер
 * значения плюс событие `input`. Прямое `input.value = …` React не заметит —
 * он слушает свой синтетический `onChange` поверх нативного события. */
function typeIntoFirstInput(text) {
  return `
    (() => {
      const input = document.querySelector('input[type="text"], input:not([type]), textarea');
      if (!input) return false;
      const prototype = input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `;
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
    fail(
      `WebView отрисовал ПУСТОЙ экран (${label}): в [data-shagi-app-root] нет ни одного видимого символа`,
    );
  }
  console.log(`Видимый текст: ${JSON.stringify(screen.slice(0, 120))}`);

  return { cdp, screen };
}

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
  second.cdp.close();

  console.log(
    'Дымовой тест пройден: приложение запускается, рисует продукт, создаёт задачу — ' +
      'и задача остаётся на месте после закрытия приложения.',
  );
}

await main();
