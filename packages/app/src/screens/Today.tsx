/**
 * `Today` — экран матрицы `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`,
 * состояния M06 Today Empty, M07 Today Normal и, этим пакетом работ, M08
 * Today Dense (свёртываемые группы) плюс per-task действия из `01§6`
 * (Complete/Reschedule/Change deadline). Отбор/группировка (`selectTodayTasks`,
 * @shagi/core) и презентационная развёртка групп — из предыдущего пакета
 * работ (E06.1), здесь не переписаны.
 *
 * Этим же пакетом работ — «Добавить в Главное» (M11 Focus, `01§6`, раздел
 * «Главное»): см. блок ниже «M11: Добавить в Главное».
 *
 * Явно вне охвата (следующие пакеты работ, см. задание): Focus-промпт для
 * **undated**-задачи (ТЗ описывает его для будущих Inbox/Project list — на
 * Today такой задачи в принципе не бывает, см. блок «M11» ниже) и переход в
 * Task Detail («Open», M24/M25 — экрана ещё нет, эпик E10). Bulk Today/
 * Tomorrow для «Не по плану» (M09) — этим пакетом работ, см. блок «M09»
 * ниже (был вне охвата в E06.2/E06.3, закрыт здесь, последним пакетом
 * эпика).
 *
 * --- Действия по группам (`01§6`, дословно) -----------------------------
 *
 * Все группы: «Выполнить» — и чекбоксом строки (`TaskRow.onCheckedChange`,
 * больше не `disabled`), и пунктом меню — то же самое действие двумя
 * входами, не два независимых пути. «Просрочен срок»: дополнительно
 * «Перепланировать» (быстрые «Сегодня»/«Завтра») и «Изменить срок»
 * (`planning/DatePicker` в `Modal`). «Не по плану»: «Перепланировать»
 * (те же быстрые пункты), без bulk — вне территории этого пакета работ.
 * `focus`/`timed`/`today`/`later` — только «Выполнить».
 *
 * После любой успешной команды список не мутируется локально — заново
 * запрашивается `selectTodayTasks` (см. `refreshGroups`): группировка —
 * производный результат состояния хранилища, пересчитывать её вручную на
 * клиенте означало бы держать вторую копию бизнес-правила и рисковать
 * рассинхронизацией с тем, что реально лежит в хранилище (задание). Провал
 * команды (`status !== 'ok'`) не проглатывается — `Toast` с сообщением
 * об ошибке (`@shagi/ui/feedback`), список не трогается.
 *
 * --- M11: «Добавить в Главное» --------------------------------------------
 *
 * Действие видно только там, где после успеха задача реально сменит
 * видимую на этом экране группу на `focus` (то же соображение, по которому
 * E06.2 не дал «Изменить срок» группе «Не по плану»): `missed_plan` /
 * `timed` / `today` / `later` — да, `focus` — уже там (действие не нужно).
 *
 * `missed_deadline` — сознательно **без** этого действия: `classifyTaskForToday`
 * (`@shagi/core`) проверяет просроченный дедлайн ПЕРВЫМ, раньше проверки
 * `focus_date` — назначение Focus такой задаче не изменит её видимую группу
 * на Today (она останется в «Просрочен срок»), то есть кнопка была бы, а
 * результата пользователь не увидел бы.
 *
 * Три сценария (`01§6`, дословно): "Undated task → prompt to plan for
 * today"; "Task on other date → prompt to move today"; "Fourth Focus →
 * choose one of 3 to replace". Undated-сценарий сюда не строится: на Today
 * задачи без ни одного из `plannedDate`/`deadlineDate`/`focusDate` не
 * бывает — `classifyTaskForToday` вернёт для неё `null`, и она вообще не
 * попадёт на этот экран (см. блок выше `classifyTaskForToday`). Эта логика
 * ждёт будущий пакет работ Inbox/Project list — недостижимый код здесь был
 * бы фиктивным покрытием.
 *
 * Оставшиеся два сценария различает ГРУППА-источник, не повторное чтение
 * `plannedDate` задачи (`focusAssignmentPatch`): у `missed_plan` — и только
 * у неё из четырёх групп с этим действием — `plannedDate` уже задан и не
 * равен сегодня, остальные три по построению группы уже спланированы на
 * сегодня.
 * - `timed`/`today`/`later` → патч `{focusDate: today, dayBucket: 'default'}`
 *   применяется СРАЗУ, без подтверждения (дата и так сегодня, подтверждать
 *   нечего).
 * - `missed_plan` → сперва `Modal` с подтверждением переноса даты
 *   (`focusConfirm`), патч `{plannedDate: today, focusDate: today,
 *   dayBucket: 'default'}` уходит только по клику подтверждения.
 *
 * `dayBucket: 'default'` — часть патча БЕЗУСЛОВНО в обоих случаях ("Setting
 * Focus clears `day_bucket=later`", `01§6`), не только когда текущий
 * bucket — `later`: результат не должен зависеть от того, правильно ли
 * прочитано текущее состояние задачи (идемпотентно).
 *
 * Четвёртая задача (`focusReplace`) перехватывает оба сценария выше ДО
 * решения "сразу/с подтверждением": если `groups.focus.length >= 3`,
 * вместо прямого патча или диалога переноса даты показывается список из
 * трёх текущих Focus-задач на выбор замены. После выбора — два
 * ПОСЛЕДОВАТЕЛЬНЫХ вызова `updateTaskCommand` (`handleFocusReplace`), не
 * один атомарный: в дереве пакетов нет мульти-task-транзакционной команды,
 * это узкий известный компромисс (тот же жанр, что `getDeviceId`/
 * `getLocalIdentity` в блоке ниже). Если первый вызов (снятие Focus со
 * старой задачи) успешен, а второй (назначение новой) — нет, список
 * обновляется после первого (снятие уже реально произошло — не скрывать
 * это) и `Toast` сообщает об ошибке второго; конечное состояние может быть
 * неидеальным (Focus снят с одной, не назначен другой), но это честнее,
 * чем притворяться, что операция атомарна.
 *
 * --- Локальная идентичность (deviceId) -----------------------------------
 *
 * Обеим командам (`completeTaskCommand`/`updateTaskCommand`) нужен только
 * `deps.deviceId` (тай-брейк HLC) — `ownerScope` не требуется: обе команды
 * этого пакета работ мутируют уже существующую задачу, а не создают
 * новую. `FirstTask.tsx` уже решает тот же узкий вопрос (см. его
 * заголовок: персистентного порта идентичности устройства в дереве пакетов
 * ещё нет, `packages/platform`/`packages/storage` его не заводят) через
 * `getLocalIdentity()`, но эта функция там не экспортирована — она
 * приватна модулю `FirstTask.tsx`, импортировать нечего. Здесь — тот же
 * приём с тем же обоснованием, сведённый к одному `deviceId` (не паре
 * `ownerScope`/`deviceId`, он этому экрану не нужен): `getDeviceId()`
 * генерирует и кэширует `Uuid` один раз за время жизни модуля через
 * `generateDeviceId` (`@shagi/core`). Дублирование именно этого узкого
 * куска (а не более широкого рефакторинга в общий модуль) — сознательное
 * решение: настоящее место для общего порта — будущий `@shagi/platform`
 * (обе точки, `FirstTask.tsx` и этот файл, тогда заменяются одним вызовом),
 * а не импорт приватной функции одного экрана из другого.
 *
 * --- M08: свёртываемые группы, не виртуализация --------------------------
 *
 * Матрица требует «20+/50 tasks manageable» через «virtualization/
 * collapsible conditional groups» — выбрана вторая половина союза.
 * Виртуализация списка — зависимость (например `@tanstack/react-virtual`),
 * оправданная только на порядках величины из перф-бюджетов
 * `00_MASTER_IMPLEMENTATION_TZ.md` (Board 500+ карточек, будущий эпик E21)
 * — здесь Today-группа даже в «Dense»-сценарии на порядок меньше (20–50
 * строк), и добавлять зависимость заранее под гипотетическую нагрузку —
 * ровно то, от чего явно предостерегает `CLAUDE.md`. Схлопывание группы —
 * дешёвое решение той же проблемы «слишком длинный список на экране» без
 * новой зависимости.
 *
 * Порог по умолчанию — `COLLAPSE_THRESHOLD = 20`: группа стартует свёрнутой,
 * если в ней **больше** 20 задач (>20, не ≥20 — акцептанс матрицы буквально
 * называет «20+» нижней границей «плотного» сценария, а не порогом
 * схлопывания; ровно 20 задач — это уже «плотно», но всё ещё «управляемо»
 * без схлопывания, граница отталкивается от первого числа, которое явно
 * названо проблемным). Состояние свёрнутости — `useState` на экране,
 * непостоянное (не персистентное между заходами) — задание прямо просит не
 * выходить за эти рамки в этом пакете работ.
 *
 * --- M09: bulk Today/Tomorrow — только «Не по плану» ----------------------
 *
 * `01§6`, дословно про «Не по плану»: "Actions: per-task reschedule; bulk
 * Today/Tomorrow. Bulk never changes Deadline." Пер-таск reschedule — уже
 * E06.2 (меню строки, см. блок действий выше). Этот пакет работ добавляет
 * bulk: множественный выбор ТОЛЬКО внутри `missed_plan` — ТЗ прописывает это
 * действие именно для этой группы среди всех шести, остальные пять
 * мультивыбором не оборудованы.
 *
 * Вход/выход — кнопка в заголовке секции (`missedPlanSelection`, по образцу
 * уже существующей кнопки сворачивания той же секции): «Выбрать» включает
 * режим, повторный клик по той же кнопке («Готово») выключает и ОБНУЛЯЕТ
 * множество выбранных — отменённый режим выбора не должен "запоминать"
 * частичный выбор до следующего входа, лишняя скрытая память в UI-состоянии
 * без пользы.
 *
 * Чекбокс строки в режиме выбора — переключатель ВЫБОРА, не Complete: тот же
 * `TaskRow`/`TaskCheckbox`, что и везде на экране (задание — не трогать
 * компоненты `packages/ui`, они уже поддерживают `state='selected'`, см.
 * `TaskRow.tsx`), только у `missed_plan` при активном режиме подменяется
 * `checked`/`onCheckedChange`: `checked` = членство в множестве выбранных
 * (не факт завершения — задача остаётся `active` до применения bulk),
 * `onCheckedChange` пишет/стирает id в множестве, `completeTaskCommand` не
 * вызывается вовсе, пока режим активен. Вне режима выбора и во всех
 * остальных пяти группах — прежнее поведение чекбокса (Complete), без
 * изменений. `state` строки — `'selected'` для выбранных (форсирует заливку
 * чекбокса через CSS класса, задание/JSDoc `TaskRow.tsx`), иначе обычный
 * `groupRowState('missed_plan')` — визуально ничего не меняется у
 * невыбранных строк, кроме рабочего чекбокса-переключателя.
 *
 * Панель массовых действий («Выбрано: N», кнопки «Сегодня»/«Завтра») видна,
 * пока выбрана хотя бы одна задача — простая инлайн-панель внутри секции
 * группы, не floating/sticky (задание: «минимально достаточная
 * реализация»). Клик применяет `updateTaskCommand({id, patch:
 * {plannedDate}}, deps)` к каждому выбранному id ПОСЛЕДОВАТЕЛЬНО (цикл
 * `for..of` с `await`, не `Promise.all`) — тот же приём, что уже применён в
 * этом файле для двух последовательных вызовов при замене Focus
 * (`handleReplaceFocus`): ни `@shagi/storage`, ни этот пакет работ не
 * проверяли параллельную безопасность нескольких одновременных
 * `runTransaction` по разным задачам на реальных адаптерах (SQLite/
 * IndexedDB) — последовательный порядок детерминирован и не полагается на
 * недоказанное предположение. Патч — **только** `plannedDate`: "Bulk never
 * changes Deadline" тем самым выполняется структурно (в патче физически нет
 * `deadlineDate`), не отдельной проверкой поверх.
 *
 * `refreshGroups()` — ровно ОДИН раз, после всех N вызовов, не после
 * каждого по отдельности (задание: иначе список мигал бы N раз за один
 * клик). Провал части команд (`status !== 'ok'`) не проглатывается —
 * `Toast` с отдельным сообщением (`errors.bulkPartialFailure`, не общий
 * `actionFailed`: пользователю важно понять, что произошёл ЧАСТИЧНЫЙ, а не
 * полный провал), и список ВСЁ РАВНО обновляется после частичного успеха —
 * то же соображение, что и `handleReplaceFocus` выше: не притворяться, что
 * ничего не произошло, когда часть задач реально изменилась в хранилище.
 * Режим выбора выключается и множество выбранных обнуляется после bulk
 * безусловно (успех или частичный провал) — задание не просит оставлять
 * пользователя в режиме выбора для повторной попытки на проваленных, а
 * список уже показывает, что именно не применилось (проваленная задача
 * осталась в «Не по плану», не переехала).
 *
 * --- Бейдж Входящих (эпик E07, точечная правка) ----------------------------
 *
 * Вход во Входящие — НЕ bottom nav (его в дереве пакетов ещё нет ни в одном
 * пакете) и не отдельный маршрут с постоянной панелью, а бейдж-счётчик в
 * заголовке Today (`.ultraplan/research/02-ui.md` §4,
 * `docs/spec/SPEC/04_UI_DESIGN_SYSTEM.md`: "Inbox entry: Today header
 * badge, ..."). `inboxCount` читается ОДНИМ дополнительным запросом
 * (`storage.tasks.listByCaptureStateAndStatus('inbox', 'active').length`) в
 * том же `useEffect`, что уже грузит `selectTodayTasks` — не отдельный
 * эффект и не запрос на каждый рендер (задание). Он не участвует в
 * `refreshGroups` (перезапросе после команд Today): ни одно действие этого
 * экрана не меняет `captureState` — все шесть групп Today по построению
 * `selectTodayTasks` уже `processed` (Inbox — только `capture_state=inbox`,
 * `01§2`), так что список Входящих не может измениться под действиями
 * этого экрана, повторный запрос был бы лишним.
 *
 * Ноль — бейдж (и кнопка целиком) СКРЫТ, не «0»: по духу пустого состояния
 * (Inbox Zero) — нулевой счётчик не несёт действия ("иди разбирай нечего"),
 * показывать его как число было бы шумом, а не сигналом (решение этого
 * пакета работ, задание разрешало оставить голую иконку без числа — здесь
 * выбрано скрыть целиком, раз действию всё равно нечего показать).
 *
 * Клик — `controller.goTo('inbox')` (`useAppController`, готовый хук
 * `state/context.tsx`). Экран Входящие (`Inbox.tsx`, этот же пакет работ)
 * возвращается назад через `controller.goTo('todayEmpty')` — см. его
 * заголовок за объяснением имени `'todayEmpty'`.
 *
 * --- Кнопка Quick Add (эпик E05.2) ------------------------------------------
 *
 * `01§3`, таблица «Origin → Inherited values»: "Today | planned_date=today,
 * processed" — кнопка рядом с заголовком (M06 "date + Quick Add + calm
 * empty state" буквально требует эту кнопку на этом экране) вызывает
 * `controller.openQuickAdd('today')` (`state/store.ts`), НЕ `goTo` — оверлей
 * не подменяет экран под собой (см. заголовок `store.ts`, блок про
 * `quickAdd`), список Today не перезапрашивается при открытии/закрытии
 * (создание задачи закрывает оверлей, а не возвращает управление сюда
 * напрямую — свежий список подхватится обычным перемонтированием `Today`
 * при следующем заходе; синхронный рефреш после создания вне объёма этого
 * пакета работ, тот же принцип «минимально достаточная реализация»).
 *
 * --- Открытие Task Detail по клику на строку (эпик E10.2) ------------------
 *
 * Клик по строке задачи → `controller.openTask(task.id)` (M24/M25,
 * `packages/app/src/screens/TaskDetail.tsx`). `TaskRow` уже принимает
 * произвольный `onClick` через `...rest: HTMLAttributes<HTMLDivElement>` —
 * передан напрямую компоненту, отдельная оборачивающая `<div>` не нужна.
 *
 * Чекбокс и кнопка меню строки — уже интерактивные элементы, их клик не
 * должен ТАКЖЕ открывать Task Detail (задание, адверсариальная проверка в
 * тесте `Today.test.tsx`, блок «клик по строке открывает Task Detail»):
 *  - меню (`IconButton` + `TaskMenu`, обёрнуты в свой `<div
 *    style={{position:'relative'}}>` — этот код уже пишет сам экран) —
 *    настоящий `event.stopPropagation()` на этой обёртке, тот же приём, что
 *    `Label.tsx` (`@shagi/ui`) уже применяет для своей кнопки `onRemove`;
 *  - чекбокс — `TaskCheckbox` (`@shagi/ui`) рендерит `<input>` изнутри
 *    `TaskRow`, не давая вызывающему коду прокинуть туда `onClick`
 *    (`TaskRowProps` не имеет такого слота, в отличие от `trailing`) —
 *    `stopPropagation` там физически некуда воткнуть. `isInteractiveRowClick`
 *    ниже — функционально тот же результат (ровно ОДНО действие на клик:
 *    либо открытие, либо переключение чекбокса/меню, никогда оба разом),
 *    только через проверку `event.target` на ближайший нативный `input`/
 *    `button` вместо стопа распространения у источника, которого у этого
 *    экрана нет доступа поменять.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import {
  DEFAULT_LOCALE,
  WEEKDAY_MONDAY,
  WEEKDAY_SUNDAY,
  formatDate,
  formatTime,
  t,
  weekdayName,
} from '@shagi/i18n';
import {
  completeOccurrenceCommand,
  generateDeviceId,
  selectTodayTasks,
  updateTaskCommand,
  type Task,
  type TaskCommandResult,
  type TodayGroup,
  type TodayGroups,
  type UpdateTaskPatch,
  type Uuid,
} from '@shagi/core';
import {
  Button,
  DatePicker,
  EmptyState,
  Icon,
  IconButton,
  Modal,
  TaskMenu,
  TaskRow,
  Toast,
  type CalendarDate,
  type CalendarMonth,
  type TaskMenuItemData,
  type TaskRowState,
} from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';

/** Precedence `01§6` — порядок, в котором группы проверяются и рендерятся. */
const GROUP_ORDER: readonly TodayGroup[] = [
  'missed_deadline',
  'missed_plan',
  'focus',
  'timed',
  'today',
  'later',
];

/** См. заголовок файла, раздел «M08». */
const COLLAPSE_THRESHOLD = 20;

/** Заголовок каждой группы — только через каталог `@shagi/i18n`
 * (namespace `today`, ТЗ §3). Каждая ветка вызывает `t` с литеральными
 * строковыми аргументами (не переменной с вычисленным ключом) — так
 * `scripts/check-i18n-catalog.mjs` (статический разбор регулярным
 * выражением, не AST) видит все шесть ключей. */
function groupLabel(group: TodayGroup): string {
  switch (group) {
    case 'missed_deadline':
      return t('today', 'groups.missedDeadline');
    case 'missed_plan':
      return t('today', 'groups.missedPlan');
    case 'focus':
      return t('today', 'groups.focus');
    case 'timed':
      return t('today', 'groups.timed');
    case 'today':
      return t('today', 'groups.today');
    case 'later':
      return t('today', 'groups.later');
  }
}

/**
 * Маппинг `TodayGroup → TaskRowState` (задание): `TaskRow` презентационный
 * и не знает про `TodayGroup` — экран сам решает визуальное состояние.
 * `timed`/`today`/`later` — визуально одинаковые обычные строки (различие
 * между ними — где они оказались, не как выглядит сама строка); из
 * девяти состояний `TaskRow` `dragging`/`selected`/`completed`/`recurring`
 * вне охвата этого пакета работ (нет drag/multi-select/повторов/чтения
 * completed-задач на этом экране).
 */
function groupRowState(group: TodayGroup): TaskRowState {
  switch (group) {
    case 'missed_deadline':
      return 'deadlineMissed';
    case 'missed_plan':
      return 'missedPlan';
    case 'focus':
      return 'focus';
    case 'timed':
    case 'today':
    case 'later':
      return 'normal';
  }
}

function isEveryGroupEmpty(groups: TodayGroups): boolean {
  return GROUP_ORDER.every((group) => groups[group].length === 0);
}

/** См. заголовок файла, блок «Открытие Task Detail по клику на строку» —
 * чекбокс строки не даёт вызывающему коду точку для `stopPropagation`,
 * поэтому клик по строке проверяет свою цель: ближайший нативный
 * `input`/`button` — уже интерактивный элемент строки (чекбокс/кнопка
 * меню/пункт меню), открытие Task Detail в этом случае не выполняется. */
function isInteractiveRowClick(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, button') !== null;
}

// --- Календарь `DatePicker` — конвертация Temporal ↔ простых чисел ------------
//
// `packages/ui` намеренно не зависит от `@js-temporal/polyfill` (см.
// заголовок `DatePicker.tsx`) — конвертация в обе стороны и локализация
// подписей (недели/месяцы) целиком на вызывающем коде, здесь.

function toCalendarDate(date: Temporal.PlainDate): CalendarDate {
  return { year: date.year, month: date.month, day: date.day };
}

function toCalendarMonth(date: Temporal.PlainDate): CalendarMonth {
  return { year: date.year, month: date.month };
}

function fromCalendarDate(date: CalendarDate): Temporal.PlainDate {
  return Temporal.PlainDate.from(date);
}

/**
 * Подписи дней недели, в порядке, который просит `DatePicker.weekStartsOn`
 * (индекс 0=воскресенье…6=суббота, конвенция `Date.getDay()` — см.
 * заголовок `DatePicker.tsx`), построены через уже готовый `weekdayName`
 * (`@shagi/i18n`, ISO понедельник=1…воскресенье=7) — не второй список строк
 * вручную.
 */
const WEEKDAY_LABELS: readonly [string, string, string, string, string, string, string] = [
  weekdayName(WEEKDAY_SUNDAY, 'short'),
  weekdayName(WEEKDAY_MONDAY, 'short'),
  weekdayName(WEEKDAY_MONDAY + 1, 'short'),
  weekdayName(WEEKDAY_MONDAY + 2, 'short'),
  weekdayName(WEEKDAY_MONDAY + 3, 'short'),
  weekdayName(WEEKDAY_MONDAY + 4, 'short'),
  weekdayName(WEEKDAY_MONDAY + 5, 'short'),
];

/**
 * Подписи месяцев для `DatePicker.monthLabels` — `@shagi/i18n` не экспортирует
 * готовый `monthName` (только `weekdayName`), а добавлять его туда вне
 * разрешённой территории этого пакета работ (`packages/i18n/src/format/*`
 * не в списке «можно трогать»). Тот же приём, что использует сам
 * `weekdayName` внутри `@shagi/i18n` — заведомо верная опорная дата на
 * каждый месяц, отформатированная через `Temporal.PlainDate#toLocaleString`
 * (который делегирует в `Intl.DateTimeFormat`), а не хардкод списка строк.
 */
function buildMonthLabels(): readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] {
  const labels = Array.from({ length: 12 }, (_, index) =>
    Temporal.PlainDate.from({ year: 2024, month: index + 1, day: 1 }).toLocaleString(
      DEFAULT_LOCALE,
      { month: 'long' },
    ),
  );
  return labels as unknown as readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
}
const MONTH_LABELS = buildMonthLabels();

// --- Локальная идентичность устройства (см. заголовок файла) -----------------

let cachedDeviceId: Uuid | null = null;

function getDeviceId(): Uuid {
  cachedDeviceId ??= generateDeviceId();
  return cachedDeviceId;
}

// --- Действия строки: сборка пунктов `TaskMenu` по группе (`01§6`) -----------

interface RowActionHandlers {
  readonly onComplete: (id: Uuid) => void;
  readonly onRescheduleToday: (id: Uuid) => void;
  readonly onRescheduleTomorrow: (id: Uuid) => void;
  readonly onOpenDeadlinePicker: (task: Task) => void;
  /** См. заголовок файла, блок «M11: Добавить в Главное» — `group` здесь
   * это группа-ИСТОЧНИК (откуда вызвано действие), не `focus`: она решает,
   * нужен ли перенос `plannedDate` (`focusAssignmentPatch`). */
  readonly onAddToFocus: (task: Task, group: TodayGroup) => void;
}

interface TaskMenuActions {
  readonly frequent: readonly TaskMenuItemData[];
  readonly rare: readonly TaskMenuItemData[];
}

function buildTaskMenuActions(
  group: TodayGroup,
  task: Task,
  handlers: RowActionHandlers,
): TaskMenuActions {
  const complete: TaskMenuItemData = {
    key: 'complete',
    label: t('today', 'actions.complete'),
    icon: 'check',
    onSelect: () => handlers.onComplete(task.id),
  };

  // «Добавить в Главное» — везде, кроме `focus` (уже там) и `missed_deadline`
  // (назначение Focus не изменит видимую группу задачи на этом экране, см.
  // заголовок файла, блок «M11»).
  const addToFocus: TaskMenuItemData = {
    key: 'add-to-focus',
    label: t('today', 'actions.addToFocus'),
    icon: 'star',
    onSelect: () => handlers.onAddToFocus(task, group),
  };

  if (group === 'focus') {
    return { frequent: [complete], rare: [] };
  }

  if (group === 'timed' || group === 'today' || group === 'later') {
    return { frequent: [complete, addToFocus], rare: [] };
  }

  // Дальше — только `missed_deadline`/`missed_plan`.
  const rescheduleToday: TaskMenuItemData = {
    key: 'reschedule-today',
    label: t('today', 'actions.rescheduleToday'),
    icon: 'moveToToday',
    onSelect: () => handlers.onRescheduleToday(task.id),
  };
  const rescheduleTomorrow: TaskMenuItemData = {
    key: 'reschedule-tomorrow',
    label: t('today', 'actions.rescheduleTomorrow'),
    icon: 'moveToTomorrow',
    onSelect: () => handlers.onRescheduleTomorrow(task.id),
  };

  // «Изменить срок» — только «Просрочен срок» (`01§6`: "Actions: Complete /
  // Reschedule / Change deadline / Open"); «Не по плану» его не перечисляет.
  const rare: readonly TaskMenuItemData[] =
    group === 'missed_deadline'
      ? [
          {
            key: 'change-deadline',
            label: t('today', 'actions.changeDeadline'),
            icon: 'deadline',
            onSelect: () => handlers.onOpenDeadlinePicker(task),
          },
        ]
      : [];

  // «Добавить в Главное» — только `missed_plan` из этих двух (`missed_deadline`
  // исключена выше в заголовке функции, см. блок «M11»).
  const frequent =
    group === 'missed_plan'
      ? [complete, rescheduleToday, rescheduleTomorrow, addToFocus]
      : [complete, rescheduleToday, rescheduleTomorrow];

  return { frequent, rare };
}

/** Переопределение поведения чекбокса строки, пока активен режим
 * множественного выбора «Не по плану» (см. заголовок файла, блок «M09») —
 * `undefined` означает обычное поведение (Complete), задано только когда
 * строка принадлежит `missed_plan` И режим выбора активен. */
interface RowSelectionOverride {
  readonly selected: boolean;
  readonly onToggle: (selected: boolean) => void;
}

interface TodayTaskRowProps {
  readonly task: Task;
  readonly group: TodayGroup;
  readonly menuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly handlers: RowActionHandlers;
  /** Открытие Task Detail по клику на строку — см. заголовок файла. */
  readonly onOpen: (task: Task) => void;
  readonly selectionOverride?: RowSelectionOverride | undefined;
}

/** Слот `statusLabel` (`TaskRow`, "форматирует вызывающий код через
 * `@shagi/i18n`, компонент не трогает даты сам") — только у "По времени":
 * это единственная группа, где `01§6` явно требует видимый порядок по
 * времени, поэтому само время — минимально нужная подпись, чтобы порядок
 * строк был объясним на экране, а не только "магическим" результатом
 * сортировки. Остальные пять групп пока без `statusLabel`/`metadata` —
 * не требование этого пакета работ (только отбор/группировка/отрисовка,
 * не полный набор метаданных строки). */
function TodayTaskRow({
  task,
  group,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  handlers,
  onOpen,
  selectionOverride,
}: TodayTaskRowProps): ReactElement {
  const { frequent, rare } = buildTaskMenuActions(group, task, handlers);

  // Режим выбора «Не по плану» (M09, см. заголовок файла) подменяет
  // checked/onCheckedChange на переключатель ВЫБОРА — `completeTaskCommand`
  // не вызывается, пока `selectionOverride` задан. Без него (все остальные
  // пять групп, и сама `missed_plan` вне режима выбора) — прежнее поведение.
  const checked = selectionOverride !== undefined ? selectionOverride.selected : false;
  const state = selectionOverride?.selected === true ? 'selected' : groupRowState(group);
  const onCheckedChange =
    selectionOverride !== undefined
      ? (nextChecked: boolean) => selectionOverride.onToggle(nextChecked)
      : (nextChecked: boolean) => {
          if (nextChecked) handlers.onComplete(task.id);
        };

  return (
    <TaskRow
      title={task.title}
      checkboxLabel={task.title}
      checked={checked}
      state={state}
      onCheckedChange={onCheckedChange}
      onClick={(event) => {
        if (isInteractiveRowClick(event.target)) return;
        onOpen(task);
      }}
      {...(group === 'timed' && task.plannedTime !== null
        ? { statusLabel: formatTime(task.plannedTime) }
        : {})}
      trailing={
        // Обёртка нужна и чтобы дать `TaskMenu` (`position: absolute`,
        // см. `Menu.css`) позиционированного предка (тот же паттерн, что
        // `.dev-menu-anchor` в песочнице `packages/ui`), и чтобы остановить
        // всплытие клика по меню до обработчика открытия Task Detail на
        // самой строке (см. заголовок файла, блок «Открытие Task Detail») —
        // без отдельного CSS-класса, одно ключевое слово, не «сырой px»/hex,
        // гейт адгезии дизайн-системы его не ловит и не должен.
        <div style={{ position: 'relative' }} onClick={(event) => event.stopPropagation()}>
          <IconButton
            icon="more"
            label={t('today', 'menu.triggerLabel', { title: task.title })}
            variant="ghost"
            onClick={onToggleMenu}
          />
          <TaskMenu
            open={menuOpen}
            onClose={onCloseMenu}
            aria-label={t('today', 'menu.ariaLabel', { title: task.title })}
            frequentActions={frequent}
            rareActions={rare}
          />
        </div>
      }
    />
  );
}

/** Управление режимом множественного выбора «Не по плану» (M09, см.
 * заголовок файла) — `undefined` у пяти остальных групп: они мультивыбором
 * не оборудованы, `TodayGroupSection` для них рендерится без кнопки
 * «Выбрать» и без панели массовых действий вовсе. */
interface MissedPlanSelectionControls {
  readonly active: boolean;
  readonly selectedIds: ReadonlySet<Uuid>;
  readonly onToggleMode: () => void;
  readonly onToggleTask: (id: Uuid, selected: boolean) => void;
  readonly onBulkToday: () => void;
  readonly onBulkTomorrow: () => void;
}

interface TodayGroupSectionProps {
  readonly group: TodayGroup;
  readonly tasks: readonly Task[];
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly openMenuTaskId: Uuid | null;
  readonly onToggleMenu: (id: Uuid) => void;
  readonly onCloseMenu: () => void;
  readonly handlers: RowActionHandlers;
  /** См. заголовок файла, блок «Открытие Task Detail по клику на строку». */
  readonly onOpen: (task: Task) => void;
  readonly selection?: MissedPlanSelectionControls | undefined;
}

/** Заголовок группы — кликабельная кнопка (не просто `<h2>`), сворачивает/
 * разворачивает список задач под ним (M08, см. заголовок файла).
 * `aria-expanded`/`aria-controls` на кнопке — стандартный ARIA-паттерн
 * disclosure; список рендерится условно, когда свёрнут — не рендерится
 * вовсе (не `hidden`-атрибут поверх смонтированного списка), это тот же
 * "простой правильный способ" не заводить вторую копию состояния, что и
 * `refreshGroups` ниже. */
function TodayGroupSection({
  group,
  tasks,
  collapsed,
  onToggleCollapse,
  openMenuTaskId,
  onToggleMenu,
  onCloseMenu,
  handlers,
  onOpen,
  selection,
}: TodayGroupSectionProps): ReactElement {
  const listId = `today-group-${group}-list`;

  return (
    <section aria-label={groupLabel(group)}>
      <h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={listId}
          onClick={onToggleCollapse}
        >
          {groupLabel(group)}
        </button>
      </h2>
      {/* Кнопка входа/выхода из режима выбора — только «Не по плану» (M09,
       * см. заголовок файла), по образцу кнопки сворачивания секции выше:
       * тот же native `<button>`, тот же уровень визуальной весомости. */}
      {selection !== undefined && (
        <button type="button" onClick={selection.onToggleMode}>
          {selection.active ? t('today', 'selection.exit') : t('today', 'selection.enter')}
        </button>
      )}
      {/* Панель массовых действий — видна, пока выбрана хотя бы одна задача
       * (задание: не floating/sticky, минимально достаточная реализация). */}
      {selection !== undefined && selection.active && selection.selectedIds.size > 0 && (
        <div>
          <span>{t('today', 'bulk.selectedCount', { count: selection.selectedIds.size })}</span>
          <Button variant="secondary" onClick={selection.onBulkToday}>
            {t('today', 'bulk.today')}
          </Button>
          <Button variant="secondary" onClick={selection.onBulkTomorrow}>
            {t('today', 'bulk.tomorrow')}
          </Button>
        </div>
      )}
      {!collapsed && (
        <div id={listId}>
          {tasks.map((task) => (
            <TodayTaskRow
              key={task.id}
              task={task}
              group={group}
              menuOpen={openMenuTaskId === task.id}
              onToggleMenu={() => onToggleMenu(task.id)}
              onCloseMenu={onCloseMenu}
              handlers={handlers}
              onOpen={onOpen}
              selectionOverride={
                selection !== undefined && selection.active
                  ? {
                      selected: selection.selectedIds.has(task.id),
                      onToggle: (selected) => selection.onToggleTask(task.id, selected),
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface DeadlinePickerState {
  readonly task: Task;
  readonly visibleMonth: CalendarMonth;
}

/** Сценарий 2 (`missed_plan`) — задача ждёт подтверждения переноса даты
 * (см. заголовок файла, блок «M11»). */
interface FocusConfirmState {
  readonly task: Task;
}

/** Сценарий «4-я Focus-задача» — задача ждёт выбора, кого из трёх текущих
 * Focus-задач заменить; `group` — группа-источник самой новой задачи,
 * нужна дальше в `focusAssignmentPatch` (см. заголовок файла, блок «M11»).
 * `focusTasks` — снимок трёх текущих Focus-задач на момент открытия
 * диалога (те же три, что видны в группе «Главное»), список для выбора не
 * должен молча измениться под пользователем, пока диалог открыт. */
interface FocusReplaceState {
  readonly task: Task;
  readonly group: TodayGroup;
  readonly focusTasks: readonly Task[];
}

/** Патч назначения Focus на сегодня (сценарии 1/2 из блока «M11» в
 * заголовке файла) — решение по ГРУППЕ-источнику, не по повторному чтению
 * `plannedDate` задачи: `missed_plan` — единственная из четырёх групп с
 * этим действием, где `plannedDate` уже задан и не равен сегодня, поэтому
 * только для неё патч переносит и `plannedDate`. `dayBucket: 'default'` —
 * безусловно в обоих случаях ("Setting Focus clears `day_bucket=later`",
 * `01§6`) — идемпотентно, не зависит от текущего состояния задачи. */
function focusAssignmentPatch(group: TodayGroup): UpdateTaskPatch {
  const today = Temporal.Now.plainDateISO();
  return group === 'missed_plan'
    ? { plannedDate: today, focusDate: today, dayBucket: 'default' }
    : { focusDate: today, dayBucket: 'default' };
}

export function Today(): ReactElement {
  const storage = useStorage();
  const controller = useAppController();
  const [groups, setGroups] = useState<TodayGroups | null>(null);
  /** Счётчик активных Входящих для бейджа заголовка — см. заголовок файла,
   * блок «Бейдж Входящих». `null` только до первого разрешения эффекта
   * ниже (тот же смысл, что `groups === null` для остальной страницы). */
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [openMenuTaskId, setOpenMenuTaskId] = useState<Uuid | null>(null);
  const [collapsedOverride, setCollapsedOverride] = useState<Partial<Record<TodayGroup, boolean>>>(
    {},
  );
  const [deadlinePicker, setDeadlinePicker] = useState<DeadlinePickerState | null>(null);
  const [focusConfirm, setFocusConfirm] = useState<FocusConfirmState | null>(null);
  const [focusReplace, setFocusReplace] = useState<FocusReplaceState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Режим множественного выбора «Не по плану» (M09, см. заголовок файла) —
   * `selectedIds` пуст, пока `active === false`; вход и выход всегда идут
   * через `toggleMissedPlanSelectionMode`, которая сама следит, чтобы
   * выбор не пережил выход из режима. */
  const [missedPlanSelection, setMissedPlanSelection] = useState<{
    readonly active: boolean;
    readonly selectedIds: ReadonlySet<Uuid>;
  }>({ active: false, selectedIds: new Set() });

  useEffect(() => {
    let cancelled = false;
    const now = Temporal.Now.plainDateTimeISO();
    // Оба запроса — в одном эффекте (задание, см. заголовок файла блок
    // «Бейдж Входящих»): бейдж грузится "вместе с остальным", не отдельным
    // лишним запросом.
    void Promise.all([
      selectTodayTasks(storage, now),
      storage.tasks.listByCaptureStateAndStatus('inbox', 'active'),
    ]).then(([result, inboxTasks]) => {
      if (!cancelled) {
        setGroups(result);
        setInboxCount(inboxTasks.length);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  /** Перезапрашивает `selectTodayTasks` после успешной команды — задание:
   * "самый правильный способ — перезапросить selectTodayTasks после
   * успешной команды, а не мутировать локальное состояние вручную". */
  async function refreshGroups(): Promise<void> {
    const now = Temporal.Now.plainDateTimeISO();
    const result = await selectTodayTasks(storage, now);
    setGroups(result);
  }

  /** Общий разбор исхода команды (задание: "Обработай `status !== 'ok'` от
   * команд ... тихая ошибка недопустима"). `not_found`/`rejected` не
   * притворяются успехом — список не перезапрашивается, пользователь видит
   * `Toast`. */
  async function runCommand(promise: Promise<TaskCommandResult>): Promise<void> {
    const result = await promise;
    if (result.status === 'ok') {
      setErrorMessage(null);
      await refreshGroups();
      return;
    }
    setErrorMessage(t('today', 'errors.actionFailed'));
  }

  function commandDeps(): { storage: typeof storage; now: Temporal.Instant; deviceId: Uuid } {
    return { storage, now: Temporal.Now.instant(), deviceId: getDeviceId() };
  }

  /** «Выбрать» / «Готово» — вход и выход из режима выбора «Не по плану»
   * (M09, см. заголовок файла). Выход ВСЕГДА обнуляет `selectedIds`, а не
   * только когда панель массовых действий уже применилась — незавершённый
   * выбор не переживает выход из режима (проверено тестом «повторный клик
   * «Готово» ... сбрасывает выбор»). */
  function toggleMissedPlanSelectionMode(): void {
    setMissedPlanSelection((current) =>
      current.active
        ? { active: false, selectedIds: new Set() }
        : { active: true, selectedIds: new Set() },
    );
  }

  function toggleMissedPlanTaskSelected(id: Uuid, selected: boolean): void {
    setMissedPlanSelection((current) => {
      const nextIds = new Set(current.selectedIds);
      if (selected) nextIds.add(id);
      else nextIds.delete(id);
      return { ...current, selectedIds: nextIds };
    });
  }

  /** Bulk «Сегодня»/«Завтра» — см. заголовок файла, блок «M09» за полным
   * разбором решений (последовательные вызовы, единственный `refreshGroups`
   * в конце, отдельное сообщение `Toast` для частичного провала). Патч —
   * буквально только `plannedDate`: "Bulk never changes Deadline" (`01§6`)
   * выполняется тем, что в патче физически нет `deadlineDate`. */
  async function runMissedPlanBulkReschedule(plannedDate: Temporal.PlainDate): Promise<void> {
    const ids = [...missedPlanSelection.selectedIds];
    let anyFailed = false;
    for (const id of ids) {
      const result = await updateTaskCommand({ id, patch: { plannedDate } }, commandDeps());
      if (result.status !== 'ok') anyFailed = true;
    }
    await refreshGroups();
    setMissedPlanSelection({ active: false, selectedIds: new Set() });
    setErrorMessage(anyFailed ? t('today', 'errors.bulkPartialFailure') : null);
  }

  const handlers: RowActionHandlers = {
    // `completeOccurrenceCommand` (эпик E11.2, `@shagi/core`) — для НЕ
    // recurring задачи (`task.seriesId === null`) ведёт себя идентично
    // `completeTaskCommand` (тот же контракт, аддитивно расширенный
    // `series`/`generatedTask`/`generatedChecklistItems`, см. её
    // комментарий) — единственное отличие входа: обязательный
    // `occurrenceLocalDate`, уже материализованная локальная дата события
    // (CLAUDE.md «Время», не `Date`). Без этой замены recurring-задачи
    // никогда бы не генерировали следующий occurrence — только
    // `completeOccurrenceCommand` ветвится на `RecurrenceSeries`.
    onComplete: (id) => {
      void runCommand(
        completeOccurrenceCommand(
          { id, occurrenceLocalDate: Temporal.Now.plainDateISO() },
          commandDeps(),
        ),
      );
    },
    onRescheduleToday: (id) => {
      const plannedDate = Temporal.Now.plainDateISO();
      void runCommand(updateTaskCommand({ id, patch: { plannedDate } }, commandDeps()));
    },
    onRescheduleTomorrow: (id) => {
      const plannedDate = Temporal.Now.plainDateISO().add({ days: 1 });
      void runCommand(updateTaskCommand({ id, patch: { plannedDate } }, commandDeps()));
    },
    onOpenDeadlinePicker: (task) => {
      // Видимый месяц открывается на ТЕКУЩЕМ месяце, а не на месяце старого
      // дедлайна: типичный сценарий "просрочено" — перенести на близкую
      // дату (сегодня/скоро), а не листать календарь назад к старому
      // сроку; старая дата всё равно видна как `value` (выделена в сетке),
      // если попадает в открытый месяц.
      setDeadlinePicker({ task, visibleMonth: toCalendarMonth(Temporal.Now.plainDateISO()) });
    },
    onAddToFocus: (task, group) => {
      // Четвёртая задача перехватывает оба сценария ниже — см. заголовок
      // файла, блок «M11».
      if (groups !== null && groups.focus.length >= 3) {
        setFocusReplace({ task, group, focusTasks: groups.focus });
        return;
      }
      if (group === 'missed_plan') {
        // Сценарий 2 — есть что подтвердить (перенос даты).
        setFocusConfirm({ task });
        return;
      }
      // Сценарий 1 — `plannedDate` и так сегодня, подтверждать нечего.
      void runCommand(
        updateTaskCommand({ id: task.id, patch: focusAssignmentPatch(group) }, commandDeps()),
      );
    },
  };

  function handleConfirmFocus(): void {
    if (focusConfirm === null) return;
    const { task } = focusConfirm;
    setFocusConfirm(null);
    void runCommand(
      updateTaskCommand({ id: task.id, patch: focusAssignmentPatch('missed_plan') }, commandDeps()),
    );
  }

  /** Два ПОСЛЕДОВАТЕЛЬНЫХ вызова `updateTaskCommand`, не один атомарный
   * (см. заголовок файла, блок «M11» — известный узкий компромисс). Если
   * первый (снятие Focus со старой задачи) успешен, список обновляется
   * сразу после него — снятие уже реально произошло в хранилище, скрывать
   * это до исхода второго вызова означало бы показывать неактуальное
   * состояние. Если провалился именно второй (назначение новой) —
   * `runCommand` сам покажет `Toast`, не проглатывая ошибку. */
  async function handleReplaceFocus(replaced: Task): Promise<void> {
    if (focusReplace === null) return;
    const { task, group } = focusReplace;
    setFocusReplace(null);

    const removeResult = await updateTaskCommand(
      { id: replaced.id, patch: { focusDate: null } },
      commandDeps(),
    );
    if (removeResult.status !== 'ok') {
      setErrorMessage(t('today', 'errors.actionFailed'));
      return;
    }
    await refreshGroups();

    await runCommand(
      updateTaskCommand({ id: task.id, patch: focusAssignmentPatch(group) }, commandDeps()),
    );
  }

  function handleSelectDeadline(date: CalendarDate): void {
    if (deadlinePicker === null) return;
    const { task } = deadlinePicker;
    setDeadlinePicker(null);
    void runCommand(
      updateTaskCommand(
        { id: task.id, patch: { deadlineDate: fromCalendarDate(date) } },
        commandDeps(),
      ),
    );
  }

  const today = Temporal.Now.plainDateISO();

  return (
    <div>
      <h1>{t('today', 'pageTitle')}</h1>
      <p>{formatDate(today, { weekday: 'long' })}</p>
      <Button variant="secondary" onClick={() => controller.openQuickAdd('today')}>
        {t('today', 'quickAdd.button')}
      </Button>
      {/* Бейдж Входящих — скрыт при нуле (см. заголовок файла, блок
       * «Бейдж Входящих»), не рендерится, пока `inboxCount` не разрешился
       * (`null`) — та же семантика "ещё не знаем", что `groups === null`. */}
      {inboxCount !== null && inboxCount > 0 && (
        <button type="button" onClick={() => controller.goTo('inbox')}>
          <Icon name="archive" size={20} />
          {t('today', 'inboxBadge.label', { count: inboxCount })}
        </button>
      )}

      {errorMessage !== null && (
        <Toast
          variant="error"
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
          dismissLabel={t('today', 'errors.dismiss')}
        />
      )}

      {groups !== null && isEveryGroupEmpty(groups) && (
        <EmptyState
          icon={<Icon name="check" size={32} />}
          title={t('common', 'today.doneAll')}
          description={t('today', 'empty.description')}
        />
      )}

      {groups !== null &&
        GROUP_ORDER.filter((group) => groups[group].length > 0).map((group) => {
          const tasks = groups[group];
          const collapsed = collapsedOverride[group] ?? tasks.length > COLLAPSE_THRESHOLD;
          return (
            <TodayGroupSection
              key={group}
              group={group}
              tasks={tasks}
              collapsed={collapsed}
              onToggleCollapse={() =>
                setCollapsedOverride((prev) => ({ ...prev, [group]: !collapsed }))
              }
              openMenuTaskId={openMenuTaskId}
              onToggleMenu={(id) => setOpenMenuTaskId((current) => (current === id ? null : id))}
              onCloseMenu={() => setOpenMenuTaskId(null)}
              handlers={handlers}
              onOpen={(task) => controller.openTask(task.id)}
              // Мультивыбор — только «Не по плану» (`01§6`, см. заголовок
              // файла блок «M09»); остальные пять групп получают `undefined`
              // и рендерятся без кнопки «Выбрать»/панели массовых действий.
              selection={
                group === 'missed_plan'
                  ? {
                      active: missedPlanSelection.active,
                      selectedIds: missedPlanSelection.selectedIds,
                      onToggleMode: toggleMissedPlanSelectionMode,
                      onToggleTask: toggleMissedPlanTaskSelected,
                      onBulkToday: () => {
                        void runMissedPlanBulkReschedule(Temporal.Now.plainDateISO());
                      },
                      onBulkTomorrow: () => {
                        void runMissedPlanBulkReschedule(
                          Temporal.Now.plainDateISO().add({ days: 1 }),
                        );
                      },
                    }
                  : undefined
              }
            />
          );
        })}

      {deadlinePicker !== null && (
        <Modal
          open
          onClose={() => setDeadlinePicker(null)}
          title={t('today', 'deadlineDialog.title')}
        >
          <DatePicker
            value={
              deadlinePicker.task.deadlineDate !== null
                ? toCalendarDate(deadlinePicker.task.deadlineDate)
                : null
            }
            visibleMonth={deadlinePicker.visibleMonth}
            onVisibleMonthChange={(month) =>
              setDeadlinePicker((current) =>
                current === null ? null : { ...current, visibleMonth: month },
              )
            }
            onSelect={handleSelectDeadline}
            today={toCalendarDate(Temporal.Now.plainDateISO())}
            weekStartsOn={WEEKDAY_MONDAY}
            weekdayLabels={WEEKDAY_LABELS}
            monthLabels={MONTH_LABELS}
            label={t('today', 'deadlineDialog.gridLabel')}
            previousMonthLabel={t('today', 'deadlineDialog.prevMonth')}
            nextMonthLabel={t('today', 'deadlineDialog.nextMonth')}
          />
        </Modal>
      )}

      {focusConfirm !== null && (
        <Modal
          open
          onClose={() => setFocusConfirm(null)}
          title={t('today', 'focusDialog.confirmTitle')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setFocusConfirm(null)}>
                {t('today', 'focusDialog.cancel')}
              </Button>
              <Button variant="primary" onClick={handleConfirmFocus}>
                {t('today', 'focusDialog.confirm')}
              </Button>
            </>
          }
        >
          <p>{t('today', 'focusDialog.confirmBody', { title: focusConfirm.task.title })}</p>
        </Modal>
      )}

      {focusReplace !== null && (
        <Modal
          open
          onClose={() => setFocusReplace(null)}
          title={t('today', 'focusDialog.replaceTitle')}
        >
          <ul aria-label={t('today', 'focusDialog.replaceListLabel')}>
            {focusReplace.focusTasks.map((focusTask) => (
              <li key={focusTask.id}>
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    void handleReplaceFocus(focusTask);
                  }}
                >
                  {focusTask.title}
                </Button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
