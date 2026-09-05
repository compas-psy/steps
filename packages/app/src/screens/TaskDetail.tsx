/**
 * `TaskDetail` — экран одной задачи, M24 Simple / M25 Full
 * (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`), эпик E10, пакет работ
 * E10.2. Источник поведения — `01_PRODUCT_BEHAVIOR_R1.md` §17 «Task
 * Detail» (короткий раздел, дословно приведён ниже там, где решение прямо
 * на него опирается) плюс §10/§16 (конверсия чек-лист/subtask, лейблы —
 * уже реализованы командным слоем пакета работ E10.1, здесь только UI).
 *
 * --- Ключевое сознательное решение по объёму (см. задание E10.2) ----------
 *
 * §17 перечисляет полную иерархию M25 Full: 1) title/context, 2) description,
 * 3) Planning, 4) Organization, 5) Subtasks, 6) Checklist, 7) Attachments/
 * Links, 8) future activity. Пакет работ E10.2 построил 1, 2, 4, 5, 6 —
 * реально, функционально, с автосохранением через уже готовые команды
 * (`@shagi/core/commands`, пакеты E01/E10.1). 7 (Attachments/Links) —
 * СОЗНАТЕЛЬНО не строится полноценно: в дереве пакетов нет вообще никакого
 * командного слоя ни для `task_link`, ни для attachments (только read-only
 * storage-порты, E02) — нечем наполнить интерфейс, это отдельный будущий
 * эпик. Раздел не рендерится вовсе — то же решение, что
 * `ProjectHeader.menuSections={[]}` в `ProjectDetail.tsx`: честно пусто, не
 * выдуманные разделы.
 *
 * 3 (Planning) E10.2 оставил ТОЛЬКО НА ЧТЕНИЕ с честной пометкой
 * «редактирование дат появится в следующем обновлении» — редактор дат
 * (M27/M28/M31) был отдельным, ещё не начатым пакетом работ эпика E08.
 * **Пакет работ E08.2 закрывает этот раздел эпика E08** («Временные
 * редакторы и напоминания» — E08.1, командный слой напоминаний
 * `commands/reminder-*.ts`, был закрыт раньше): читальная заглушка
 * (`planning.comingSoon`) заменена настоящим редактором Available From/
 * Planned Date+Time/Duration/Deadline Date+Time + Explicit Reminder — блок
 * «--- Planning: редактор дат (эпик E08.2) ---» ниже разбирает решения
 * этого пакета работ подробно (date shortcuts, warning/blocking-баннеры,
 * общий под-компонент picker'а, explicit reminder). Работа с Temporal
 * по-прежнему зона повышенной аккуратности CLAUDE.md — редактор не трогает
 * `Date`, только `@js-temporal/polyfill`, и не переизобретает уже готовую
 * доменную арифметику сброса полей (`@shagi/core` `rules/field-resets.ts`)
 * или temporal-предикаты (`@shagi/core/temporal/predicates.ts`).
 *
 * M24 Simple перечисляет три частых действия: «Добавить дату» / «Приоритет»
 * / «Добавить заметку» (`quickActions.*` ниже) — все три настоящие кнопки:
 * «Приоритет» открывает picker приоритета (тот же `Modal`, что и «Изменить
 * приоритет» в разделе Organization — одна реализация, два входа), «Добавить
 * заметку» фокусирует поле описания (`descriptionRef`), «Добавить дату»
 * (эпик E08.2) открывает тот же picker Planned Date, что и раздел Planning
 * ниже — честное сообщение «скоро» (`quickActions.addDateUnavailable`,
 * приём «кликабельно, но честно» `SignIn.tsx`/`AppShell`) было верно только
 * пока редактора не существовало; теперь, когда он есть, кнопка открывает
 * его напрямую. Неиспользуемый ключ каталога `quickActions.addDateUnavailable`
 * удалён вместе с обработчиком (гейт `check-i18n-catalog.mjs` только
 * предупреждает о мёртвых ключах, не валит CI, но оставлять заведомо
 * неверную строку в каталоге — не повод её не убрать).
 *
 * `Готово` закрывает, не сохраняет (`01§17`, дословно: "`Готово` closes,
 * not saves") — сохранение уже произошло автосейвом по ходу редактирования,
 * кнопка вызывает только `controller.closeTask()` (см. `state/store.ts`).
 *
 * --- Autosave title/description — решение этого пакета работ --------------
 *
 * По `blur`, не по debounce на каждый keystroke: `updateTaskCommand` — не
 * бесплатная операция (валидация + транзакция + outbox-запись на каждый
 * вызов), а debounce-таймер добавлял бы состояние гонки между «ещё не
 * сработавшим таймером» и `closeTask()`/сменой задачи. `blur` — естественная
 * граница «пользователь закончил редактировать это поле», тот же момент,
 * когда веб-формы обычно валидируют поле. Локальный черновик (`titleDraft`/
 * `descriptionDraft`) сбрасывается на значение из хранилища только при смене
 * `task.id` (открыли другую задачу), не при каждом `loadAll()` — иначе
 * незавершённое редактирование одного поля стиралось бы результатом
 * действия в СОВСЕМ ДРУГОЙ секции экрана (например, смена приоритета) между
 * вводом текста и blur.
 *
 * --- Локальная идентичность устройства/владельца ---------------------------
 *
 * Тот же узкий приём, что `ProjectDetail.tsx`/`Today.tsx`/`FirstTask.tsx`
 * (`getLocalIdentity`) — персистентного порта идентичности ещё нет в дереве
 * пакетов, `ownerScope` (создание subtask) и `deviceId` (тай-брейк HLC всех
 * команд экрана) генерируются и кэшируются один раз за время жизни модуля.
 * Дублирование, не импорт приватной функции соседнего экрана — то же
 * решение, что уже задокументировано там.
 *
 * --- Единый deps на разные командные порты ----------------------------------
 *
 * `@shagi/storage` `StoragePort` структурно шире, чем каждый из узких
 * командных портов (`CommandStoragePort`/`CommandLabelStoragePort`/
 * `CommandTaskLabelStoragePort`, инверсия зависимости ADR-0003) — один и тот
 * же объект `storage` подходит под все три без адаптера (см. комментарий
 * `commands/storage-port.ts`/`label-port.ts`/`task-label-port.ts`). Поэтому
 * ниже один `commandDeps()` обслуживает команды Task/ChecklistItem/Label
 * целиком, и только `attachLabelToTaskCommand` получает отдельно собранный
 * `attachLabelDeps()` (у неё ДВА поля хранилища разом — `storage`+
 * `taskStorage`, оба указывают на тот же `storage`).
 *
 * --- Метки: создание сразу назначает задаче ---------------------------------
 *
 * Мини-форма создания новой метки — часть picker'а меток ЭТОЙ задачи, не
 * отдельного экрана управления метками (которого в дереве пакетов ещё нет) —
 * поэтому созданная метка сразу назначается задаче (`createLabelCommand` +
 * `attachLabelToTaskCommand` одним обработчиком), а не остаётся неприменённой
 * до отдельного клика по только что созданной кнопке-метке. Продуктовое
 * решение этого пакета работ, не буквальное требование задания.
 *
 * --- Ранг новых сущностей — всегда «в конец» --------------------------------
 *
 * Subtasks/Checklist создаются и конвертируются ТОЛЬКО в конец своего
 * списка (`appendTaskRank`/`appendChecklistRank` ниже) — на этом экране нет
 * drag-переупорядочивания (в отличие от `ProjectDetail.tsx`), поэтому
 * `resolveRank`/`insertBeforeRank`-подобная механика здесь не нужна.
 */
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
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
  attachLabelToTaskCommand,
  cancelReminderCommand,
  completeOccurrenceCommand,
  completeTaskCommand,
  convertChecklistItemToSubtaskCommand,
  convertSubtaskToChecklistItemCommand,
  createChecklistItemCommand,
  createExplicitReminderCommand,
  createLabelCommand,
  createTaskCommand,
  deleteChecklistItemCommand,
  deleteSeriesCommand,
  deleteTaskCommand,
  detachLabelFromTaskCommand,
  doesDurationCrossDeadline,
  generateDeviceId,
  generateUuidV7,
  isPlannedAfterDeadline,
  isReminderAfterDeadline,
  isTaskLabelActive,
  makeDurationMinutes,
  makePriority,
  parseRecurrenceRuleTemplate,
  replaceExplicitReminderCommand,
  resolveNextWeekMonday,
  resolveWeekend,
  skipOccurrenceCommand,
  undoCompleteOccurrenceCommand,
  undoDeleteTasksCommand,
  updateChecklistItemCommand,
  updateRecurringOccurrencePlanningCommand,
  updateTaskCommand,
  type ChecklistItem,
  type Label as LabelEntity,
  type NewRank,
  type NewTaskRank,
  type Priority,
  type Project,
  type RecurrenceRuleTemplate,
  type RecurrenceSeries,
  type Reminder,
  type Section,
  type Task,
  type UpdateTaskPatch,
  type Uuid,
  type ValidationIssue,
} from '@shagi/core';
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  ChecklistRow,
  DataPrivacyRow,
  DatePicker,
  DateChip,
  DeadlineChip,
  Divider,
  DurationChip,
  Icon,
  IconButton,
  Input,
  Label,
  Modal,
  Priority as PriorityBadge,
  Radio,
  RecurrenceChip,
  ReminderChip,
  SubtaskRow,
  TemporalConflict,
  Textarea,
  TimeChip,
  TimePicker,
  Toast,
  type CalendarDate,
  type CalendarMonth,
  type PriorityLevel,
  type TemporalConflictType,
  type TimeValue,
} from '@shagi/ui';
import { isAvailable, type NotificationPrecision } from '@shagi/platform';

import { useAppController, useHost, useStorage } from '../state/context.js';
import { UndoToast, useCommonUndoToast } from '../state/undo-toast.js';
import { reconcileReminderScheduleForTask } from '../state/reminder-reconciliation.js';
import './TaskDetail.css';

// --- Локальная идентичность устройства/владельца (см. заголовок файла) ------

interface LocalIdentity {
  readonly ownerScope: Uuid;
  readonly deviceId: Uuid;
}

let cachedLocalIdentity: LocalIdentity | null = null;

function getLocalIdentity(): LocalIdentity {
  cachedLocalIdentity ??= { ownerScope: generateUuidV7(), deviceId: generateDeviceId() };
  return cachedLocalIdentity;
}

// --- Приоритет: числовое значение ↔ подпись/визуальный уровень --------------

/** `Priority` — `Branded<1|2|3|4, 'Priority'>` (`@shagi/core`, `values.ts`);
 * читать как обычное число здесь безопасно — только для сопоставления с
 * `PriorityLevel`/подписью каталога, не для записи назад без `makePriority`. */
function priorityNumber(priority: Priority): 1 | 2 | 3 | 4 {
  return priority as unknown as 1 | 2 | 3 | 4;
}

function priorityLevelOf(priority: Priority): PriorityLevel {
  switch (priorityNumber(priority)) {
    case 1:
      return 'p1';
    case 2:
      return 'p2';
    case 3:
      return 'p3';
    default:
      return 'p4';
  }
}

/** Каждая ветка — литеральный вызов `t()` (не вычисленный ключ) ради
 * статического гейта `check-i18n-catalog.mjs` — тот же приём, что
 * `Today.tsx` `groupLabel`. */
function priorityLabel(priority: Priority): string {
  switch (priorityNumber(priority)) {
    case 1:
      return t('taskDetail', 'organization.priorityP1');
    case 2:
      return t('taskDetail', 'organization.priorityP2');
    case 3:
      return t('taskDetail', 'organization.priorityP3');
    default:
      return t('taskDetail', 'organization.priorityP4');
  }
}

const PRIORITY_LEVELS: readonly Priority[] = [
  makePriority(1),
  makePriority(2),
  makePriority(3),
  makePriority(4),
];

// --- Organization: подпись правила повтора (эпик E11.2) --------------------
//
// `RecurrenceSeries.templateJson` не несёт готового текста — разбираем его
// через `parseRecurrenceRuleTemplate` (`@shagi/core`, задание прямо просит
// не читать сырой JSON руками) и строим формулировку здесь. Точные
// словесные формы — решение этого пакета работ (задание: "реши сам
// разумную русскую формулировку"):
//  - интервал `N` (`каждые N дней/недель/...`) — ICU `plural` каталога
//    (`@shagi/i18n` `message-format.ts`), а не одна хардкоженная форма:
//    русское склонение числительных (1 день/2 дня/5 дней) не сводится к
//    одной строке;
//  - "29 февраля" (`unit:'year'`) получает правильный родительный падеж
//    БЕСПЛАТНО от `Intl`, если день и месяц форматируются ОДНИМ вызовом
//    `toLocaleString({day:'numeric', month:'long'})` — то же наблюдение,
//    что уже описано в `.ultraplan` заметках по локализации; 2024 —
//    тот же заведомо-верный високосный якорь, что `buildMonthLabels` выше
//    в этом файле;
//  - день недели ("каждый понедельник") показан в именительном падеже
//    ("Каждую неделю: понедельник") вместо дательного множественного
//    ("...по понедельникам") — грамматически верное склонение дня недели
//    во множественном дательном не входит ни в `weekdayName` (только
//    именительный), ни в публичный API `@shagi/nlp` (внутренние словари
//    accusative-форм не экспортируются) — переизобретать словарь склонений
//    ради одной подписи вне территории этого пакета работ.

const RECURRENCE_WEEKDAYS_MON_FRI: readonly number[] = [1, 2, 3, 4, 5];

function isRecurrenceWeekdaysMonFri(byWeekday: readonly number[]): boolean {
  return (
    byWeekday.length === RECURRENCE_WEEKDAYS_MON_FRI.length &&
    RECURRENCE_WEEKDAYS_MON_FRI.every((day) => byWeekday.includes(day))
  );
}

function recurrenceMonthDayLabel(month: number, day: number): string {
  return Temporal.PlainDate.from({ year: 2024, month, day }).toLocaleString(DEFAULT_LOCALE, {
    month: 'long',
    day: 'numeric',
  });
}

/** Каждая ветка — литеральный вызов `t()` (см. `priorityLabel` выше — тот же
 * приём ради статического гейта `check-i18n-catalog.mjs`). `switch` по
 * `rule.unit` без `default` — тот же приём, что `groupLabel`/`priorityLabel`:
 * исчерпывающий по `RecurrenceRuleUnit`, растущий тип перестанет
 * компилироваться, а не молча вернёт `undefined`. */
function recurrenceRuleLabel(rule: RecurrenceRuleTemplate): string {
  switch (rule.unit) {
    case 'day':
      return rule.interval === 1
        ? t('taskDetail', 'recurrence.everyDay')
        : t('taskDetail', 'recurrence.everyNDays', { interval: rule.interval });
    case 'week': {
      if (rule.byWeekday !== undefined && rule.byWeekday.length > 0) {
        if (isRecurrenceWeekdaysMonFri(rule.byWeekday)) {
          return t('taskDetail', 'recurrence.weekdays');
        }
        const days = rule.byWeekday
          .toSorted((a, b) => a - b)
          .map((day) => weekdayName(day, 'long'))
          .join(', ');
        return t('taskDetail', 'recurrence.weeklyOnDays', { days });
      }
      return rule.interval === 1
        ? t('taskDetail', 'recurrence.everyWeek')
        : t('taskDetail', 'recurrence.everyNWeeks', { interval: rule.interval });
    }
    case 'month':
      if (rule.byMonthDay !== undefined) {
        return t('taskDetail', 'recurrence.monthlyOnDay', { day: rule.byMonthDay });
      }
      return rule.interval === 1
        ? t('taskDetail', 'recurrence.everyMonth')
        : t('taskDetail', 'recurrence.everyNMonths', { interval: rule.interval });
    case 'year':
      if (rule.byMonth !== undefined && rule.byMonthDay !== undefined) {
        return t('taskDetail', 'recurrence.yearlyOnDate', {
          date: recurrenceMonthDayLabel(rule.byMonth, rule.byMonthDay),
        });
      }
      return rule.interval === 1
        ? t('taskDetail', 'recurrence.everyYear')
        : t('taskDetail', 'recurrence.everyNYears', { interval: rule.interval });
  }
}

// --- Planning: конвертация Temporal ↔ простые числа `@shagi/ui` -------------
//
// Тот же приём, что `Today.tsx` (см. её заголовок, блок «Календарь
// `DatePicker`») — `packages/ui` намеренно не зависит от
// `@js-temporal/polyfill`, конвертация в обе стороны и локализация подписей
// целиком на вызывающем коде. Дублирование этих пяти хелперов и двух
// констант меток — тот же узкий, уже трижды принятый в этом дереве пакетов
// компромисс (`Today.tsx`, `Inbox.tsx`, теперь этот экран): настоящее общее
// место для них — будущий переиспользуемый слой, которого пока нет ни в
// `packages/app`, ни в `packages/ui` (последний сознательно не может знать
// про Temporal).

function toCalendarDate(date: Temporal.PlainDate): CalendarDate {
  return { year: date.year, month: date.month, day: date.day };
}

function toCalendarMonth(date: Temporal.PlainDate): CalendarMonth {
  return { year: date.year, month: date.month };
}

function fromCalendarDate(date: CalendarDate): Temporal.PlainDate {
  return Temporal.PlainDate.from(date);
}

function toTimeValue(time: Temporal.PlainTime): TimeValue {
  return { hour: time.hour, minute: time.minute };
}

function fromTimeValue(value: TimeValue): Temporal.PlainTime {
  return Temporal.PlainTime.from(value);
}

const WEEKDAY_LABELS: readonly [string, string, string, string, string, string, string] = [
  weekdayName(WEEKDAY_SUNDAY, 'short'),
  weekdayName(WEEKDAY_MONDAY, 'short'),
  weekdayName(WEEKDAY_MONDAY + 1, 'short'),
  weekdayName(WEEKDAY_MONDAY + 2, 'short'),
  weekdayName(WEEKDAY_MONDAY + 3, 'short'),
  weekdayName(WEEKDAY_MONDAY + 4, 'short'),
  weekdayName(WEEKDAY_MONDAY + 5, 'short'),
];

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

// --- Planning: разбор `Reminder.localRuleJson` explicit-напоминания ---------

interface ParsedExplicitReminder {
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime | null;
}

/** `localRuleJson` объявлен непрозрачным на уровне типа `Reminder`
 * (`entities/reminder.ts`: "конкретизация — задача команд"), но
 * `createExplicitReminderCommand` (`reminder-explicit.ts`) документирует
 * ТОЧНУЮ форму, которую сама же и пишет: `{kind:'explicit', date, time,
 * firesAt}` (`date`/`time` — `Temporal.*#toString()`). Экрану нужно
 * показать текущее напоминание (`ReminderChip`) и предзаполнить picker при
 * «Изменить» — без чтения этой формы назад сделать это нечем (нет
 * отдельного набора полей `Reminder.date`/`Reminder.time`). Не более
 * рискованно, чем уже сложившееся сопряжение UI с точной формой домена в
 * других местах этого файла (например `buildHierarchy`/`buildPlanning` в
 * `@shagi/core` samples). Некорректная/чужая форма → `null`, не throw —
 * экран не должен упасть от неожиданного будущего формата. */
function parseExplicitReminderRule(reminder: Reminder): ParsedExplicitReminder | null {
  const raw = reminder.localRuleJson;
  const dateRaw = raw['date'];
  if (typeof dateRaw !== 'string') return null;
  try {
    const date = Temporal.PlainDate.from(dateRaw);
    const timeRaw = raw['time'];
    const time = typeof timeRaw === 'string' ? Temporal.PlainTime.from(timeRaw) : null;
    return { date, time };
  } catch {
    return null;
  }
}

/** Состояние одной из трёх модалок выбора даты (Available From/Planned/
 * Deadline) — только видимый месяц календаря; выбранное значение читается
 * из самой `task` (поля коммитятся немедленно, тот же приём, что picker'ы
 * Organization на этом экране), `null` — модалка закрыта. */
interface PlanningDatePickerState {
  readonly visibleMonth: CalendarMonth;
}

/** Состояние модалки Explicit Reminder — в отличие от трёх дат выше, дата
 * И время выбираются здесь ДО отправки одной команды
 * (`createExplicitReminderCommand` — нет отдельного шага "просто время"),
 * поэтому черновик держит оба значения, не только видимый месяц. */
interface ReminderPickerState {
  readonly visibleMonth: CalendarMonth;
  readonly date: CalendarDate | null;
  readonly time: TimeValue | null;
}

// --- Planning: блокирующие ошибки → сообщение у конкретного поля -----------
//
// `01§17`: "Invalid temporal field blocks only that field commit" — экран
// показывает ошибку РЯДОМ с полем, не общим `Toast`. `ValidationIssue.code`
// у temporal-правил 1–4 один и тот же (`TEMPORAL_CONFLICT`, см.
// `validation/task.ts`) — различать их приходится по `rule` (стабильный
// номер правила из конспекта, тот же, что уже использует `code` в остальном
// дереве пакетов), не по `code`.

/** Каждая ветка — литеральный вызов `t()` (см. `priorityLabel` выше — тот же
 * приём ради статического гейта `check-i18n-catalog.mjs`). */
function planningFieldErrorMessage(issue: ValidationIssue): string {
  switch (issue.rule) {
    case 1:
      return t('taskDetail', 'planning.errors.plannedTimeRequiresDate');
    case 2:
      return t('taskDetail', 'planning.errors.deadlineTimeRequiresDate');
    case 3:
      return t('taskDetail', 'planning.errors.plannedBeforeAvailableFrom');
    case 4:
      return t('taskDetail', 'planning.errors.deadlineBeforeAvailableFrom');
    case 25:
      return t('taskDetail', 'planning.errors.durationOutOfRange');
    default:
      return t('taskDetail', 'planning.errors.generic');
  }
}

/** Только `severity==='blocking'` — `rejected` от `updateTaskCommand` несёт
 * исключительно блокирующие issues по построению (`validation.valid===false`
 * тогда и только тогда, когда есть хотя бы один blocking, `validation/types.ts`
 * `buildResult`), но фильтр здесь как явная документация инварианта, а не
 * молчаливое допущение о форме входа. */
function mapIssuesToFieldErrors(issues: readonly ValidationIssue[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.severity !== 'blocking') continue;
    result[issue.field] = planningFieldErrorMessage(issue);
  }
  return result;
}

// --- Planning: warning-баннер (`TemporalConflict`) — живой пересчёт --------
//
// Источник — предикаты `@shagi/core/temporal/predicates.ts`, применённые
// ПРЯМО К ЗАГРУЖЕННОЙ `task` (уже сохранённое состояние: все поля этого
// экрана, кроме Duration, коммитятся немедленно по выбору в picker'е — см.
// `savePlanningPatch`), а не к `validation` из ответа ПОСЛЕДНЕЙ команды.
// Так баннер верен и сразу после открытия экрана (задача уже была в
// конфликте до того, как пользователь вообще что-то нажал — ответа команды
// в этот момент попросту нет), и после КАЖДОГО отдельного изменения поля
// (перечитанная `task`, не память об одном конкретном вызове). Единственное
// исключение — Duration: у него есть черновик/blur-разрыв (тот же приём,
// что title/description), поэтому здесь ЖИВОЙ ввод (`durationDraft`, если
// он парсится в валидное число) имеет приоритет над уже сохранённым
// `task.durationMin` — именно это даёт "мгновенную реакцию формы" ДО
// отправки для единственного поля этого экрана, где такой разрыв вообще
// есть. Это не альтернатива фиксу `TaskCommandResult['ok'].validation`
// (см. отчёт пакета работ) — тот фикс независимо ценен для будущих
// потребителей ответа команды, просто ЭТОТ баннер решил не зависеть от
// одного-единственного последнего вызова, а быть верным всегда.
interface Conflict {
  readonly type: TemporalConflictType;
  readonly message: string;
}

function computeConflicts(
  task: Task,
  durationDraft: string,
  explicitReminder: Reminder | null,
): readonly Conflict[] {
  const conflicts: Conflict[] = [];

  if (
    isPlannedAfterDeadline(task.plannedDate, task.plannedTime, task.deadlineDate, task.deadlineTime)
  ) {
    conflicts.push({
      type: 'plannedAfterDeadline',
      message: t('taskDetail', 'planning.conflicts.plannedAfterDeadline'),
    });
  }

  const draftMinutes = parseDurationDraftMinutes(durationDraft);
  const effectiveDuration = draftMinutes ?? task.durationMin;
  if (
    effectiveDuration !== null &&
    doesDurationCrossDeadline(
      task.plannedDate,
      task.plannedTime,
      makeDurationMinutes(effectiveDuration),
      task.deadlineDate,
      task.deadlineTime,
    )
  ) {
    conflicts.push({
      type: 'durationCrossesDeadline',
      message: t('taskDetail', 'planning.conflicts.durationCrossesDeadline'),
    });
  }

  if (explicitReminder !== null && task.deadlineDate !== null) {
    const parsedReminder = parseExplicitReminderRule(explicitReminder);
    if (
      parsedReminder !== null &&
      isReminderAfterDeadline(
        parsedReminder.date,
        parsedReminder.time,
        task.deadlineDate,
        task.deadlineTime,
      )
    ) {
      conflicts.push({
        type: 'reminderAfterDeadline',
        message: t('taskDetail', 'planning.conflicts.reminderAfterDeadline'),
      });
    }
  }

  return conflicts;
}

/** `null` — пусто/не число/вне диапазона 1..1440 (правило 25, `01§1`).
 * Модульный уровень (не замкнута на состояние компонента) — используется и
 * `handleDurationBlur` (коммит по blur), и `computeConflicts` (live-баннер
 * во время печати, до blur — см. её комментарий выше), одна реализация. */
function parseDurationDraftMinutes(draft: string): number | null {
  const trimmed = draft.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (parsed < 1 || parsed > 1440) return null;
  return parsed;
}

// --- Ранг новых сущностей — см. заголовок файла ------------------------------

function appendTaskRank(list: readonly Task[]): NewTaskRank {
  const last = list.at(-1);
  return last === undefined
    ? { placement: 'empty-list' }
    : { placement: 'end', lastRank: last.rank };
}

function appendChecklistRank(list: readonly ChecklistItem[]): NewRank {
  const last = list.at(-1);
  return last === undefined
    ? { placement: 'empty-list' }
    : { placement: 'end', lastRank: last.rank };
}

// --- Toast-уведомление: ошибки команд И честные пометки «скоро» -------------

interface Notice {
  readonly message: string;
  readonly variant: 'error' | 'default';
}

/** Общий разбор исхода команды — та же дисциплина, что `Today.tsx`/
 * `ProjectDetail.tsx` `runCommand`: `status!=='ok'` не проглатывается молча.
 * Генерик по исходу — разные команды этого экрана возвращают разные формы
 * (`TaskCommandResult`/`ChecklistItemCommandResult`/`LabelCommandResult`/
 * `AttachLabelResult`/...), но все три ветки статуса называются одинаково. */
async function runAndRefresh<T extends { readonly status: string }>(
  promise: Promise<T>,
  onOk: () => Promise<void>,
  onFail: () => void,
): Promise<T> {
  const result = await promise;
  if (result.status === 'ok') {
    await onOk();
  } else {
    onFail();
  }
  return result;
}

// --- Planning: общий под-компонент picker'а дат ------------------------------
//
// Available From/Planned/Deadline — три поля с одной и той же разметкой
// (`DatePicker` в `Modal`, опциональные шорткаты, опциональный `TimePicker`,
// опциональная очистка) — задание прямо просит не дублировать её три раза.
// `shortcuts`/`time` — `undefined`, когда полю они не нужны (Available From:
// ни того, ни другого; Deadline: только `time`; Planned: оба).
interface PlanningDateModalShortcut {
  readonly key: string;
  readonly label: string;
  readonly onClick: () => void;
}

interface PlanningDateModalTimeSlot {
  readonly value: TimeValue | null;
  readonly onSelect: (time: TimeValue) => void;
  readonly onClear: () => void;
  readonly clearLabel: string;
  readonly groupLabel: string;
  readonly hourListLabel: string;
  readonly minuteListLabel: string;
}

interface PlanningDateModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly gridLabel: string;
  readonly value: CalendarDate | null;
  readonly visibleMonth: CalendarMonth;
  readonly onVisibleMonthChange: (month: CalendarMonth) => void;
  readonly onSelectDate: (date: CalendarDate) => void;
  readonly onClearDate?: () => void;
  readonly clearDateLabel?: string;
  readonly shortcuts?: readonly PlanningDateModalShortcut[];
  /** `TimePicker` рендерится, только пока `value !== null` — тот же порядок,
   * что уже требует домен (правило 1/2: время без даты блокирующее). */
  readonly time?: PlanningDateModalTimeSlot;
}

function PlanningDateModal({
  open,
  onClose,
  title,
  gridLabel,
  value,
  visibleMonth,
  onVisibleMonthChange,
  onSelectDate,
  onClearDate,
  clearDateLabel,
  shortcuts,
  time,
}: PlanningDateModalProps): ReactElement {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('taskDetail', 'planning.picker.done')}
        </Button>
      }
    >
      {shortcuts !== undefined && (
        <div>
          {shortcuts.map((shortcut) => (
            <Button key={shortcut.key} variant="secondary" onClick={shortcut.onClick}>
              {shortcut.label}
            </Button>
          ))}
        </div>
      )}

      <DatePicker
        value={value}
        visibleMonth={visibleMonth}
        onVisibleMonthChange={onVisibleMonthChange}
        onSelect={onSelectDate}
        today={toCalendarDate(Temporal.Now.plainDateISO())}
        weekStartsOn={WEEKDAY_MONDAY}
        weekdayLabels={WEEKDAY_LABELS}
        monthLabels={MONTH_LABELS}
        label={gridLabel}
        previousMonthLabel={t('taskDetail', 'planning.picker.prevMonth')}
        nextMonthLabel={t('taskDetail', 'planning.picker.nextMonth')}
      />

      {onClearDate !== undefined && value !== null && (
        <Button variant="ghost" onClick={onClearDate}>
          {clearDateLabel}
        </Button>
      )}

      {time !== undefined && value !== null && (
        <div>
          <TimePicker
            value={time.value}
            onSelect={time.onSelect}
            label={time.groupLabel}
            hourListLabel={time.hourListLabel}
            minuteListLabel={time.minuteListLabel}
          />
          {time.value !== null && (
            <Button variant="ghost" onClick={time.onClear}>
              {time.clearLabel}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

// --- M26: Planning-поля, для которых recurring-задача спрашивает область
// применения (`01§11.6`/`§18.3`) — ровно те, что попадают в
// `RecurrenceOccurrenceTemplate` при scope="series" (`@shagi/core`
// `recurrence-template.ts`); title/priority/... сюда не входят намеренно.
const RECURRING_PLANNING_SCOPE_FIELDS = [
  'availableFrom',
  'plannedDate',
  'plannedTime',
  'durationMin',
  'deadlineDate',
  'deadlineTime',
] as const;

function touchesRecurringPlanningScope(patch: UpdateTaskPatch): boolean {
  return RECURRING_PLANNING_SCOPE_FIELDS.some((field) => field in patch);
}

interface PlanningRowProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions: ReactNode;
}

/**
 * Строка Planning-карточки (мокап M25, `docs/spec/DESIGN`, `sec-detail`:
 * одна карточка, строки «подпись/значение», разделённые волосяной чертой).
 * `DataPrivacyRow` (`@shagi/ui`, §10 «Account/Data») сюда не подходит ни
 * для одной из пяти Planning-строк — её `action` это ровно ОДИН слот, а
 * здесь у каждой строки либо два действия («Указать/Изменить» + условная
 * «Очистить»/«Отменить»), либо (Duration) редактируемое поле вместо
 * кнопки. Использует ТЕ ЖЕ CSS-классы, что `DataPrivacyRow.css`
 * (`shagi-data-privacy-row*`) — визуальная консистентность с
 * Organization-строками ниже (которые используют сам компонент), не
 * копирование чужой разметки как компонента.
 *
 * `flexWrap`/`flexBasis:'100%'` на `__text`/`flexShrink:1` на `__action` —
 * поверх готовых классов, тот же приём inline-style, что уже применяет
 * `Today.tsx` (`style={{ position: 'relative' }}`). Без них
 * `DataPrivacyRow.css`'s `flex-basis:0%`/`flex-shrink:0` (рассчитаны на
 * одну короткую кнопку) на узком экране схлопывают подпись почти до нуля
 * и обрезают вторую кнопку по краю экрана вместо переноса — здесь у
 * каждой строки может быть ДВЕ полноразмерные кнопки с длинными русскими
 * подписями, это не тот случай, под который рассчитан исходный CSS.
 */
function PlanningRow({ title, description, actions }: PlanningRowProps): ReactElement {
  return (
    <div className="shagi-data-privacy-row" style={{ flexWrap: 'wrap' }}>
      <span className="shagi-data-privacy-row__text" style={{ flexBasis: '100%' }}>
        <span className="shagi-data-privacy-row__title">{title}</span>
        {description !== undefined && (
          <span className="shagi-data-privacy-row__description">{description}</span>
        )}
      </span>
      <span className="shagi-data-privacy-row__action" style={{ flexWrap: 'wrap', flexShrink: 1 }}>
        {actions}
      </span>
    </div>
  );
}

export function TaskDetail(): ReactElement | null {
  const storage = useStorage();
  const host = useHost();
  const controller = useAppController();
  const taskId = controller.getState().selectedTaskId;

  const [task, setTask] = useState<Task | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [projectSections, setProjectSections] = useState<readonly Section[]>([]);
  const [activeProjects, setActiveProjects] = useState<readonly Project[]>([]);
  const [subtasks, setSubtasks] = useState<readonly Task[]>([]);
  const [checklistItems, setChecklistItems] = useState<readonly ChecklistItem[]>([]);
  const [allLabels, setAllLabels] = useState<readonly LabelEntity[]>([]);
  const [activeLabelIds, setActiveLabelIds] = useState<ReadonlySet<Uuid>>(new Set());

  /** Последняя ещё не завершённая правка поля (заголовок/описание/
   * длительность). Нужна кнопке «Готово»: правка коммитится на `blur`, а
   * клик по кнопке вызывает blur и `closeTask()` практически одновременно —
   * без ожидания экран Today успевал перемонтироваться и запросить
   * хранилище ДО того, как запись долетала, и показывал старое название.
   * Поймано живым прогоном: в базе уже «Отчёт переименован», на Today ещё
   * «Отправить квартальный отчёт». */
  const pendingEdit = useRef<Promise<unknown> | null>(null);
  /** Что уже отправлено в хранилище. Нужно, чтобы `blur` и «Готово» не
   * записали одну и ту же правку дважды: к моменту клика по кнопке
   * состояние `task` может ещё не успеть обновиться результатом
   * blur-коммита, и сравнение «черновик ≠ task.title» дало бы ложное
   * «есть что сохранить». */
  const committed = useRef<{ title: string | null; description: string | null }>({
    title: null,
    description: null,
  });

  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  /** 6-секундное «Отменить» (ST §58) — см. `undo-toast.tsx`. */
  const undoToast = useCommonUndoToast();
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [convertSubtaskConfirm, setConvertSubtaskConfirm] = useState<Task | null>(null);

  // --- Organization: повторы (эпик E11.2) — `null` для НЕ recurring задачи -
  const [recurrence, setRecurrence] = useState<{
    readonly series: RecurrenceSeries;
    readonly ruleLabel: string;
  } | null>(null);
  const [deleteSeriesConfirm, setDeleteSeriesConfirm] = useState(false);

  // --- Planning: состояние редактора дат (см. заголовок файла, эпик E08.2) --
  const [availableFromPicker, setAvailableFromPicker] = useState<PlanningDatePickerState | null>(
    null,
  );
  const [plannedPicker, setPlannedPicker] = useState<PlanningDatePickerState | null>(null);
  const [deadlinePicker, setDeadlinePicker] = useState<PlanningDatePickerState | null>(null);
  const [durationDraft, setDurationDraft] = useState('');
  /** Блокирующая ошибка команды планирования, привязанная к КОНКРЕТНОМУ полю
   * (`01§17`: "Invalid temporal field blocks only that field commit; other
   * editing remains possible") — ключ, это имя `ValidationIssue.field`
   * (`'plannedDate'`/`'deadlineTime'`/...), не общий `Toast` поверх экрана
   * (в отличие от `notice` выше, который остаётся для прочих секций). */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** M26 (`01§11.6`/`§18.3`) — Planning-патч recurring-задачи, отложенный до
   * выбора области применения (см. `savePlanningPatch` за полным
   * обоснованием: "молчаливое применение К ЛЮБОЙ области запрещено"). `null`
   * — диалог закрыт, коммитить нечего. */
  const [pendingPlanningPatch, setPendingPlanningPatch] = useState<UpdateTaskPatch | null>(null);
  const [explicitReminder, setExplicitReminder] = useState<Reminder | null>(null);
  const [reminderPicker, setReminderPicker] = useState<ReminderPickerState | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  /** ST10 (Task B6, SPEC §18/§11.1) — точность, с которой платформа реально
   * может запланировать напоминание; `null` до первой реконсиляции этого
   * экрана (см. `reconcileTaskReminders`), не запрошена заранее при
   * монтировании — запрос заранее (не just-in-time) запрещён §18. */
  const [schedulingPrecision, setSchedulingPrecision] = useState<NotificationPrecision | null>(
    null,
  );

  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  async function loadAll(): Promise<void> {
    if (taskId === null) return;
    const nextTask = await storage.tasks.findById(taskId);
    if (nextTask === null || nextTask.deletedAt !== null) {
      setTask(null);
      setNotFound(true);
      return;
    }
    setTask(nextTask);
    setNotFound(false);

    const [
      nextProject,
      nextSubtasks,
      nextChecklistItems,
      nextAllLabels,
      nextTaskLabels,
      nextActiveProjects,
      nextReminders,
      nextSeries,
    ] = await Promise.all([
      nextTask.projectId === null
        ? Promise.resolve(null)
        : storage.projects.findById(nextTask.projectId),
      storage.tasks.listDirectSubtasks(nextTask.id, 'active'),
      storage.checklistItems.listByTask(nextTask.id),
      storage.labels.listAll(),
      storage.taskLabels.listByTask(nextTask.id),
      storage.projects.listActive(),
      storage.reminders.listByTask(nextTask.id),
      nextTask.seriesId === null
        ? Promise.resolve(null)
        : storage.recurrenceSeries.findById(nextTask.seriesId),
    ]);
    setProject(nextProject);
    setSubtasks(nextSubtasks);
    setChecklistItems(nextChecklistItems);
    setAllLabels(nextAllLabels);
    setActiveLabelIds(
      new Set(nextTaskLabels.filter(isTaskLabelActive).map((link) => link.labelId)),
    );
    setActiveProjects(nextActiveProjects);
    // Организация: повтор (эпик E11.2) — `null` для НЕ recurring задачи
    // (`nextTask.seriesId === null`), см. заголовок файла раздел
    // «подпись правила повтора» за обоснованием формулировки.
    setRecurrence(
      nextSeries === null
        ? null
        : {
            series: nextSeries,
            ruleLabel: recurrenceRuleLabel(parseRecurrenceRuleTemplate(nextSeries.templateJson)),
          },
    );
    // Правило 19 (`02§2`, E08.1): максимум один АКТИВНЫЙ explicit reminder на
    // задачу — фильтр по `kind`+`enabled` тот же, что уже применяет
    // `reminder-cancel.ts` (см. её комментарий про `countExplicitByTask`,
    // которая считает и отменённые тоже — здесь, в отличие от той функции,
    // цель другая: показать ТЕКУЩЕЕ активное напоминание, не посчитать лимит).
    setExplicitReminder(
      nextReminders.find((reminder) => reminder.kind === 'explicit' && reminder.enabled) ?? null,
    );

    const nextSection =
      nextTask.sectionId === null ? null : await storage.sections.findById(nextTask.sectionId);
    setSection(nextSection);
    const nextProjectSections =
      nextTask.projectId === null ? [] : await storage.sections.listByProject(nextTask.projectId);
    setProjectSections(nextProjectSections);
  }

  useEffect(() => {
    let cancelled = false;
    void loadAll().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storage/taskId стабильны на время жизни экрана
  }, [storage, taskId]);

  // Черновики title/description сбрасываются на значение из хранилища ТОЛЬКО
  // при смене открытой задачи (см. заголовок файла, блок «Autosave») — не
  // при каждом `loadAll()`, иначе действие в другой секции экрана стирало бы
  // незавершённый ввод.
  useEffect(() => {
    if (task !== null) {
      setTitleDraft(task.title);
      setDescriptionDraft(task.description);
      setDurationDraft(task.durationMin === null ? '' : String(task.durationMin));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- намеренно только по task?.id, см. комментарий выше
  }, [task?.id]);

  function commandDeps(): { storage: typeof storage; now: Temporal.Instant; deviceId: Uuid } {
    return { storage, now: Temporal.Now.instant(), deviceId: getLocalIdentity().deviceId };
  }

  /** Зависимости команд `@shagi/core/commands` reminder-* (`reminder-port.ts`
   * `ReminderCommandDeps`) — отдельная форма от `commandDeps()`: два
   * "сейчас" (`now`/`nowLocal`), не одно (см. комментарий `ReminderCommandDeps`
   * в `@shagi/core` — `nowLocal` нужен правилу 34, `now` только outbox). */
  function reminderDeps(): {
    storage: typeof storage;
    now: Temporal.Instant;
    nowLocal: Temporal.PlainDateTime;
    deviceId: Uuid;
  } {
    return {
      storage,
      now: Temporal.Now.instant(),
      nowLocal: Temporal.Now.plainDateTimeISO(),
      deviceId: getLocalIdentity().deviceId,
    };
  }

  /** Реконсиляция расписания напоминаний ПОСЛЕ команд, меняющих желаемое
   * (create/cancel reminder, complete/delete subtask, 00§7 шаг 5) —
   * дешёвый путь по ОДНОЙ задаче (`reconcileReminderScheduleForTask`,
   * Task A3), не полный скан workspace. `Unavailable` (тестовый режим/
   * платформа без нативных уведомлений) молча пропускается — тот же
   * приём, что boot-эффекты `App.tsx`.
   *
   * **Task B6 (ST10).** Сразу после реконсиляции — ОДИН вызов
   * `getSchedulingCapability()`, результат уходит в `schedulingPrecision`
   * (не на каждый keystroke: этот метод и так вызывается только из
   * дискретных обработчиков команд экрана, не из живого ввода). Именно
   * здесь, а не отдельным эффектом при монтировании экрана — тот же повод,
   * что у самой реконсиляции: желаемое состояние (и то, способна ли
   * платформа его точно обещать) достоверно ровно после того, как
   * `create`/`cancel` reminder уже применились к хранилищу. */
  async function reconcileTaskReminders(targetTaskId: Uuid): Promise<void> {
    const scheduler = host.platform.notificationScheduler;
    if (!isAvailable(scheduler)) return;
    await reconcileReminderScheduleForTask(
      storage,
      scheduler,
      targetTaskId,
      Temporal.Now.plainDateTimeISO(),
      Temporal.Now.timeZoneId(),
    );
    setSchedulingPrecision(await scheduler.getSchedulingCapability());
  }

  function attachLabelDeps(): {
    storage: typeof storage;
    taskStorage: typeof storage;
    now: Temporal.Instant;
    deviceId: Uuid;
  } {
    return {
      storage,
      taskStorage: storage,
      now: Temporal.Now.instant(),
      deviceId: getLocalIdentity().deviceId,
    };
  }

  function showError(): void {
    setNotice({ message: t('taskDetail', 'errors.actionFailed'), variant: 'error' });
  }

  async function refreshOk(): Promise<void> {
    setNotice(null);
    await loadAll();
  }

  if (taskId === null) return null;

  if (notFound) {
    return (
      <div>
        <p>{t('taskDetail', 'errors.notFound')}</p>
        <Button variant="secondary" onClick={() => controller.closeTask()}>
          {t('taskDetail', 'back.label')}
        </Button>
      </div>
    );
  }

  if (task === null) return null;

  // --- Заголовок/контекст ---------------------------------------------------

  /** Единственное место, которое пишет название. Возвращает промис записи
   * либо `null`, если писать нечего. Вызывается и с `blur`, и с «Готово» —
   * второй путь нужен потому, что полагаться на `blur` нельзя: он может не
   * случиться вовсе (снятие фокуса программно, закрытие с клавиатуры), а
   * потерянная правка — худшее, что может сделать редактор. */
  function commitTitle(): Promise<unknown> | null {
    const trimmed = titleDraft;
    if (task === null) return null;
    if (trimmed === task.title || trimmed === committed.current.title) return null;
    committed.current.title = trimmed;
    const promise = runAndRefresh(
      updateTaskCommand({ id: task.id, patch: { title: trimmed } }, commandDeps()),
      refreshOk,
      showError,
    );
    pendingEdit.current = promise;
    return promise;
  }

  function handleTitleBlur(): void {
    void commitTitle();
  }

  /** То же самое для описания — см. `commitTitle`. */
  function commitDescription(): Promise<unknown> | null {
    if (task === null) return null;
    if (descriptionDraft === task.description || descriptionDraft === committed.current.description)
      return null;
    committed.current.description = descriptionDraft;
    const promise = runAndRefresh(
      updateTaskCommand({ id: task.id, patch: { description: descriptionDraft } }, commandDeps()),
      refreshOk,
      showError,
    );
    pendingEdit.current = promise;
    return promise;
  }

  function handleDescriptionBlur(): void {
    void commitDescription();
  }

  /** Закрытие карточки: сначала дописать несохранённое, потом уходить.
   * Найдено живым прогоном — правка названия и клик по «Готово» происходят
   * почти одновременно, и экран, на который мы возвращаемся, успевал
   * прочитать хранилище ДО записи: в базе уже новое название, на Today ещё
   * старое. */
  async function closeAfterPendingEdits(): Promise<void> {
    await Promise.all([pendingEdit.current, commitTitle(), commitDescription()]);
    controller.closeTask();
  }

  // `completeOccurrenceCommand` (эпик E11.2) — см. тот же комментарий в
  // `Today.tsx`/`ProjectDetail.tsx`: для НЕ recurring задачи (`seriesId ===
  // null`) ведёт себя идентично `completeTaskCommand`, обязательный вход
  // `occurrenceLocalDate` — уже материализованная локальная дата (CLAUDE.md
  // «Время»). Только ГЛАВНЫЙ чекбокс задачи — чекбоксы subtasks ниже
  // (`handleCompleteSubtask`) остаются на `completeTaskCommand`: subtasks не
  // могут сами иметь повтор (`01§11.1`).
  //
  // Реконсиляция ПОСЛЕ завершения (00§7 шаг 5, Task B5 — до этого фикса этот
  // главный чекбокс был единственным путём complete/delete в дереве
  // экранов, который НЕ вызывал `reconcileTaskReminders`: завершённая с
  // главного экрана задачи задача сохраняла живой native alarm со СТАРЫМ
  // заголовком до следующего полного скана на старте приложения —
  // `Today.tsx`/`ProjectDetail.tsx`/`Inbox.tsx`/`Plan.tsx`/`Search.tsx` уже
  // делали это, этот экран — нет).
  function handleComplete(): void {
    if (task === null || task.status === 'completed') return;
    const id = task.id;
    void runAndRefresh(
      completeOccurrenceCommand(
        { id, occurrenceLocalDate: Temporal.Now.plainDateISO() },
        commandDeps(),
      ),
      async () => {
        await refreshOk();
        await reconcileTaskReminders(id);
      },
      showError,
    );
  }

  const breadcrumbText =
    project === null
      ? t('taskDetail', 'breadcrumb.inbox')
      : section === null
        ? project.title
        : `${project.title} › ${section.title}`;

  // --- Planning: редактор дат (эпик E08.2) ------------------------------------
  //
  // Каждое поле коммитится НЕМЕДЛЕННО по выбору в picker'е (тот же приём,
  // что Organization-picker'ы этого экрана и `Today.tsx`), а не через
  // "черновик + Готово сохраняет всё разом" — `01§17` требует именно
  // автосейва по ходу редактирования, и это одновременно самый простой
  // способ дать warning-баннеру видеть уже РЕАЛЬНО сохранённое состояние
  // (см. `computeConflicts` ниже и заголовок файла/отчёт пакета работ).

  /** Общий путь сохранения одного patch'а Planning-поля. Успех — очищает
   * `fieldErrors` целиком (не мержит: предыдущая ошибка другого поля не
   * должна пережить успешное сохранение) и перечитывает задачу. Отклонение
   * (`01§17`: "Invalid temporal field blocks only that field commit") —
   * заменяет `fieldErrors` целиком на свежий разбор `validation.issues`, а
   * НЕ показывает общий `Toast` — конкретное поле покажет это само в JSX
   * ниже. `not_found` (задача исчезла под ногами, крайний случай) —
   * единственная ветка, которая всё-таки использует общий `notice`, как и
   * остальные секции экрана.
   *
   * **M26.** Для recurring-задачи (`task.seriesId !== null`) патч,
   * трогающий хотя бы одно из `RECURRING_PLANNING_SCOPE_FIELDS`, здесь НЕ
   * коммитится — вместо этого сохраняется в `pendingPlanningPatch`, диалог
   * выбора области (`§18.3`: "Молчаливое применение ко всей серии запрещено"
   * — читается как общий принцип, не только про "вся серия") открывается
   * ниже в JSX, а реальный коммит происходит из
   * `handleChooseRecurringPlanningScope` через
   * `updateRecurringOccurrencePlanningCommand`. Любые уже открытые Planning-
   * picker'ы закрываются — иначе диалог выбора области открылся бы ПОВЕРХ
   * picker'а, из которого пришёл вызов. Для НЕ recurring задачи поведение не
   * меняется (`01§11.6`: "One-off reschedule does not change the series
   * rule" применимо только к recurring, здесь просто нечего разграничивать). */
  async function savePlanningPatch(patch: UpdateTaskPatch): Promise<boolean> {
    if (task === null) return false;
    if (task.seriesId !== null && touchesRecurringPlanningScope(patch)) {
      setAvailableFromPicker(null);
      setPlannedPicker(null);
      setDeadlinePicker(null);
      setPendingPlanningPatch(patch);
      return false;
    }
    const result = await updateTaskCommand({ id: task.id, patch }, commandDeps());
    if (result.status === 'ok') {
      setFieldErrors({});
      await refreshOk();
      return true;
    }
    if (result.status === 'rejected') {
      setFieldErrors(mapIssuesToFieldErrors(result.validation.issues));
      return false;
    }
    showError();
    return false;
  }

  /** Коммитит `pendingPlanningPatch` с выбранной пользователем областью
   * (`updateRecurringOccurrencePlanningCommand`, `@shagi/core`) — та же
   * обработка результата (`ok`/`rejected`/`not_found`), что `savePlanningPatch`
   * применяет к обычному пути. */
  async function handleChooseRecurringPlanningScope(scope: 'occurrence' | 'series'): Promise<void> {
    if (task === null || pendingPlanningPatch === null) return;
    const patch = pendingPlanningPatch;
    setPendingPlanningPatch(null);
    const result = await updateRecurringOccurrencePlanningCommand(
      { id: task.id, scope, patch },
      commandDeps(),
    );
    if (result.status === 'ok') {
      setFieldErrors({});
      await refreshOk();
      return;
    }
    if (result.status === 'rejected') {
      setFieldErrors(mapIssuesToFieldErrors(result.validation.issues));
      return;
    }
    showError();
  }

  function handleFocusDescription(): void {
    descriptionRef.current?.focus();
  }

  // --- Planning: Available From ------------------------------------------------

  function openAvailableFromPicker(): void {
    const base = task?.availableFrom ?? Temporal.Now.plainDateISO();
    setAvailableFromPicker({ visibleMonth: toCalendarMonth(base) });
  }

  function handleSelectAvailableFrom(date: CalendarDate): void {
    // Закрывается сразу по выбору — одно значение, тот же UX, что picker'ы
    // проекта/раздела/приоритета этого экрана (`handleSelectProject` и
    // соседние); ошибка (если мутация отклонена) появится в основной
    // разметке экрана, не в уже закрытой модалке.
    setAvailableFromPicker(null);
    void savePlanningPatch({ availableFrom: fromCalendarDate(date) });
  }

  function handleClearAvailableFrom(): void {
    void savePlanningPatch({ availableFrom: null });
  }

  // --- Planning: Planned Date/Time ---------------------------------------------

  function openPlannedPicker(): void {
    const base = task?.plannedDate ?? Temporal.Now.plainDateISO();
    setPlannedPicker({ visibleMonth: toCalendarMonth(base) });
  }

  /** В отличие от Available From, модалка НЕ закрывается по выбору даты —
   * `TimePicker` должен появиться следом в ТОЙ ЖЕ модалке (домен требует
   * порядок "сперва дата, потом время", `01§5` правило 1); закрывает
   * модалку только явное «Готово» (footer) или очистка даты целиком. */
  function handleSelectPlannedDate(date: CalendarDate): void {
    void savePlanningPatch({ plannedDate: fromCalendarDate(date) });
  }

  function handleClearPlannedDate(): void {
    // Патч — буквально только `plannedDate:null`: домен (`clearPlannedDate`,
    // `rules/field-resets.ts`) сам снимает Time/Focus/day_bucket, оставляет
    // Duration (`01§5`) — UI не передаёт их и не дублирует это правило.
    setPlannedPicker(null);
    void savePlanningPatch({ plannedDate: null });
  }

  function handleSelectPlannedTime(time: TimeValue): void {
    void savePlanningPatch({ plannedTime: fromTimeValue(time) });
  }

  function handleClearPlannedTime(): void {
    void savePlanningPatch({ plannedTime: null });
  }

  // --- Planning: Duration — числовой `Input`, не отдельный компонент `@shagi/ui`
  // (задание: готового редактора длительности в дереве пакетов нет,
  // `packages/ui` вне территории этого пакета работ).

  /** Диапазон 1..1440 (правило 25) проверяется ЗДЕСЬ, на клиенте, ДО вызова
   * команды — не потому что домен не проверяет (проверяет, `validation/task.ts`
   * `checkDurationRange`), а потому что `DurationMinutes` — branded-тип:
   * `makeDurationMinutes` на некорректном значении БРОСАЕТ `RangeError`
   * (`values.ts`), и патч физически нельзя собрать с невалидным числом,
   * чтобы отправить его валидатору и получить назад аккуратный `rejected`.
   * Значит эта же проверка неизбежно живёт в UI — здесь она использует тот
   * же текст ошибки (`planning.errors.durationOutOfRange`), что и правило 25
   * показало бы, будь оно достижимо. */
  function handleDurationBlur(): void {
    if (task === null) return;
    const raw = durationDraft.trim();
    if (raw === '') {
      if (task.durationMin === null) return;
      void savePlanningPatch({ durationMin: null });
      return;
    }
    const parsed = parseDurationDraftMinutes(raw);
    if (parsed === null) {
      setFieldErrors((current) => ({
        ...current,
        durationMin: t('taskDetail', 'planning.errors.durationOutOfRange'),
      }));
      return;
    }
    if (task.durationMin === parsed) return;
    void savePlanningPatch({ durationMin: makeDurationMinutes(parsed) });
  }

  // --- Planning: Deadline Date/Time — тот же принцип, что Planned --------------

  function openDeadlinePicker(): void {
    const base = task?.deadlineDate ?? Temporal.Now.plainDateISO();
    setDeadlinePicker({ visibleMonth: toCalendarMonth(base) });
  }

  function handleSelectDeadlineDate(date: CalendarDate): void {
    void savePlanningPatch({ deadlineDate: fromCalendarDate(date) });
  }

  function handleClearDeadlineDate(): void {
    setDeadlinePicker(null);
    void savePlanningPatch({ deadlineDate: null });
  }

  function handleSelectDeadlineTime(time: TimeValue): void {
    void savePlanningPatch({ deadlineTime: fromTimeValue(time) });
  }

  function handleClearDeadlineTime(): void {
    void savePlanningPatch({ deadlineTime: null });
  }

  // --- Planning: Explicit Reminder (M31, `01§18`) ------------------------------

  /** Предзаполняет picker текущим напоминанием при «Изменить» (см.
   * `parseExplicitReminderRule`) — `null` при «Добавить». */
  function openReminderPicker(): void {
    if (explicitReminder !== null) {
      const parsed = parseExplicitReminderRule(explicitReminder);
      setReminderPicker({
        visibleMonth: toCalendarMonth(parsed?.date ?? Temporal.Now.plainDateISO()),
        date: parsed === null ? null : toCalendarDate(parsed.date),
        time: parsed?.time == null ? null : toTimeValue(parsed.time),
      });
      return;
    }
    setReminderPicker({
      visibleMonth: toCalendarMonth(Temporal.Now.plainDateISO()),
      date: null,
      time: null,
    });
  }

  function handleSelectReminderDate(date: CalendarDate): void {
    setReminderPicker((current) => (current === null ? null : { ...current, date }));
  }

  function handleSelectReminderTime(time: TimeValue): void {
    setReminderPicker((current) => (current === null ? null : { ...current, time }));
  }

  function handleClearReminderTime(): void {
    setReminderPicker((current) => (current === null ? null : { ...current, time: null }));
  }

  /**
   * «Изменить» (заголовок кнопки зависит от `explicitReminder !== null`,
   * см. JSX) — создаёт (`explicitReminder === null`) или атомарно заменяет
   * (`explicitReminder !== null`) существующий explicit reminder.
   *
   * Task B8 (ST10-расследование, владелец, Задача 3): раньше замена
   * делалась ДВУМЯ раздельными командами (`cancelReminderCommand`, затем
   * `createExplicitReminderCommand`) — каждая своя транзакция, коммит по
   * отдельности. Реальный gap: сбой (в т.ч. на Android — убийство
   * процесса ОС в фоне) ровно между двумя `await` оставлял пользователя
   * вовсе без напоминания — старое уже отменено, новое не создано.
   * `replaceExplicitReminderCommand` (`@shagi/core`, `reminder-replace.ts`)
   * заменяет обе команды ОДНОЙ атомарной мутацией: либо обе записи
   * применены, либо ни одна. Никакого UI-level `cancel → create` здесь
   * больше нет.
   */
  async function handleSubmitReminder(): Promise<void> {
    if (task === null || reminderPicker === null || reminderPicker.date === null) return;
    const date = fromCalendarDate(reminderPicker.date);
    const time = reminderPicker.time === null ? null : fromTimeValue(reminderPicker.time);
    const result =
      explicitReminder === null
        ? await createExplicitReminderCommand(
            {
              taskId: task.id,
              date,
              time,
              deadlineDate: task.deadlineDate,
              deadlineTime: task.deadlineTime,
            },
            reminderDeps(),
          )
        : await replaceExplicitReminderCommand(
            {
              old: explicitReminder,
              taskId: task.id,
              date,
              time,
              deadlineDate: task.deadlineDate,
              deadlineTime: task.deadlineTime,
            },
            reminderDeps(),
          );
    if (result.status === 'ok') {
      setReminderError(null);
      setReminderPicker(null);
      await refreshOk();
      // Реконсиляция ПОСЛЕ успешной domain-операции (создание ИЛИ атомарная
      // замена) — обе мутации уже применены к хранилищу,
      // `reconcileReminderScheduleForTask` читает желаемое состояние заново
      // (00§7 шаг 5).
      await reconcileTaskReminders(task.id);
      return;
    }
    // `stale` (владелец, hardening после Задачи 3) — `explicitReminder` в
    // React-состоянии уже не указывает на текущий active explicit reminder
    // (гонка), не про лимит правила 19 — общее сообщение об ошибке
    // (`errors.actionFailed`, тот же ключ, что уже использует `showError()`
    // ниже для прочих сбоёв этого экрана), не выдумываем новый текст ради
    // этого одного, редкого случая.
    setReminderError(
      result.status === 'stale'
        ? t('taskDetail', 'errors.actionFailed')
        : t('taskDetail', 'planning.reminder.limitError'),
    );
    // Task B8 (ST10-расследование, владелец, Задача 4 — фикс сохранён и
    // после перехода на атомарную замену, Задача 3): отказ не имеет права
    // оставить экран показывать устаревший `explicitReminder` —
    // `loadAll()` честно перечитывает canonical-состояние из хранилища
    // (в т.ч. `setExplicitReminder`, см. её комментарий про правило 19).
    // Ошибка (`reminderError` выше) при этом остаётся видимой — это не
    // «молчаливый отказ», картинка на экране просто перестаёт врать.
    await loadAll();
  }

  function handleCancelReminder(): void {
    if (explicitReminder === null) return;
    const reminder = explicitReminder;
    void (async () => {
      const result = await cancelReminderCommand({ reminder }, reminderDeps());
      if (result.status === 'ok' || result.status === 'already_cancelled') {
        setReminderError(null);
        await refreshOk();
        await reconcileTaskReminders(reminder.taskId);
      }
    })();
  }

  // --- Organization: повтор (эпик E11.2, `01§11.5`/`01§11.8`) ------------------

  /** «Пропустить это повторение» — `skipOccurrenceCommand` (`@shagi/core`):
   * та же генерация следующего occurrence, что и завершение, но текущий
   * получает `completionKind:'skipped'` вместо `'done'` (см. её
   * комментарий). Без подтверждения — обратимо тем же способом, что и
   * обычное завершение: 6-секундный Undo-тост (ST §58), см. ниже. */
  // Реконсиляция ПОСЛЕ пропуска — тот же пробел и тот же фикс, что у
  // `handleComplete` выше (Task B5): «Пропустить» тоже переводит текущий
  // occurrence в неактивное состояние (`completionKind:'skipped'`), и без
  // явной реконсиляции его native alarm тоже пережил бы отмену вплоть до
  // следующего полного скана.
  function handleSkipOccurrence(): void {
    if (task === null) return;
    const id = task.id;
    void (async () => {
      const result = await runAndRefresh(
        skipOccurrenceCommand(
          { id, occurrenceLocalDate: Temporal.Now.plainDateISO() },
          commandDeps(),
        ),
        async () => {
          await refreshOk();
          await reconcileTaskReminders(id);
        },
        showError,
      );
      if (result.status !== 'ok') return;
      // `01§11.5`: пропуск — обычное завершение с `completion_kind='skipped'`,
      // значит и Undo у него ровно тот же (ST §58 U3), включая снятие
      // сгенерированного следующего occurrence.
      const generatedId = result.generatedTask?.id ?? null;
      undoToast.offerUndo({
        message: t('common', 'undo.occurrenceSkipped'),
        undo: async () => {
          const undone = await undoCompleteOccurrenceCommand(
            { occurrenceId: id, generatedOccurrenceId: generatedId },
            commandDeps(),
          );
          if (undone.status !== 'ok') return 'failed';
          await refreshOk();
          await reconcileTaskReminders(id);
          if (generatedId !== null) await reconcileTaskReminders(generatedId);
          return undone.generatedOutcome === 'preserved_conflict' ? 'conflict' : 'ok';
        },
      });
    })();
  }

  /** «Удалить всю серию» (`01§11.8`) — подтверждение обязательно (тот же
   * паттерн `Modal`, что уже применён на этом экране для конвертации
   * subtask→checklist, задание): необратимое по ощущению действие.
   * `deleteSeriesCommand` tombstone-ит ТЕКУЩИЙ occurrence и останавливает
   * генерацию будущих (см. её комментарий) — после успеха экрану больше
   * нечего показывать, `controller.closeTask()`, тот же принцип, что если
   * бы задачу удалили обычным способом. */
  function handleConfirmDeleteSeries(): void {
    if (task === null) return;
    const currentOccurrenceId = task.id;
    setDeleteSeriesConfirm(false);
    void (async () => {
      const result = await deleteSeriesCommand({ currentOccurrenceId }, commandDeps());
      if (result.status === 'ok') {
        controller.closeTask();
        return;
      }
      showError();
    })();
  }

  // --- Organization: приоритет ------------------------------------------------

  function handleSetPriority(priority: Priority): void {
    if (task === null) return;
    setPriorityPickerOpen(false);
    void runAndRefresh(
      updateTaskCommand({ id: task.id, patch: { priority } }, commandDeps()),
      refreshOk,
      showError,
    );
  }

  // --- Organization: проект/раздел ---------------------------------------------

  function handleSelectProject(nextProject: Project | null): void {
    if (task === null) return;
    setProjectPickerOpen(false);
    const patch =
      nextProject === null
        ? {
            projectId: null,
            sectionId: null,
            originalProjectNameSnapshot: null,
            originalSectionNameSnapshot: null,
          }
        : {
            projectId: nextProject.id,
            sectionId: null,
            originalProjectNameSnapshot: nextProject.title,
            originalSectionNameSnapshot: null,
          };
    void runAndRefresh(
      updateTaskCommand({ id: task.id, patch }, commandDeps()),
      refreshOk,
      showError,
    );
  }

  function handleSelectSection(nextSection: Section | null): void {
    if (task === null) return;
    setSectionPickerOpen(false);
    void runAndRefresh(
      updateTaskCommand(
        {
          id: task.id,
          patch: {
            sectionId: nextSection?.id ?? null,
            originalSectionNameSnapshot: nextSection?.title ?? null,
          },
        },
        commandDeps(),
      ),
      refreshOk,
      showError,
    );
  }

  // --- Organization: метки -----------------------------------------------------

  function handleToggleLabel(label: LabelEntity): void {
    if (task === null) return;
    if (activeLabelIds.has(label.id)) {
      void runAndRefresh(
        detachLabelFromTaskCommand({ taskId: task.id, labelId: label.id }, commandDeps()),
        refreshOk,
        showError,
      );
      return;
    }
    void runAndRefresh(
      attachLabelToTaskCommand({ taskId: task.id, labelId: label.id }, attachLabelDeps()),
      refreshOk,
      showError,
    );
  }

  async function handleCreateLabel(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = newLabelName.trim();
    if (trimmed.length === 0 || task === null) return;
    setNewLabelName('');
    const created = await createLabelCommand(
      { displayName: trimmed, colorToken: null, rank: appendLabelRank() },
      commandDeps(),
    );
    if (created.status !== 'ok') {
      showError();
      return;
    }
    // Мини-форма — часть picker'а меток ЭТОЙ задачи (см. заголовок файла) —
    // созданная метка сразу назначается задаче, не остаётся неприменённой.
    await runAndRefresh(
      attachLabelToTaskCommand({ taskId: task.id, labelId: created.label.id }, attachLabelDeps()),
      refreshOk,
      showError,
    );
  }

  function appendLabelRank(): NewRank {
    const last = allLabels.at(-1);
    return last === undefined
      ? { placement: 'empty-list' }
      : { placement: 'end', lastRank: last.rank };
  }

  // --- Subtasks ------------------------------------------------------------

  function handleCompleteSubtask(subtask: Task): void {
    void (async () => {
      const result = await runAndRefresh(
        completeTaskCommand({ id: subtask.id }, commandDeps()),
        refreshOk,
        showError,
      );
      if (result.status === 'ok') await reconcileTaskReminders(subtask.id);
    })();
  }

  // Подзадача не каскадирует дальше (глубина иерархии ≤1, правило 7,
  // `@shagi/core`) — `affectedSubtaskIds` этого `deleteTaskCommand` всегда
  // пуст, поэтому здесь достаточно реконсиляции по одной этой задаче (в
  // отличие от удаления ВЕРХНЕУРОВНЕВОЙ задачи, см. `handleDelete` на
  // Today/Inbox/ProjectDetail).
  function handleDeleteSubtask(subtask: Task): void {
    void (async () => {
      const result = await runAndRefresh(
        deleteTaskCommand({ id: subtask.id }, commandDeps()),
        refreshOk,
        showError,
      );
      if (result.status !== 'ok') return;
      await reconcileTaskReminders(subtask.id);
      undoToast.offerUndo({
        message: t('common', 'undo.taskDeleted'),
        undo: async () => {
          const undone = await undoDeleteTasksCommand(
            {
              ids: [subtask.id],
              subtaskIds: result.affectedSubtaskIds,
              checklistItems: result.affectedChecklistItems,
            },
            commandDeps(),
          );
          if (undone.status !== 'ok') return 'failed';
          await refreshOk();
          await reconcileTaskReminders(subtask.id);
          return 'ok';
        },
      });
    })();
  }

  function handleAddSubtask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = newSubtaskTitle.trim();
    if (trimmed.length === 0 || task === null) return;
    setNewSubtaskTitle('');
    const { ownerScope } = getLocalIdentity();
    void runAndRefresh(
      createTaskCommand(
        {
          ownerScope,
          title: trimmed,
          parentTaskId: task.id,
          projectId: task.projectId,
          sectionId: task.sectionId,
          captureState: 'processed',
          source: 'user',
          sourceChannel: 'text',
          rank: appendTaskRank(subtasks),
        },
        commandDeps(),
      ),
      refreshOk,
      showError,
    );
  }

  function handleConfirmConvertSubtask(): void {
    if (task === null || convertSubtaskConfirm === null) return;
    const subtask = convertSubtaskConfirm;
    setConvertSubtaskConfirm(null);
    void runAndRefresh(
      convertSubtaskToChecklistItemCommand(
        { taskId: subtask.id, targetTaskId: task.id, rank: appendChecklistRank(checklistItems) },
        commandDeps(),
      ),
      refreshOk,
      showError,
    );
  }

  // --- Checklist -------------------------------------------------------------

  function handleToggleChecklistItem(item: ChecklistItem, done: boolean): void {
    if (task === null) return;
    void runAndRefresh(
      updateChecklistItemCommand({ taskId: task.id, id: item.id, patch: { done } }, commandDeps()),
      refreshOk,
      showError,
    );
  }

  function handleDeleteChecklistItem(item: ChecklistItem): void {
    if (task === null) return;
    void runAndRefresh(
      deleteChecklistItemCommand({ taskId: task.id, id: item.id }, commandDeps()),
      refreshOk,
      showError,
    );
  }

  function handleAddChecklistItem(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = newChecklistText.trim();
    if (trimmed.length === 0 || task === null) return;
    setNewChecklistText('');
    void runAndRefresh(
      createChecklistItemCommand(
        { taskId: task.id, text: trimmed, rank: appendChecklistRank(checklistItems) },
        commandDeps(),
      ),
      refreshOk,
      showError,
    );
  }

  function handleConvertChecklistItemToSubtask(item: ChecklistItem): void {
    if (task === null) return;
    const { ownerScope } = getLocalIdentity();
    void runAndRefresh(
      convertChecklistItemToSubtaskCommand(
        {
          checklistItemId: item.id,
          parentTaskId: task.id,
          ownerScope,
          rank: appendTaskRank(subtasks),
        },
        commandDeps(),
      ),
      refreshOk,
      showError,
    );
  }

  return (
    <div className="shagi-task-detail-screen">
      {notice !== null && (
        <Toast
          variant={notice.variant === 'error' ? 'error' : 'default'}
          message={notice.message}
          onDismiss={() => setNotice(null)}
          dismissLabel={t('taskDetail', 'errors.dismiss')}
        />
      )}

      <UndoToast controller={undoToast} />

      {/* --- 1. Заголовок/контекст --------------------------------------- */}
      {/* Верхняя полоса по макету `[R1][M][24]`: стрелка возврата слева,
       * «Готово» справа. Оба закрывают карточку — правки сохраняются сами
       * (см. заголовок файла), отменять нечего, и второй элемент не прячет
       * другого поведения: стрелка — привычный жест, «Готово» — явный. */}
      <div className="shagi-task-detail-screen__topbar">
        <IconButton
          icon="back"
          label={t('taskDetail', 'backArrow.label')}
          onClick={() => void closeAfterPendingEdits()}
        />
        <Button variant="ghost" onClick={() => void closeAfterPendingEdits()}>
          {t('taskDetail', 'back.label')}
        </Button>
      </div>

      <div className="shagi-task-detail-screen__header">
        <Checkbox
          aria-label={t('taskDetail', 'completeCheckbox.label', { title: task.title })}
          checked={task.status === 'completed'}
          disabled={task.status === 'completed'}
          onChange={(event) => {
            if (event.target.checked) handleComplete();
          }}
        />
        <div className="shagi-task-detail-screen__title-input">
          <Input
            aria-label={t('taskDetail', 'title.label')}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(event) => {
              // Enter применяет правку. Раньше не применял вовсе: сохранение
              // висело только на `blur`, и человек, нажавший Enter (самый
              // очевидный жест «готово» в однострочном поле), не получал
              // ничего. Не отдельный путь сохранения, а тот же самый:
              // снимаем фокус, и коммит идёт через `handleTitleBlur` —
              // двух реализаций одного действия не появляется.
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>
      <p
        className="shagi-task-detail-screen__breadcrumb"
        aria-label={t('taskDetail', 'breadcrumb.ariaLabel')}
      >
        {breadcrumbText}
      </p>

      {/* M24 Simple: три частых действия — см. заголовок файла. «Добавить
       * дату» теперь открывает настоящий редактор Planned Date (тот же
       * picker, что раздел Planning ниже) — заглушка `planning.comingSoon`/
       * `quickActions.addDateUnavailable` эпика E08.2 заменена реальной
       * функциональностью. */}
      {/* Вертикальный список «иконка + подпись», а не ряд кнопок-пилюль:
       * так их рисует макет `[R1][M][24]`. Кнопками они остаются по сути
       * (нажимаются, попадают в порядок обхода) — меняется только вид. */}
      <div className="shagi-task-detail-screen__quick-actions">
        <button
          type="button"
          className="shagi-task-detail-screen__quick-action"
          onClick={openPlannedPicker}
        >
          <Icon name="calendar" size={18} />
          <span>{t('taskDetail', 'quickActions.addDate')}</span>
        </button>
        <button
          type="button"
          className="shagi-task-detail-screen__quick-action"
          onClick={() => setPriorityPickerOpen(true)}
        >
          <Icon name="star" size={18} />
          <span>{t('taskDetail', 'quickActions.priority')}</span>
        </button>
        <button
          type="button"
          className="shagi-task-detail-screen__quick-action"
          onClick={handleFocusDescription}
        >
          <Icon name="list" size={18} />
          <span>{t('taskDetail', 'quickActions.addNote')}</span>
        </button>
      </div>

      {/* --- 2. Description ------------------------------------------------ */}
      <section>
        <h2>{t('taskDetail', 'description.sectionTitle')}</h2>
        <Textarea
          ref={descriptionRef}
          aria-label={t('taskDetail', 'description.label')}
          placeholder={t('taskDetail', 'description.placeholder')}
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </section>

      {/* --- 3. Planning — редактор дат (эпик E08.2) -------------------------
       * Визуальная группировка мокапа M25 (`docs/spec/DESIGN`, `sec-detail`):
       * одна карточка, строки «подпись / значение», разделённые волосяной
       * чертой — все пять строк используют локальный `PlanningRow` (см. его
       * заголовок за полным обоснованием, почему не `DataPrivacyRow`). */}
      <section>
        <h2>{t('taskDetail', 'planning.sectionTitle')}</h2>

        <Card>
          <CardBody padding="none">
            <PlanningRow
              title={t('taskDetail', 'planning.availableFrom.label')}
              description={
                task.availableFrom !== null ? (
                  <DateChip label={formatDate(task.availableFrom)} />
                ) : (
                  t('taskDetail', 'planning.availableFrom.empty')
                )
              }
              actions={
                <>
                  <Button variant="secondary" onClick={openAvailableFromPicker}>
                    {task.availableFrom !== null
                      ? t('taskDetail', 'planning.availableFrom.change')
                      : t('taskDetail', 'planning.availableFrom.set')}
                  </Button>
                  {task.availableFrom !== null && (
                    <Button variant="ghost" onClick={handleClearAvailableFrom}>
                      {t('taskDetail', 'planning.availableFrom.clear')}
                    </Button>
                  )}
                </>
              }
            />
            {fieldErrors['availableFrom'] !== undefined && <p>{fieldErrors['availableFrom']}</p>}

            <Divider />

            <PlanningRow
              title={t('taskDetail', 'planning.planned.label')}
              description={
                <>
                  {task.plannedDate !== null ? (
                    <DateChip label={formatDate(task.plannedDate)} />
                  ) : (
                    t('taskDetail', 'planning.planned.empty')
                  )}
                  {task.plannedTime !== null && <TimeChip label={formatTime(task.plannedTime)} />}
                </>
              }
              actions={
                <>
                  <Button variant="secondary" onClick={openPlannedPicker}>
                    {task.plannedDate !== null
                      ? t('taskDetail', 'planning.planned.change')
                      : t('taskDetail', 'planning.planned.set')}
                  </Button>
                  {task.plannedDate !== null && (
                    <Button variant="ghost" onClick={handleClearPlannedDate}>
                      {t('taskDetail', 'planning.planned.clearDate')}
                    </Button>
                  )}
                </>
              }
            />
            {fieldErrors['plannedDate'] !== undefined && <p>{fieldErrors['plannedDate']}</p>}
            {fieldErrors['plannedTime'] !== undefined && <p>{fieldErrors['plannedTime']}</p>}

            <Divider />

            {/* Duration — не действие, редактируемое поле вместо кнопки в
             * слоте действия, тот же визуальный ряд, что у остальных строк. */}
            <PlanningRow
              title={t('taskDetail', 'planning.duration.label')}
              actions={
                <>
                  <Input
                    aria-label={t('taskDetail', 'planning.duration.label')}
                    type="number"
                    min={1}
                    max={1440}
                    placeholder={t('taskDetail', 'planning.duration.placeholder')}
                    value={durationDraft}
                    onChange={(event) => setDurationDraft(event.target.value)}
                    onBlur={handleDurationBlur}
                    error={fieldErrors['durationMin'] !== undefined}
                    errorMessage={fieldErrors['durationMin']}
                  />
                  {task.durationMin !== null && (
                    <DurationChip
                      label={t('taskDetail', 'planning.duration.chipLabel', {
                        count: task.durationMin,
                      })}
                    />
                  )}
                </>
              }
            />

            <Divider />

            <PlanningRow
              title={t('taskDetail', 'planning.deadline.label')}
              description={
                <>
                  {task.deadlineDate !== null ? (
                    <DeadlineChip label={formatDate(task.deadlineDate)} />
                  ) : (
                    t('taskDetail', 'planning.deadline.empty')
                  )}
                  {task.deadlineTime !== null && <TimeChip label={formatTime(task.deadlineTime)} />}
                </>
              }
              actions={
                <>
                  <Button variant="secondary" onClick={openDeadlinePicker}>
                    {task.deadlineDate !== null
                      ? t('taskDetail', 'planning.deadline.change')
                      : t('taskDetail', 'planning.deadline.set')}
                  </Button>
                  {task.deadlineDate !== null && (
                    <Button variant="ghost" onClick={handleClearDeadlineDate}>
                      {t('taskDetail', 'planning.deadline.clearDate')}
                    </Button>
                  )}
                </>
              }
            />
            {fieldErrors['deadlineDate'] !== undefined && <p>{fieldErrors['deadlineDate']}</p>}
            {fieldErrors['deadlineTime'] !== undefined && <p>{fieldErrors['deadlineTime']}</p>}

            <Divider />

            {/* Explicit Reminder (M31, `01§18`) — условная вторая кнопка
             * («Отменить»), та же форма, что три строки выше. */}
            <PlanningRow
              title={t('taskDetail', 'planning.reminder.label')}
              description={(() => {
                const parsedReminder =
                  explicitReminder !== null ? parseExplicitReminderRule(explicitReminder) : null;
                return parsedReminder !== null ? (
                  <ReminderChip
                    label={
                      parsedReminder.time !== null
                        ? `${formatDate(parsedReminder.date)} ${formatTime(parsedReminder.time)}`
                        : formatDate(parsedReminder.date)
                    }
                  />
                ) : (
                  t('taskDetail', 'planning.reminder.empty')
                );
              })()}
              actions={
                <>
                  <Button variant="secondary" onClick={openReminderPicker}>
                    {explicitReminder !== null
                      ? t('taskDetail', 'planning.reminder.change')
                      : t('taskDetail', 'planning.reminder.add')}
                  </Button>
                  {explicitReminder !== null && (
                    <Button variant="ghost" onClick={handleCancelReminder}>
                      {t('taskDetail', 'planning.reminder.cancel')}
                    </Button>
                  )}
                </>
              }
            />
            {reminderError !== null && <p>{reminderError}</p>}

            {/* ST10 (Task B6, `01§18`/`00§11.1`) — just-in-time disclosure,
             * НЕ upfront-запрос при первом запуске: показывается только
             * после того, как реконсиляция (`reconcileTaskReminders`) уже
             * реально спросила платформу и получила честный `'inexact'`, и
             * только пока на задаче есть активное напоминание (без него
             * пониженная точность ничего для этого человека прямо сейчас
             * не значит). Кнопка — только когда `exactAlarmSettings`
             * реально доступен (`isAvailable`, тот же идиом, что
             * `DataPrivacy.tsx` `isAvailable(scheduler)`) — на платформах
             * без системного экрана настроек (Web/Windows) её попросту
             * негде показывать. */}
            {schedulingPrecision === 'inexact' && explicitReminder !== null && (
              <PlanningRow
                title={t('taskDetail', 'planning.reminder.inexactNotice')}
                actions={
                  isAvailable(host.platform.exactAlarmSettings) && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (isAvailable(host.platform.exactAlarmSettings)) {
                          void host.platform.exactAlarmSettings.openSettings();
                        }
                      }}
                    >
                      {t('taskDetail', 'planning.reminder.openExactAlarmSettings')}
                    </Button>
                  )
                }
              />
            )}
          </CardBody>
        </Card>

        {/* Warning-баннеры — см. `computeConflicts` за источником. Вне
         * карточки, под ней: баннер — не строка настроек, ему некуда встать
         * внутрь ряда «подпись/значение». */}
        {computeConflicts(task, durationDraft, explicitReminder).map((conflict) => (
          <TemporalConflict key={conflict.type} type={conflict.type} message={conflict.message} />
        ))}
      </section>

      {/* --- 4. Organization ------------------------------------------------
       * Та же группировка карточка+разделитель, что Planning выше — но
       * ТОЛЬКО для трёх строк с ровно одним действием (Priority/Project/
       * Section): именно они попадают под форму `DataPrivacyRow` (§10
       * «Account/Data», один слот `action`). Labels и Recurrence ниже —
       * другая природа (список чипов+форма создания; два разнотипных
       * действия), их разметка не тронута. */}
      <section>
        <h2>{t('taskDetail', 'organization.sectionTitle')}</h2>

        <Card>
          <CardBody padding="none">
            <DataPrivacyRow
              title={t('taskDetail', 'organization.priorityLabel')}
              description={
                <PriorityBadge level={priorityLevelOf(task.priority)}>
                  {priorityLabel(task.priority)}
                </PriorityBadge>
              }
              action={{
                kind: 'button',
                label: t('taskDetail', 'organization.priorityChangeLabel'),
                onClick: () => setPriorityPickerOpen(true),
              }}
            />
            <Divider />
            <DataPrivacyRow
              title={t('taskDetail', 'organization.projectLabel')}
              description={project?.title ?? t('taskDetail', 'organization.projectNone')}
              action={{
                kind: 'button',
                label: t('taskDetail', 'organization.projectChangeLabel'),
                onClick: () => setProjectPickerOpen(true),
              }}
            />
            {task.projectId !== null && (
              <>
                <Divider />
                <DataPrivacyRow
                  title={section?.title ?? t('taskDetail', 'organization.sectionNone')}
                  action={{
                    kind: 'button',
                    label: t('taskDetail', 'organization.sectionChangeLabel'),
                    onClick: () => setSectionPickerOpen(true),
                  }}
                />
              </>
            )}
          </CardBody>
        </Card>

        <div>
          <h3>{t('taskDetail', 'organization.labelsTitle')}</h3>
          {allLabels.map((label) => (
            <Label
              key={label.id}
              selected={activeLabelIds.has(label.id)}
              onClick={() => handleToggleLabel(label)}
            >
              {label.displayName}
            </Label>
          ))}
          <form onSubmit={(event) => void handleCreateLabel(event)}>
            <Input
              aria-label={t('taskDetail', 'organization.newLabelPlaceholder')}
              placeholder={t('taskDetail', 'organization.newLabelPlaceholder')}
              value={newLabelName}
              onChange={(event) => setNewLabelName(event.target.value)}
            />
            <Button type="submit" variant="ghost">
              {t('taskDetail', 'organization.newLabelSubmit')}
            </Button>
          </form>
        </div>

        {/* Повтор (эпик E11.2, `01§11.5`/`01§11.8`) — только для recurring
         * задачи (`recurrence !== null`), пусто для обычной. */}
        {recurrence !== null && (
          <div>
            <h3>{t('taskDetail', 'organization.recurrenceTitle')}</h3>
            <RecurrenceChip label={recurrence.ruleLabel} />
            <Button variant="secondary" onClick={handleSkipOccurrence}>
              {t('taskDetail', 'organization.skipOccurrence')}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteSeriesConfirm(true)}>
              {t('taskDetail', 'organization.deleteSeries')}
            </Button>
          </div>
        )}
      </section>

      {/* --- 5. Subtasks ---------------------------------------------------- */}
      <section>
        <h2>{t('taskDetail', 'subtasks.sectionTitle')}</h2>
        {subtasks.map((subtask) => (
          <SubtaskRow
            key={subtask.id}
            title={subtask.title}
            checkboxLabel={subtask.title}
            checked={false}
            onCheckedChange={(checked) => {
              if (checked) handleCompleteSubtask(subtask);
            }}
            trailing={
              <>
                <IconButton
                  icon="delete"
                  label={t('taskDetail', 'subtasks.deleteLabel', { title: subtask.title })}
                  variant="ghost"
                  onClick={() => handleDeleteSubtask(subtask)}
                />
                <Button
                  variant="ghost"
                  aria-label={t('taskDetail', 'subtasks.convertToChecklistLabel', {
                    title: subtask.title,
                  })}
                  onClick={() => setConvertSubtaskConfirm(subtask)}
                >
                  {t('taskDetail', 'subtasks.convertToChecklist')}
                </Button>
              </>
            }
          />
        ))}
        <form onSubmit={handleAddSubtask}>
          <Input
            aria-label={t('taskDetail', 'subtasks.addPlaceholder')}
            placeholder={t('taskDetail', 'subtasks.addPlaceholder')}
            value={newSubtaskTitle}
            onChange={(event) => setNewSubtaskTitle(event.target.value)}
          />
          <Button type="submit" variant="ghost">
            {t('taskDetail', 'subtasks.addSubmit')}
          </Button>
        </form>
      </section>

      {/* --- 6. Checklist ----------------------------------------------------- */}
      <section>
        <h2>{t('taskDetail', 'checklist.sectionTitle')}</h2>
        {checklistItems.map((item) => (
          <ChecklistRow
            key={item.id}
            label={item.text}
            checked={item.done}
            onCheckedChange={(checked) => handleToggleChecklistItem(item, checked)}
            trailing={
              <>
                <IconButton
                  icon="delete"
                  label={t('taskDetail', 'checklist.deleteLabel', { text: item.text })}
                  variant="ghost"
                  onClick={() => handleDeleteChecklistItem(item)}
                />
                <Button
                  variant="ghost"
                  aria-label={t('taskDetail', 'checklist.convertToSubtaskLabel', {
                    text: item.text,
                  })}
                  onClick={() => handleConvertChecklistItemToSubtask(item)}
                >
                  {t('taskDetail', 'checklist.convertToSubtask')}
                </Button>
              </>
            }
          />
        ))}
        <form onSubmit={handleAddChecklistItem}>
          <Input
            aria-label={t('taskDetail', 'checklist.addPlaceholder')}
            placeholder={t('taskDetail', 'checklist.addPlaceholder')}
            value={newChecklistText}
            onChange={(event) => setNewChecklistText(event.target.value)}
          />
          <Button type="submit" variant="ghost">
            {t('taskDetail', 'checklist.addSubmit')}
          </Button>
        </form>
      </section>

      {/* --- Planning: Available From — picker (без шорткатов, без времени) - */}
      <PlanningDateModal
        open={availableFromPicker !== null}
        onClose={() => setAvailableFromPicker(null)}
        title={t('taskDetail', 'planning.availableFrom.pickerTitle')}
        gridLabel={t('taskDetail', 'planning.availableFrom.gridLabel')}
        value={task.availableFrom !== null ? toCalendarDate(task.availableFrom) : null}
        visibleMonth={
          availableFromPicker?.visibleMonth ?? toCalendarMonth(Temporal.Now.plainDateISO())
        }
        onVisibleMonthChange={(month) => setAvailableFromPicker({ visibleMonth: month })}
        onSelectDate={handleSelectAvailableFrom}
      />

      {/* --- Planning: Planned Date/Time — picker (шорткаты + время) --------- */}
      <PlanningDateModal
        open={plannedPicker !== null}
        onClose={() => setPlannedPicker(null)}
        title={t('taskDetail', 'planning.planned.pickerTitle')}
        gridLabel={t('taskDetail', 'planning.planned.gridLabel')}
        value={task.plannedDate !== null ? toCalendarDate(task.plannedDate) : null}
        visibleMonth={plannedPicker?.visibleMonth ?? toCalendarMonth(Temporal.Now.plainDateISO())}
        onVisibleMonthChange={(month) => setPlannedPicker({ visibleMonth: month })}
        onSelectDate={handleSelectPlannedDate}
        onClearDate={handleClearPlannedDate}
        clearDateLabel={t('taskDetail', 'planning.planned.clearDate')}
        shortcuts={[
          {
            key: 'today',
            label: t('taskDetail', 'planning.shortcuts.today'),
            onClick: () => handleSelectPlannedDate(toCalendarDate(Temporal.Now.plainDateISO())),
          },
          {
            key: 'tomorrow',
            label: t('taskDetail', 'planning.shortcuts.tomorrow'),
            onClick: () =>
              handleSelectPlannedDate(toCalendarDate(Temporal.Now.plainDateISO().add({ days: 1 }))),
          },
          {
            key: 'weekend',
            label: t('taskDetail', 'planning.shortcuts.weekend'),
            onClick: () =>
              handleSelectPlannedDate(toCalendarDate(resolveWeekend(Temporal.Now.plainDateISO()))),
          },
          {
            key: 'nextWeek',
            label: t('taskDetail', 'planning.shortcuts.nextWeek'),
            onClick: () =>
              handleSelectPlannedDate(
                toCalendarDate(resolveNextWeekMonday(Temporal.Now.plainDateISO())),
              ),
          },
        ]}
        time={{
          value: task.plannedTime !== null ? toTimeValue(task.plannedTime) : null,
          onSelect: handleSelectPlannedTime,
          onClear: handleClearPlannedTime,
          clearLabel: t('taskDetail', 'planning.planned.clearTime'),
          groupLabel: t('taskDetail', 'planning.planned.timeLabel'),
          hourListLabel: t('taskDetail', 'planning.planned.hourListLabel'),
          minuteListLabel: t('taskDetail', 'planning.planned.minuteListLabel'),
        }}
      />

      {/* --- Planning: Deadline Date/Time — picker (тот же принцип, что Planned,
       * без шорткатов) ------------------------------------------------------ */}
      <PlanningDateModal
        open={deadlinePicker !== null}
        onClose={() => setDeadlinePicker(null)}
        title={t('taskDetail', 'planning.deadline.pickerTitle')}
        gridLabel={t('taskDetail', 'planning.deadline.gridLabel')}
        value={task.deadlineDate !== null ? toCalendarDate(task.deadlineDate) : null}
        visibleMonth={deadlinePicker?.visibleMonth ?? toCalendarMonth(Temporal.Now.plainDateISO())}
        onVisibleMonthChange={(month) => setDeadlinePicker({ visibleMonth: month })}
        onSelectDate={handleSelectDeadlineDate}
        onClearDate={handleClearDeadlineDate}
        clearDateLabel={t('taskDetail', 'planning.deadline.clearDate')}
        time={{
          value: task.deadlineTime !== null ? toTimeValue(task.deadlineTime) : null,
          onSelect: handleSelectDeadlineTime,
          onClear: handleClearDeadlineTime,
          clearLabel: t('taskDetail', 'planning.deadline.clearTime'),
          groupLabel: t('taskDetail', 'planning.deadline.timeLabel'),
          hourListLabel: t('taskDetail', 'planning.deadline.hourListLabel'),
          minuteListLabel: t('taskDetail', 'planning.deadline.minuteListLabel'),
        }}
      />

      {/* --- Planning: Explicit Reminder — picker (дата+время, один submit) -- */}
      <Modal
        open={reminderPicker !== null}
        onClose={() => setReminderPicker(null)}
        title={t('taskDetail', 'planning.reminder.pickerTitle')}
        footer={
          <Button
            variant="primary"
            disabled={reminderPicker?.date === null}
            onClick={() => void handleSubmitReminder()}
          >
            {t('taskDetail', 'planning.reminder.save')}
          </Button>
        }
      >
        {reminderPicker !== null && (
          <>
            <DatePicker
              value={reminderPicker.date}
              visibleMonth={reminderPicker.visibleMonth}
              onVisibleMonthChange={(month) =>
                setReminderPicker((current) =>
                  current === null ? null : { ...current, visibleMonth: month },
                )
              }
              onSelect={handleSelectReminderDate}
              today={toCalendarDate(Temporal.Now.plainDateISO())}
              weekStartsOn={WEEKDAY_MONDAY}
              weekdayLabels={WEEKDAY_LABELS}
              monthLabels={MONTH_LABELS}
              label={t('taskDetail', 'planning.reminder.gridLabel')}
              previousMonthLabel={t('taskDetail', 'planning.picker.prevMonth')}
              nextMonthLabel={t('taskDetail', 'planning.picker.nextMonth')}
            />
            {reminderPicker.date !== null && (
              <div>
                <TimePicker
                  value={reminderPicker.time}
                  onSelect={handleSelectReminderTime}
                  label={t('taskDetail', 'planning.reminder.timeLabel')}
                  hourListLabel={t('taskDetail', 'planning.reminder.hourListLabel')}
                  minuteListLabel={t('taskDetail', 'planning.reminder.minuteListLabel')}
                />
                {reminderPicker.time !== null && (
                  <Button variant="ghost" onClick={handleClearReminderTime}>
                    {t('taskDetail', 'planning.reminder.clearTime')}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* --- Приоритет: picker (M24 quick action + Organization, один Modal) - */}
      <Modal
        open={priorityPickerOpen}
        onClose={() => setPriorityPickerOpen(false)}
        title={t('taskDetail', 'organization.priorityPickerTitle')}
      >
        <ul>
          {PRIORITY_LEVELS.map((level) => (
            <li key={priorityNumber(level)}>
              <button type="button" onClick={() => handleSetPriority(level)}>
                <PriorityBadge level={priorityLevelOf(level)}>{priorityLabel(level)}</PriorityBadge>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {/* --- Проект: picker ------------------------------------------------- */}
      <Modal
        open={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        title={t('taskDetail', 'organization.projectPickerTitle')}
      >
        <ul>
          <li>
            <button type="button" onClick={() => handleSelectProject(null)}>
              {t('taskDetail', 'organization.projectNone')}
            </button>
          </li>
          {activeProjects.map((candidate) => (
            <li key={candidate.id}>
              <button type="button" onClick={() => handleSelectProject(candidate)}>
                {candidate.title}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {/* --- Раздел: picker --------------------------------------------------- */}
      <Modal
        open={sectionPickerOpen}
        onClose={() => setSectionPickerOpen(false)}
        title={t('taskDetail', 'organization.sectionPickerTitle')}
      >
        <ul>
          <li>
            <button type="button" onClick={() => handleSelectSection(null)}>
              {t('taskDetail', 'organization.sectionNone')}
            </button>
          </li>
          {projectSections.map((candidate) => (
            <li key={candidate.id}>
              <button type="button" onClick={() => handleSelectSection(candidate)}>
                {candidate.title}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {/* --- Subtask → Checklist: подтверждение (`01§10`) --------------------- */}
      <Modal
        open={convertSubtaskConfirm !== null}
        onClose={() => setConvertSubtaskConfirm(null)}
        title={t('taskDetail', 'subtasks.convertConfirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConvertSubtaskConfirm(null)}>
              {t('taskDetail', 'subtasks.convertConfirmCancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirmConvertSubtask}>
              {t('taskDetail', 'subtasks.convertConfirmConfirm')}
            </Button>
          </>
        }
      >
        <p>{t('taskDetail', 'subtasks.convertConfirmBody')}</p>
      </Modal>

      {/* --- Удаление всей серии (`01§11.8`) — подтверждение обязательно --- */}
      <Modal
        open={deleteSeriesConfirm}
        onClose={() => setDeleteSeriesConfirm(false)}
        title={t('taskDetail', 'organization.deleteSeriesConfirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteSeriesConfirm(false)}>
              {t('taskDetail', 'organization.deleteSeriesConfirmCancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteSeries}>
              {t('taskDetail', 'organization.deleteSeriesConfirmConfirm')}
            </Button>
          </>
        }
      >
        <p>{t('taskDetail', 'organization.deleteSeriesConfirmBody')}</p>
      </Modal>

      {/* --- M26: выбор области применения Planning-патча recurring-задачи
       * (`01§11.6`, `§18.3`) — открывается ВМЕСТО немедленного коммита,
       * см. `savePlanningPatch`. Выбор `Radio` сразу коммитит и закрывает
       * (отдельной кнопки "Применить" нет — тот же принцип, что уже был
       * задокументирован, только раньше был выражен `<button>`-списком, не
       * `Radio`).
       *
       * `Card`/`CardBody`/`Divider`/`Radio` — эти четыре примитива
       * `@shagi/ui` уже существуют и протестированы (§10 «Primitives»), но
       * ни один не использовался нигде в `packages/app` до этой правки:
       * найдено при ручной сверке с мокапом M26 ("M26 · Recurring edit
       * (§18.3)", `docs/spec/DESIGN`) — там ровно эта пара вариантов
       * нарисована как радиокнопки в одной карточке с волосяной чертой
       * между строками, а не как список голых кнопок. Смысл выбора здесь —
       * взаимоисключающие радиокнопки (ровно одна активна), а не команды
       * произвольного действия — `Radio`, а не `Button`, точнее передаёт
       * это семантически, не только визуально. */}
      <Modal
        open={pendingPlanningPatch !== null}
        onClose={() => setPendingPlanningPatch(null)}
        title={t('taskDetail', 'planning.recurringScope.title')}
        footer={
          <Button variant="secondary" onClick={() => setPendingPlanningPatch(null)}>
            {t('taskDetail', 'planning.recurringScope.cancel')}
          </Button>
        }
      >
        <p>{t('taskDetail', 'planning.recurringScope.caption')}</p>
        <Card padding="sm">
          <Radio
            name="recurringPlanningScope"
            value="occurrence"
            label={t('taskDetail', 'planning.recurringScope.occurrence')}
            onChange={() => void handleChooseRecurringPlanningScope('occurrence')}
          />
          <Divider />
          <Radio
            name="recurringPlanningScope"
            value="series"
            label={t('taskDetail', 'planning.recurringScope.series')}
            onChange={() => void handleChooseRecurringPlanningScope('series')}
          />
        </Card>
      </Modal>
    </div>
  );
}
