#!/usr/bin/env node
/**
 * Локальная проверка выражений страницы (`./page-actions.mjs`) на
 * ВЕБ-сборке продукта.
 *
 * Зачем: дымовой тест Android — единственное место, где эти выражения
 * работают по-настоящему, но эмулятор поднимается только в CI и стоит
 * минуты. Ошибка в селекторе («Добавить» попадает в «Добавить дату»)
 * обнаруживалась бы там, а чинилась бы циклами по десять минут. Здесь тот
 * же сценарий проходится за секунды, теми же строками кода.
 *
 * Что НЕ проверяется здесь и остаётся за эмулятором: сам backend
 * (в вебе он IndexedDB), файл базы, перезапуск процесса. Это про
 * платформу, а не про DOM.
 *
 * Запуск: `node apps/mobile/scripts/verify-page-actions.mjs [url]`
 * (по умолчанию `http://127.0.0.1:4173/` — `pnpm --filter @shagi/web preview`).
 */
// `@playwright/test`, а не `playwright`: в этом воркспейсе второй пакет —
// транзитивная зависимость первого и из `apps/mobile` не резолвится
// (поймано CI, а не догадкой). Версия закреплена точкой по той же причине,
// что в `apps/web/playwright.config.ts`: браузер в контейнере один и тот же.
import { chromium } from '@playwright/test';

import {
  clickByLabel,
  clickByText,
  openTaskRow,
  READ_APP_TEXT,
  READ_STORAGE_STATE,
  typeIntoFirstInput,
  typeIntoLabeled,
} from './page-actions.mjs';

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/';
const TASK = 'Проверка сборки';
const LIVE_SUBTASK = 'Живая подзадача';
const DOOMED_SUBTASK = 'Лишняя подзадача';
const RECURRING = 'Полить цветы каждый день @дом';
const AFTER_ERASE = 'Задача после стирания';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'ПЛОХО'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser
  .newContext({ viewport: { width: 420, height: 900 } })
  .then((c) => c.newPage());
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
const run = (expression) => page.evaluate(`(${expression})`);
const wait = (ms = 700) => page.waitForTimeout(ms);

await page.goto(URL, { waitUntil: 'load' });
await wait(900);

check('приложение отрисовало непустой экран', String(await run(READ_APP_TEXT)).length > 0);
check('кнопка «Начать»', (await run(clickByText('Начать'))) === true);
await wait(900);
check('поле первой задачи', (await run(typeIntoFirstInput(TASK))) === true);
await wait(400);
check('кнопка «Добавить задачу»', (await run(clickByText('Добавить задачу'))) === true);
await wait(1200);
check('кнопка «Понятно»', (await run(clickByText('Понятно'))) === true);
await wait(1200);
check('задача видна на Today', String(await run(READ_APP_TEXT)).includes(TASK));

check('строка задачи открывает карточку', (await run(openTaskRow(TASK))) === true);
await wait(1000);
check(
  'в карточке есть раздел планирования',
  String(await run(READ_APP_TEXT)).includes('ПЛАНИРОВАНИЕ'),
);

for (const subtask of [LIVE_SUBTASK, DOOMED_SUBTASK]) {
  check(
    `поле «Новая подзадача» (${subtask})`,
    (await run(typeIntoLabeled('Новая подзадача', subtask))) === true,
  );
  await wait(400);
  check(
    `кнопка «Добавить» подзадачи (${subtask})`,
    (await run(clickByText('Добавить', { exact: true }))) === true,
  );
  await wait(900);
  check(`подзадача «${subtask}» появилась`, String(await run(READ_APP_TEXT)).includes(subtask));
}

check(
  'кнопка удаления подзадачи',
  (await run(clickByLabel(`Удалить подзадачу «${DOOMED_SUBTASK}»`))) === true,
);
await wait(900);
check('удалённая подзадача исчезла', !String(await run(READ_APP_TEXT)).includes(DOOMED_SUBTASK));

check('кнопка «Готово» карточки', (await run(clickByText('Готово', { exact: true }))) === true);
await wait(1000);

check('кнопка быстрого добавления', (await run(clickByLabel('Быстрое добавление'))) === true);
await wait(900);
check('поле Quick Add', (await run(typeIntoFirstInput(RECURRING))) === true);
await wait(800);
// В Quick Add это кнопка-иконка: видимого текста нет, имя — в `aria-label`.
check(
  'кнопка «Добавить задачу» в Quick Add',
  (await run(clickByLabel('Добавить задачу'))) === true,
);
await wait(1400);

check('состояние хранилища читается', String(await run(READ_STORAGE_STATE)).includes('origin'));

check('кнопка «Настройки»', (await run(clickByLabel('Настройки'))) === true);
await wait(900);
check(
  'строка «Данные и конфиденциальность»',
  (await run(clickByText('Данные и конфиденциальность'))) === true,
);
await wait(900);
check(
  'кнопка удаления локальных данных',
  (await run(clickByText('Удалить', { exact: true }))) === true,
);
await wait(700);
check('подтверждение «Удалить всё»', (await run(clickByText('Удалить всё'))) === true);
await wait(1800);

check('после стирания показано приветствие', (await run(clickByText('Начать'))) === true);
await wait(900);
check('поле первой задачи после стирания', (await run(typeIntoFirstInput(AFTER_ERASE))) === true);
await wait(400);
check(
  'кнопка «Добавить задачу» после стирания',
  (await run(clickByText('Добавить задачу'))) === true,
);
await wait(1200);

await browser.close();
console.log(failures === 0 ? '\nВсе выражения страницы работают.' : `\nНе сработало: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
