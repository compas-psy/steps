/**
 * `Today` — экран матрицы `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`,
 * состояния M06 Today Empty, M07 Today Normal и, этим пакетом работ, M08
 * Today Dense (свёртываемые группы) плюс per-task действия из `01§6`
 * (Complete/Reschedule/Change deadline). Отбор/группировка (`selectTodayTasks`,
 * @shagi/core) и презентационная развёртка групп — из предыдущего пакета
 * работ (E06.1), здесь не переписаны.
 *
 * Явно вне охвата (следующие пакеты работ, см. задание): Focus-промпты
 * (M11 — undated-задача → «Запланировать на сегодня и добавить в
 * Главное?», 4-я Focus-задача → выбор кого заменить), bulk-действия/
 * мультивыбор (M09 «bulk Today/Tomorrow» для «Не по плану» — здесь только
 * per-task reschedule) и переход в Task Detail («Open», M24/M25 — экрана
 * ещё нет, эпик E10).
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
  completeTaskCommand,
  generateDeviceId,
  selectTodayTasks,
  updateTaskCommand,
  type Task,
  type TaskCommandResult,
  type TodayGroup,
  type TodayGroups,
  type Uuid,
} from '@shagi/core';
import {
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

import { useStorage } from '../state/context.js';

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

  if (group !== 'missed_deadline' && group !== 'missed_plan') {
    // `focus`/`timed`/`today`/`later` — ТЗ не описывает для них других
    // действий на экране Today в этом пакете работ (задание).
    return { frequent: [complete], rare: [] };
  }

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

  return { frequent: [complete, rescheduleToday, rescheduleTomorrow], rare };
}

interface TodayTaskRowProps {
  readonly task: Task;
  readonly group: TodayGroup;
  readonly menuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly handlers: RowActionHandlers;
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
}: TodayTaskRowProps): ReactElement {
  const { frequent, rare } = buildTaskMenuActions(group, task, handlers);

  return (
    <TaskRow
      title={task.title}
      checkboxLabel={task.title}
      checked={false}
      state={groupRowState(group)}
      onCheckedChange={(checked) => {
        if (checked) handlers.onComplete(task.id);
      }}
      {...(group === 'timed' && task.plannedTime !== null
        ? { statusLabel: formatTime(task.plannedTime) }
        : {})}
      trailing={
        // Обёртка нужна только чтобы дать `TaskMenu` (`position: absolute`,
        // см. `Menu.css`) позиционированного предка — тот же паттерн, что
        // `.dev-menu-anchor` в песочнице `packages/ui`; здесь без
        // отдельного CSS-класса (`packages/app` его не заводит), одно
        // ключевое слово, не «сырой px»/hex — гейт адгезии дизайн-системы
        // его не ловит и не должен.
        <div style={{ position: 'relative' }}>
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

interface TodayGroupSectionProps {
  readonly group: TodayGroup;
  readonly tasks: readonly Task[];
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly openMenuTaskId: Uuid | null;
  readonly onToggleMenu: (id: Uuid) => void;
  readonly onCloseMenu: () => void;
  readonly handlers: RowActionHandlers;
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

export function Today(): ReactElement {
  const storage = useStorage();
  const [groups, setGroups] = useState<TodayGroups | null>(null);
  const [openMenuTaskId, setOpenMenuTaskId] = useState<Uuid | null>(null);
  const [collapsedOverride, setCollapsedOverride] = useState<Partial<Record<TodayGroup, boolean>>>(
    {},
  );
  const [deadlinePicker, setDeadlinePicker] = useState<DeadlinePickerState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = Temporal.Now.plainDateTimeISO();
    void selectTodayTasks(storage, now).then((result) => {
      if (!cancelled) setGroups(result);
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

  const handlers: RowActionHandlers = {
    onComplete: (id) => {
      void runCommand(completeTaskCommand({ id }, commandDeps()));
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
  };

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
    </div>
  );
}
