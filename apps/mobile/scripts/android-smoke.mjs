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
 * ── Чего здесь НЕТ и почему ────────────────────────────────────────────────
 *
 * Проверки «закрыть приложение, открыть заново, задача на месте» здесь нет
 * СОЗНАТЕЛЬНО: `apps/mobile/src/main.tsx` передаёт `storageBackend:
 * {kind:'memory'}` — на Android персистентности пока не существует вовсе
 * (ждёт Tauri SQL-плагина, см. комментарий в самом `main.tsx` и
 * `packages/app/src/state/storage-backend.ts`). Тест, который «проверяет»
 * переживание перезапуска там, где хранилище заведомо в памяти, был бы
 * фикцией: он либо всегда красный, либо проверяет не то, что называет.
 * Как только появится настоящий адаптер — сюда добавляется шаг
 * `am force-stop` + повторный `am start` + поиск той же задачи.
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
function findDevtoolsSocket() {
  const lines = adb(['shell', 'cat', '/proc/net/unix']).split('\n');
  for (const line of lines) {
    const match = /(webview_devtools_remote_\d+)/.exec(line);
    if (match !== null) return match[1];
  }
  return null;
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

async function main() {
  const taskTitle = 'Проверка сборки';

  console.log('── Установка APK ──');
  const apkPath = process.argv[2];
  if (apkPath === undefined) fail('не передан путь к APK: node android-smoke.mjs <путь.apk>');
  adb(['install', '-r', apkPath], { stdio: 'inherit' });

  console.log('── Запуск приложения ──');
  // `monkey` с категорией LAUNCHER, а не `am start -n <id>/.MainActivity`:
  // имя класса активности задаёт шаблон Tauri, и привязываться к нему —
  // значит красить тест при обновлении шаблона. Здесь запускается ровно то,
  // что запустил бы человек с домашнего экрана.
  adb(['shell', 'monkey', '-p', APPLICATION_ID, '-c', 'android.intent.category.LAUNCHER', '1'], {
    stdio: 'inherit',
  });

  const pid = await waitFor('процесс приложения', 30, 1000, () => {
    const found = adb(['shell', 'pidof', APPLICATION_ID]).trim();
    return found === '' ? null : found.split(/\s+/u)[0];
  });
  if (pid === null) fail('приложение не запустилось: процесс не появился');
  console.log(`Процесс жив, pid=${pid}`);

  const socket = await waitFor('сокет DevTools', 30, 1000, findDevtoolsSocket);
  if (socket === null) {
    fail(
      'WebView не открыл сокет отладки. В debug-сборке его включает сам wry — ' +
        'если сокета нет, значит WebView не создан вовсе (приложение упало на старте).',
    );
  }
  adb(['forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:${socket}`]);

  const target = await waitFor('WebView в DevTools', 30, 1000, findWebViewTarget);
  if (target === null) {
    fail(`сокет ${socket} открыт, но страницы в нём нет: WebView создан, а документ не загрузился`);
  }
  console.log(`WebView найден: ${target.url}`);

  const cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.ready;

  console.log('── Экран не пустой ──');
  const firstScreen = await waitFor('первый отрисованный экран', 30, 1000, async () => {
    const text = await cdp.evaluate(READ_APP_TEXT);
    return typeof text === 'string' && text.length > 0 ? text : null;
  });
  if (firstScreen === null) {
    fail('WebView отрисовал ПУСТОЙ экран: в [data-shagi-app-root] нет ни одного видимого символа');
  }
  console.log(`Видимый текст: ${JSON.stringify(firstScreen.slice(0, 120))}`);

  console.log('── Онбординг: «Начать» ──');
  if ((await cdp.evaluate(clickByText('Начать'))) !== true) {
    fail(
      `кнопка «Начать» не найдена. Экран показывает: ${JSON.stringify(firstScreen.slice(0, 200))}`,
    );
  }
  await sleep(1200);

  console.log('── Создание настоящей задачи ──');
  if ((await cdp.evaluate(typeIntoFirstInput(taskTitle))) !== true) {
    fail('поле ввода первой задачи не найдено');
  }
  await sleep(400);
  if ((await cdp.evaluate(clickByText('Добавить задачу'))) !== true) {
    fail('кнопка «Добавить задачу» не найдена');
  }
  await sleep(1500);

  console.log('── Проход до Today ──');
  if ((await cdp.evaluate(clickByText('Понятно'))) !== true) {
    fail('кнопка «Понятно» (экран разбора русского текста) не найдена');
  }
  await sleep(1500);

  const todayText = await cdp.evaluate(READ_APP_TEXT);
  if (typeof todayText !== 'string' || !todayText.includes(taskTitle)) {
    fail(
      `созданной задачи «${taskTitle}» нет на экране Today. Экран показывает: ` +
        JSON.stringify(String(todayText).slice(0, 300)),
    );
  }
  console.log(`Задача «${taskTitle}» видна на Today.`);

  // Приложение не должно было умереть по дороге.
  const alive = adb(['shell', 'pidof', APPLICATION_ID]).trim();
  if (alive === '') fail('приложение упало в процессе сценария');

  cdp.close();
  console.log('Дымовой тест пройден: приложение запускается, рисует продукт и создаёт задачу.');
}

await main();
