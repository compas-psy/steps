#!/usr/bin/env node
/**
 * КОРОТКАЯ приёмка собранного APK на эмуляторе: Quick Add и персистентность.
 *
 * ── Зачем отдельный сценарий рядом с длинным смоуком ───────────────────────
 *
 * `android-smoke.mjs` проверяет полтора десятка свойств продукта за один
 * проход и из-за этого падает в НЕСВЯЗАННЫХ местах: три прогона — три
 * разные точки отказа. Такой отчёт не отвечает на вопрос «работает ли то,
 * ради чего продукт существует», он отвечает «сегодня не повезло вот тут».
 * Владелец продукта постановил: длинный сценарий больше не блокер, а
 * блокером становится вот этот — ровно два свойства, ни одного лишнего
 * утверждения, каждый шаг понятен без чтения истории прогонов.
 *
 * ── Что именно доказывается ────────────────────────────────────────────────
 *
 *  1. Приложение запускается и рисует продукт (`launchAndAttach`).
 *  2. Quick Add открывается.
 *  3. В него вводится контрольная фраза владельца.
 *  4. Чипы предпросмотра показывают `9 сентября` и `11:00` ДО создания.
 *  5. Задача создаётся.
 *  6. В НАСТОЯЩЕЙ SQLite на устройстве лежат `title`/`planned_date`/
 *     `planned_time` — не то, что нарисовано на экране.
 *  7. Задача открывается НЕ через «Сегодня» (через «Поиск») — на «Сегодня»
 *     её нет, дата будущая.
 *  8. Аппаратная «Назад» закрывает карточку и НЕ закрывает приложение.
 *  9. `am force-stop` — приложение убито, а не свёрнуто.
 * 10. Повторный запуск.
 * 11. В SQLite та же задача с ТЕМИ ЖЕ полями.
 *
 * Каждое утверждение обязано быть РАЗЛИЧАЮЩИМ — то есть уметь покраснеть.
 * Разбор ошибки, которую здесь нельзя повторять, — у шага 8: заголовком
 * открытой задачи возврат в список НЕ доказывается. Заголовок виден и до,
 * и после «Назад» (в длинном смоуке — потому что задача есть в списке, из
 * которого её открыли), так что проверка «заголовок на экране» прошла бы и
 * в случае, когда «Назад» не сделала ничего. Признаком закрытой карточки
 * может быть только ИСЧЕЗНОВЕНИЕ того, что есть исключительно в ней —
 * кнопки «Готово»; признаком возврата именно в СПИСОК — появление нижней
 * навигации, которой в карточке нет.
 *
 * Обе половины измерены на веб-сборке того же продукта
 * (`verify-page-actions.mjs`), а не предположены: в видимом тексте карточки
 * нет ни заголовка задачи (он живёт в поле ввода, `innerText` значений не
 * видит), ни пункта «Поиск», а после «Назад» — наоборот. Проверено и
 * обратное: если «Назад» не нажать вовсе, оба утверждения краснеют.
 *
 * ── Чего здесь нет намеренно ───────────────────────────────────────────────
 *
 * Напоминаний, повторов, меток, подзадач, стирания данных, смены часового
 * пояса, reboot-реконсиляции. Всё это проверяет длинный смоук; смешивать
 * два сценария в один значило бы вернуть ту самую поломку в несвязанном
 * месте, из-за которой этот файл и появился.
 */
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  actWhenReady,
  adb,
  adbSoft,
  APPLICATION_ID,
  clickByTextWhenReady,
  fail,
  launchAndAttach,
  pullDatabase,
  screenshot,
  waitFor,
} from './device.mjs';
import {
  clickByLabel,
  openTaskRow,
  READ_APP_TEXT,
  READ_TASK_ROW_TITLES,
  typeIntoFirstInput,
  typeIntoLabeled,
} from './page-actions.mjs';

/**
 * Контрольная строка приёмки владельца продукта — дословно та же, что в
 * длинном смоуке и в юнит-приёмке
 * (`packages/app/test/acceptance/control-phrase.test.tsx`): «та же NLP
 * строка должна создавать ту же domain task».
 */
const CONTROL_PHRASE = '9 сентября в 11:00 Сходить с мамой в МВД';
const CONTROL_TITLE = 'Сходить с мамой в МВД';

/**
 * Подписи чипов предпросмотра. `9 сентября` — то, что даёт слой локали
 * (`formatDate`, `ru-RU`, `{ weekday: 'short' }` → «вт, 9 сентября»),
 * поэтому сравнение по вхождению, а не по равенству: день и месяц — наши,
 * сокращение дня недели — Intl устройства.
 */
const CONTROL_DATE_CHIP = '9 сентября';
const CONTROL_TIME_CHIP = '11:00';

/**
 * Задача онбординга. Свежая установка обязана пройти M01→M05, минуя это
 * нельзя: Quick Add живёт на нижней панели, которой до Today просто нет.
 *
 * Текст без единого распознаваемого токена — тогда `FirstTask` ставит
 * ЗАПАСНУЮ сегодняшнюю дату (`fallbackDate`, `FirstTask.tsx`), и на
 * «Сегодня» гарантированно есть ровно одна строка. Это не украшение: без
 * неё проверка шага 7 «контрольной задачи на Today НЕТ» прошла бы и на
 * пустом, не отрисовавшемся списке — то есть перестала бы различать.
 */
const ONBOARDING_TASK = 'Проверка запуска';

/** Кнопка возврата из карточки задачи (`taskDetail.back.label`) — её нет
 * ни на одном списке, и ровно поэтому она годится в признак шага 8. */
const TASK_CARD_DONE = 'Готово';

/** Пункт нижней навигации и заголовок экрана поиска (`shell.nav.search`,
 * `search.pageTitle`). Внутри карточки задачи нижней панели нет вовсе —
 * значит это положительная половина признака возврата в список. */
const SEARCH_TAB = 'Поиск';

/** Поле ввода экрана поиска (`search.input.label`). */
const SEARCH_INPUT_LABEL = 'Поиск по задачам, проектам и меткам';

/**
 * Контрольная задача так, как она физически лежит в снятом файле базы.
 * `null`, если её нет вовсе, — вызывающий сам решает, что это значит.
 */
function readControlTask(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return (
      db
        .prepare(
          `SELECT title, planned_date, planned_time FROM tasks
           WHERE title = ? AND deleted_at IS NULL`,
        )
        .get(CONTROL_TITLE) ?? null
    );
  } finally {
    db.close();
  }
}

/**
 * Утверждение о канонических полях контрольной задачи.
 *
 * Год НЕ прибит константой: «9 сентября» разбирается относительно
 * сегодняшнего дня, и сценарий с зашитым годом начал бы врать первого
 * января вместо того, чтобы ловить регрессию. Проверяется то, что обязано
 * выполняться всегда: девятое сентября — и год либо текущий (дата ещё
 * впереди), либо следующий (девятое сентября этого года уже прошло, и NLP
 * правильно перенёс на будущее).
 *
 * `Date` здесь законен: это часы CI-раннера, а не доменная логика (запрет
 * `Date` из ТЗ §5 — про `packages/*`, где даты задач живут на `Temporal`).
 */
function assertControlTaskFields(task, label) {
  if (task === null) {
    fail(`${label}: в файле базы нет задачи «${CONTROL_TITLE}» — Quick Add не дошёл до хранилища`);
  }
  if (task.title !== CONTROL_TITLE) {
    fail(
      `${label}: title в базе = ${JSON.stringify(task.title)}, ожидалось ` +
        `${JSON.stringify(CONTROL_TITLE)} — служебные токены не ушли из названия`,
    );
  }
  const plannedDate = String(task.planned_date ?? '');
  const matched = /^(\d{4})-09-09$/u.exec(plannedDate);
  if (matched === null) {
    fail(
      `${label}: planned_date = ${JSON.stringify(task.planned_date)}, ожидалось девятое сентября ` +
        '(ГГГГ-09-09)',
    );
  }
  const year = Number(matched[1]);
  const currentYear = new Date().getFullYear();
  if (year !== currentYear && year !== currentYear + 1) {
    fail(
      `${label}: planned_date = ${plannedDate} — год ${year} не текущий (${currentYear}) и не ` +
        'следующий, то есть «9 сентября» разрешилось не относительно сегодняшнего дня',
    );
  }
  const plannedTime = String(task.planned_time ?? '').slice(0, 5);
  if (plannedTime !== CONTROL_TIME_CHIP) {
    fail(
      `${label}: planned_time = ${JSON.stringify(task.planned_time)}, ожидалось ` +
        `${CONTROL_TIME_CHIP}`,
    );
  }
  console.log(`${label}: ${JSON.stringify(task)} — название, дата и время на месте.`);
}

/** Видимый текст продукта — короткой строкой для сообщения об ошибке. */
async function screenText(session) {
  const text = await session.cdp.evaluate(READ_APP_TEXT);
  return typeof text === 'string' ? text : '';
}

/** Заголовки строк СПИСКА (`.shagi-task-row`), а не весь текст экрана:
 * Quick Add рисует живой предпросмотр распознанного названия на каждое
 * нажатие клавиши, и `READ_APP_TEXT` не отличает его от созданной задачи
 * (разбор — в заголовке `READ_TASK_ROW_TITLES` в `page-actions.mjs`). */
async function taskRowTitles(session) {
  const rows = await session.cdp.evaluate(READ_TASK_ROW_TITLES);
  return typeof rows === 'string' ? rows : '';
}

async function main() {
  console.log('── Установка APK ──');
  const apkPath = process.argv[2];
  if (apkPath === undefined) fail('не передан путь к APK: node android-acceptance.mjs <путь.apk>');
  adb(['install', '-r', apkPath], { stdio: 'inherit' });

  // ── 1. Запуск приложения ────────────────────────────────────────────────
  const first = await launchAndAttach('первый запуск');

  console.log('── Онбординг до «Сегодня» ──');
  if (!(await clickByTextWhenReady(first, 'Начать'))) {
    fail(`кнопка «Начать» не найдена. Экран: ${JSON.stringify(first.screen.slice(0, 200))}`);
  }
  if (!(await actWhenReady(first, typeIntoFirstInput(ONBOARDING_TASK)))) {
    fail('поле первой задачи онбординга не найдено');
  }
  if (!(await clickByTextWhenReady(first, 'Добавить задачу'))) {
    fail('кнопка «Добавить задачу» онбординга не найдена');
  }
  if (!(await clickByTextWhenReady(first, 'Понятно'))) {
    fail('кнопка «Понятно» (экран разбора русского текста) не найдена');
  }
  const todayRows = await waitFor('строку задачи онбординга на «Сегодня»', 20, 1000, async () => {
    const rows = await taskRowTitles(first);
    return rows.includes(ONBOARDING_TASK) ? rows : null;
  });
  if (todayRows === null) {
    fail(
      `онбординг не довёл до «Сегодня» со строкой «${ONBOARDING_TASK}». Экран: ` +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }
  screenshot('01-today-after-onboarding');

  // ── 2. Quick Add ────────────────────────────────────────────────────────
  console.log('── Quick Add ──');
  // Кнопка-иконка: видимого текста нет, имя живёт в `aria-label`.
  if (!(await actWhenReady(first, clickByLabel('Быстрое добавление')))) {
    fail(
      `кнопка быстрого добавления не найдена. Экран: ` +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }

  // ── 3. Контрольная фраза ────────────────────────────────────────────────
  if (!(await actWhenReady(first, typeIntoFirstInput(CONTROL_PHRASE)))) {
    fail('поле ввода Quick Add не найдено');
  }

  // ── 4. Чипы предпросмотра — ДО создания ─────────────────────────────────
  //
  // Отдельное требование приёмки, а не следствие правильной записи в базу:
  // человек обязан видеть, что именно продукт понял, ещё до того, как
  // согласится это создать.
  console.log('── Чипы предпросмотра до создания ──');
  const preview = await waitFor('чипы предпросмотра Quick Add', 20, 500, async () => {
    const text = await screenText(first);
    return text.includes(CONTROL_DATE_CHIP) && text.includes(CONTROL_TIME_CHIP) ? text : null;
  });
  if (preview === null) {
    fail(
      `предпросмотр Quick Add не показал «${CONTROL_DATE_CHIP}» и «${CONTROL_TIME_CHIP}» ДО ` +
        `создания задачи. Экран: ${JSON.stringify((await screenText(first)).slice(0, 400))}`,
    );
  }
  // «ДО создания» — не фигура речи, и без этой половины утверждение не
  // различало бы предпросмотр от уже созданной задачи: строка СПИСКА с
  // контрольным названием сейчас существовать не может, форма ещё открыта
  // и ничего не отправляла.
  const rowsBeforeSubmit = await taskRowTitles(first);
  if (rowsBeforeSubmit.includes(CONTROL_TITLE)) {
    fail(
      `до нажатия «Добавить задачу» в списке уже есть строка «${CONTROL_TITLE}»: ` +
        `${JSON.stringify(rowsBeforeSubmit.slice(0, 300))}. Значит проверенные чипы относятся к ` +
        'уже созданной задаче, а не к предпросмотру.',
    );
  }
  screenshot('02-quick-add-preview-chips');

  // ── 5. Создание ─────────────────────────────────────────────────────────
  console.log('── Создание задачи ──');
  if (!(await actWhenReady(first, clickByLabel('Добавить задачу')))) {
    fail('кнопка «Добавить задачу» в Quick Add не найдена');
  }

  // ── 6. Проверка по SQLite ───────────────────────────────────────────────
  //
  // Ждём ФАЙЛ БАЗЫ, а не экран. Контрольная задача стоит на будущей дате —
  // на «Сегодня» она не появится по определению, и любой экранный признак
  // здесь либо неверен, либо зависит от формулировки отклика, которую
  // копирайтинг вправе менять. Файл базы — тот самый вопрос, который и
  // задан: дошло ли до хранилища.
  console.log('── Контрольная задача в SQLite ──');
  const createdTask = await waitFor('запись контрольной задачи в SQLite', 20, 1000, () =>
    readControlTask(pullDatabase('after-quick-add')),
  );
  if (createdTask === null) {
    fail(
      `после «Добавить задачу» задачи «${CONTROL_TITLE}» нет в файле базы. Экран: ` +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }
  assertControlTaskFields(createdTask, 'После создания');

  // ── 7. Открыть задачу НЕ через «Сегодня» ────────────────────────────────
  console.log('── На «Сегодня» контрольной задачи нет: дата будущая ──');
  const rowsOnToday = await waitFor('возврат на «Сегодня» после Quick Add', 20, 500, async () => {
    const rows = await taskRowTitles(first);
    return rows.includes(ONBOARDING_TASK) ? rows : null;
  });
  if (rowsOnToday === null) {
    fail(
      'после создания приложение не вернулось на «Сегодня»: строки списка не видно. Экран: ' +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }
  // Девятого сентября утверждение «на Сегодня её нет» ложно по существу:
  // дата задачи — сегодняшняя, и продукт ОБЯЗАН показать её в списке.
  // Проверять его в этот день значило бы красить прогон раз в год на
  // правильном поведении.
  const runDate = new Date();
  const runsOnNinthOfSeptember = runDate.getMonth() === 8 && runDate.getDate() === 9;
  if (runsOnNinthOfSeptember) {
    console.log(
      'Сегодня девятое сентября — контрольная задача запланирована на СЕГОДНЯ, и её присутствие ' +
        'на «Сегодня» правильно. Проверка отсутствия пропущена; открытие через «Поиск» ниже — нет.',
    );
  } else if (rowsOnToday.includes(CONTROL_TITLE)) {
    fail(
      `контрольная задача с будущей датой оказалась в списке «Сегодня»: ` +
        JSON.stringify(rowsOnToday.slice(0, 300)),
    );
  } else {
    console.log(`На «Сегодня» строки: ${JSON.stringify(rowsOnToday.slice(0, 200))} — нашей нет.`);
  }

  console.log('── Открытие через «Поиск» ──');
  if (!(await clickByTextWhenReady(first, SEARCH_TAB, { exact: true }))) {
    fail(
      `пункт «${SEARCH_TAB}» нижней навигации не найден. Экран: ` +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }
  if (!(await actWhenReady(first, typeIntoLabeled(SEARCH_INPUT_LABEL, CONTROL_TITLE)))) {
    fail(`поле «${SEARCH_INPUT_LABEL}» не найдено`);
  }
  const foundRows = await waitFor(
    'строку контрольной задачи в результатах поиска',
    20,
    500,
    async () => {
      const rows = await taskRowTitles(first);
      return rows.includes(CONTROL_TITLE) ? rows : null;
    },
  );
  if (foundRows === null) {
    fail(
      `поиск по «${CONTROL_TITLE}» не нашёл задачу. Экран: ` +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }
  if (!(await actWhenReady(first, openTaskRow(CONTROL_TITLE)))) {
    fail(`строка «${CONTROL_TITLE}» в результатах поиска не открыла карточку`);
  }
  // Признак ОТКРЫТОЙ карточки — кнопка «Готово», и только она.
  //
  // По заголовку задачи открытие карточки не определить, и это измерено, а
  // не предположено: в видимом тексте карточки заголовка НЕТ ВОВСЕ — он
  // живёт в редактируемом поле ввода, а `innerText` значений полей не
  // видит (`node apps/mobile/scripts/verify-page-actions.mjs` на веб-сборке
  // печатает текст карточки целиком: «Готово / Входящие / … / ПЛАНИРОВАНИЕ
  // …», без названия задачи).
  const cardText = await waitFor('карточку задачи', 20, 500, async () => {
    const text = await screenText(first);
    return text.includes(TASK_CARD_DONE) ? text : null;
  });
  if (cardText === null) {
    fail(
      `карточка задачи не открылась: кнопки «${TASK_CARD_DONE}» на экране нет. Экран: ` +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }
  screenshot('03-task-card-from-search');

  // ── 8. Аппаратная «Назад» ───────────────────────────────────────────────
  //
  // Проверяется на УСТРОЙСТВЕ, а не юнит-тестом: юнит-тест доказывает
  // логику возврата и ловушку в истории
  // (`packages/app/test/state/back-navigation.test.ts`), но не то, что
  // WebView Tauri вообще отдаёт `popstate` по системной кнопке. До правки
  // back-navigation «Назад» закрывала приложение с любого экрана.
  console.log('── Аппаратная «Назад» ──');

  // Состояние ловушки СНЯТО С УСТРОЙСТВА до нажатия, а не выведено из
  // рассуждений. Прогон `33975705991` показал, что мост в Kotlin включён
  // (`override val handleBackNavigation: Boolean = true` в собранном
  // `MainActivity.kt` — это видно в логе шага), а приложение всё равно
  // закрывается. Значит вопрос ровно один: успела ли страница положить
  // служебную запись в историю. В настоящем Chromium она кладётся —
  // измерено (`length=3`, `state={"shagi:back-trap":true}`), — но
  // WebView Android это отдельная среда, и догадками её не проверить.
  //
  // Диагностика не роняет сценарий: приговор выносит проверка ПОСЛЕ
  // нажатия, а эта строка объясняет, почему он такой.
  const historyBefore = await first.cdp.evaluate(
    'JSON.stringify({ length: history.length, state: history.state })',
  );
  console.log(`История WebView до нажатия: ${historyBefore}`);

  adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'], { stdio: 'inherit' });
  await sleep(1500);

  // ЗАКРЫЛОСЬ ЛИ ПРИЛОЖЕНИЕ — первым вопросом, и порядок здесь не
  // косметический: если «Назад» ушла в активность, WebView умер вместе с
  // ней, и любой следующий `Runtime.evaluate` не получит ответа — то есть
  // упрётся в таймаут CDP (30 с) вместо того, чтобы назвать причину.
  //
  // Спрашивать про это ОДНИМ `pidof` — недостаточно, и это измерено, а не
  // предположено. В прогоне `33974178292` активность закрылась, а процесс
  // ещё жил: `pidof` вернул pid, проверка прошла, и сценарий всё равно
  // упёрся в тридцатисекундный таймаут CDP вместо внятного сообщения.
  // Android не убивает процесс сразу после `finish()` — живой pid не значит
  // «приложение на экране». Поэтому вопрос задаётся ещё и оконному
  // менеджеру: чья активность СЕЙЧАС в фокусе.
  // Команда идёт ОДНОЙ строкой, а не списком слов: `execFileSync` шелла не
  // открывает, а `adb` экранирует свои аргументы — список превратил бы
  // конвейер в литеральный `|` для `dumpsys`.
  //
  // Фокус опрашивается с повтором: сразу после нажатия оконный менеджер
  // может застать переход и вернуть пустое значение, и одиночный опрос
  // объявил бы это закрытием приложения.
  let focus = '';
  let inForeground = false;
  for (let attempt = 0; attempt < 6 && !inForeground; attempt += 1) {
    if (attempt > 0) await sleep(400);
    focus = adbSoft(['shell', 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp"']);
    inForeground = focus.includes(APPLICATION_ID);
  }
  const processAlive = adbSoft(['shell', 'pidof', APPLICATION_ID]).trim() !== '';
  if (!processAlive || !inForeground) {
    fail(
      'аппаратная «Назад» из карточки задачи закрыла приложение — системная кнопка уходит в ' +
        `активность вместо навигации внутри продукта (процесс жив: ${processAlive}, ` +
        `в фокусе: ${JSON.stringify(focus.trim().slice(0, 200))})`,
    );
  }

  const returned = await waitFor('возврат из карточки в список', 20, 500, async () => {
    const text = await screenText(first);
    // ОБЕ половины обязательны, и ни одна из них не про заголовок задачи:
    // его нет в видимом тексте ни карточки (он в поле ввода), ни экрана
    // поиска после возврата (запрос сбрасывается вместе с размонтированием
    // экрана, `Search.tsx`: «`activeFilter` — обычный `useState`,
    // обнуляется при размонтировании экрана, как и `query`»), — то есть по
    // нему два состояния вообще не различаются.
    //
    // Исчезновение «Готово» — что карточка закрыта. Появление «Поиск» — что
    // вернулись именно в СПИСОК: нижней навигации внутри карточки задачи на
    // мобильной раскладке нет (`MAIN_TAB_SCREENS`, `AppShell.tsx`).
    if (text.includes(TASK_CARD_DONE)) return null;
    return text.includes(SEARCH_TAB) ? text : null;
  });
  if (returned === null) {
    fail(
      'после аппаратной «Назад» приложение не вернулось в список: кнопка ' +
        `«${TASK_CARD_DONE}» всё ещё на экране или нижней навигации нет. Экран: ` +
        JSON.stringify((await screenText(first)).slice(0, 300)),
    );
  }
  console.log('«Назад» вернула в список, приложение живо.');
  screenshot('04-after-hardware-back');

  // ── 9. force-stop ───────────────────────────────────────────────────────
  console.log('── Закрытие приложения (force-stop) ──');
  first.cdp.close();
  // Пауза перед убийством процесса — не суеверие: запись в хранилище
  // асинхронна, и убийство ровно в момент коммита транзакции проверяло бы
  // устойчивость к сбою питания, а не персистентность как таковую.
  await sleep(2000);
  adb(['shell', 'am', 'force-stop', APPLICATION_ID], { stdio: 'inherit' });
  const stopped = await waitFor('остановку процесса', 15, 1000, () =>
    adbSoft(['shell', 'pidof', APPLICATION_ID]).trim() === '' ? true : null,
  );
  if (stopped === null) {
    fail(
      'процесс не умер после `am force-stop` — перезапуск не проверить: ' +
        `pidof = ${JSON.stringify(adbSoft(['shell', 'pidof', APPLICATION_ID]))}`,
    );
  }

  // ── 10. Повторный запуск ────────────────────────────────────────────────
  const second = await launchAndAttach('после перезапуска');

  // ── 11. Та же задача с теми же полями ───────────────────────────────────
  console.log('── Контрольная задача в SQLite после перезапуска ──');
  const survived = readControlTask(pullDatabase('after-restart'));
  assertControlTaskFields(survived, 'После перезапуска');
  // «Те же поля» — буквально те же, а не «снова похожие на правду»: без
  // сравнения с первым чтением проверка не отличила бы пережившую задачу от
  // созданной заново с той же фразой.
  for (const field of ['title', 'planned_date', 'planned_time']) {
    if (String(survived[field]) !== String(createdTask[field])) {
      fail(
        `после перезапуска поле ${field} изменилось: было ` +
          `${JSON.stringify(createdTask[field])}, стало ${JSON.stringify(survived[field])}`,
      );
    }
  }
  console.log('Задача пережила закрытие приложения без изменений.');
  screenshot('05-after-restart');

  second.cdp.close();
  console.log('\nКороткая приёмка пройдена: Quick Add и персистентность работают.');
}

await main();
