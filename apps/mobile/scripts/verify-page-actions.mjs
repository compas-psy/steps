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
  READ_DEVICE_TIME,
  READ_STORAGE_STATE,
  READ_TASK_ROW_TITLES,
  selectDialOption,
  selectTodayInDateGrid,
  typeIntoFirstInput,
  typeIntoLabeled,
} from './page-actions.mjs';

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/';
const TASK = 'Проверка сборки';
const LIVE_SUBTASK = 'Живая подзадача';
const DOOMED_SUBTASK = 'Лишняя подзадача';
const RECURRING = 'Полить цветы каждый день @дом';
const RECURRING_TITLE = 'Полить цветы';
const AFTER_ERASE = 'Задача после стирания';

// ── Константы короткой приёмки (`android-acceptance.mjs`) ──────────────────
// Дословно те же строки, что в самом сценарии: если они разойдутся, эта
// проверка перестанет проверять именно его.
const CONTROL_PHRASE = '9 сентября в 11:00 Сходить с мамой в МВД';
const CONTROL_TITLE = 'Сходить с мамой в МВД';
const CONTROL_DATE_CHIP = '9 сентября';
const CONTROL_TIME_CHIP = '11:00';
const TASK_CARD_DONE = 'Готово';
const SEARCH_TAB = 'Поиск';
const SEARCH_INPUT_LABEL = 'Поиск по задачам, проектам и меткам';

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

// ── Напоминание (Task B8, Steps 2/3/4): та же разметка `DatePicker`/
// `TimePicker`, что и на Android — только реальный `dumpsys alarm` здесь
// проверить нечем (`android-smoke.mjs` — единственное место с настоящим
// `AlarmManager`), но селекторы календарной сетки/циферблата и текстовые
// переходы empty→chip→empty те же самые, и ошибка в них здесь ловится за
// секунды, а не десятиминутным циклом эмулятора.
/** Паддинг до двух разрядов — вынесена из `pickNearFutureTime` в область
 * модуля (`oxlint` `unicorn/consistent-function-scoping`), та же причина,
 * что у `pad2` в `android-smoke.mjs`. */
function pad2(value) {
  return String(value).padStart(2, '0');
}

async function pickNearFutureTime(minutesAhead) {
  const now = JSON.parse(String(await run(READ_DEVICE_TIME)));
  const total = now.hour * 60 + now.minute + minutesAhead;
  const rounded = Math.ceil(total / 5) * 5;
  const hour = Math.floor(rounded / 60) % 24;
  const minute = rounded % 60;
  const pad = pad2;
  await run(selectDialOption('Часы', pad(hour)));
  await wait(200);
  await run(selectDialOption('Минуты', pad(minute)));
  await wait(200);
}

check(
  'пустое состояние напоминания перед добавлением',
  String(await run(READ_APP_TEXT)).includes('Нет напоминания'),
);
check('кнопка «Добавить напоминание»', (await run(clickByText('Добавить напоминание'))) === true);
await wait(700);
check('сегодняшняя ячейка в сетке дат', (await run(selectTodayInDateGrid)) === true);
await wait(400);
await pickNearFutureTime(5);
check(
  'кнопка «Сохранить» напоминания',
  (await run(clickByText('Сохранить', { exact: true }))) === true,
);
await wait(1000);
check(
  'напоминание создано — пустое состояние исчезло',
  !String(await run(READ_APP_TEXT)).includes('Нет напоминания'),
);

check('кнопка «Изменить напоминание»', (await run(clickByText('Изменить напоминание'))) === true);
await wait(700);
await pickNearFutureTime(20);
check(
  'кнопка «Сохранить» изменённого напоминания',
  (await run(clickByText('Сохранить', { exact: true }))) === true,
);
await wait(1000);
check(
  'напоминание после изменения всё ещё не в пустом состоянии',
  !String(await run(READ_APP_TEXT)).includes('Нет напоминания'),
);

check('кнопка «Отменить напоминание»', (await run(clickByText('Отменить напоминание'))) === true);
await wait(1000);
check(
  'напоминание отменено — пустое состояние вернулось',
  String(await run(READ_APP_TEXT)).includes('Нет напоминания'),
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
// Строка списка, не весь текст страницы: ровно то выражение, которым
// дымовой тест Android дожидается персистентной записи (не живого
// предпросмотра `ParsingPreview` внутри ещё открытого Quick Add) —
// разбор случая, где это разошлось, в комментарии `android-smoke.mjs`
// рядом с `READ_TASK_ROW_TITLES`.
check(
  'повторяющаяся задача — строка списка, не предпросмотр формы',
  String(await run(READ_TASK_ROW_TITLES)).includes(RECURRING_TITLE),
);

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

// ── Короткая приёмка (`android-acceptance.mjs`) — её собственный путь ──────
//
// Всё, что до этой черты, повторяет длинный смоук. Ниже — шаги, которых у
// него нет и которые иначе впервые исполнились бы на эмуляторе: открытие
// задачи через «Поиск» (у смоука задача открывается из «Сегодня»), подписи
// чипов контрольной фразы и признак возврата из карточки по системной
// «Назад». Эмулятора у автора сценария нет; здесь эти выражения проходят
// на настоящей веб-сборке того же продукта за секунды.
check('кнопка «Понятно» после стирания', (await run(clickByText('Понятно'))) === true);
await wait(1200);

check(
  'кнопка быстрого добавления (контрольная фраза)',
  (await run(clickByLabel('Быстрое добавление'))) === true,
);
await wait(900);
check(
  'поле Quick Add (контрольная фраза)',
  (await run(typeIntoFirstInput(CONTROL_PHRASE))) === true,
);
await wait(900);

// Чипы предпросмотра ДО создания — обе половины утверждения приёмки.
const previewText = String(await run(READ_APP_TEXT));
check(
  `чип даты «${CONTROL_DATE_CHIP}» в предпросмотре`,
  previewText.includes(CONTROL_DATE_CHIP),
  previewText.slice(0, 200),
);
check(
  `чип времени «${CONTROL_TIME_CHIP}» в предпросмотре`,
  previewText.includes(CONTROL_TIME_CHIP),
);
check(
  'предпросмотр — не уже созданная задача: строки списка с этим названием ещё нет',
  !String(await run(READ_TASK_ROW_TITLES)).includes(CONTROL_TITLE),
);

check(
  'кнопка «Добавить задачу» в Quick Add (контрольная фраза)',
  (await run(clickByLabel('Добавить задачу'))) === true,
);
await wait(1600);

// Задача на 9 сентября на «Сегодня» не появляется — ровно поэтому короткая
// приёмка открывает её через «Поиск».
check(
  'контрольной задачи нет в списке «Сегодня» (дата будущая)',
  !String(await run(READ_TASK_ROW_TITLES)).includes(CONTROL_TITLE),
  String(await run(READ_TASK_ROW_TITLES)).slice(0, 200),
);

check(
  'пункт «Поиск» нижней навигации',
  (await run(clickByText(SEARCH_TAB, { exact: true }))) === true,
);
await wait(900);
check('поле поиска', (await run(typeIntoLabeled(SEARCH_INPUT_LABEL, CONTROL_TITLE))) === true);
await wait(1200);
check(
  'контрольная задача найдена поиском',
  String(await run(READ_TASK_ROW_TITLES)).includes(CONTROL_TITLE),
  String(await run(READ_TASK_ROW_TITLES)).slice(0, 200),
);
check('строка результата открывает карточку', (await run(openTaskRow(CONTROL_TITLE))) === true);
await wait(1200);
check(
  'в открытой карточке есть «Готово»',
  String(await run(READ_APP_TEXT)).includes(TASK_CARD_DONE),
);

// Системная «Назад» на Android приходит в страницу тем же `popstate`, что и
// браузерная (`packages/app/src/state/back-navigation.ts`) — значит признак
// возврата проверяем здесь, а не только на устройстве.
await page.goBack();
await wait(1200);
const afterBackText = String(await run(READ_APP_TEXT));
check(
  'после «Назад» кнопки «Готово» нет — карточка закрыта',
  !afterBackText.includes(TASK_CARD_DONE),
  afterBackText.slice(0, 200),
);
check(
  'после «Назад» видна нижняя навигация — вернулись в список',
  afterBackText.includes(SEARCH_TAB),
);

await browser.close();
console.log(failures === 0 ? '\nВсе выражения страницы работают.' : `\nНе сработало: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
