/**
 * `Plan` — экран матрицы M14 Plan Agenda / M15 Plan selected
 * (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`), эпик E12 «План, поиск,
 * фильтры, завершённые», второй пакет работ (E12.2, после Search — E12.1).
 * Источник поведения — `01_PRODUCT_BEHAVIOR_R1.md` §14 «Plan R1» (короткий
 * раздел, прочитан целиком): "Agenda, not full calendar" — chronological
 * lazy day groups, compact date strip, selected date navigates the
 * corresponding group, date changes via picker (drag — где надёжно).
 *
 * Отбор и группировка — `selectPlanAgenda` (`@shagi/core`,
 * `rules/select-plan-agenda.ts`, прочитан целиком за полным разбором
 * решений: только `plannedDate`, граница будущего "с сегодня", маркер
 * Available From, сортировка внутри дня) — этот экран только загружает
 * список задач и передаёт его туда, презентация и объём "сколько дней
 * показать" — здесь.
 *
 * --- Источник задач: один запрос, один раз ---------------------------------
 *
 * `storage.tasks.listByStatusAndPlannedDate('active')` — тот же приём, что
 * `Search.tsx` (`loadCandidates`): один запрос при монтировании экрана, не
 * перезапрос на каждое взаимодействие (date strip, «Показать ещё» — это
 * навигация/раскрытие уже загруженного, не новые данные). Задание пакета
 * работ прямо подтверждает, что этот индекс уже возвращает ВСЕ живые
 * активные задачи (сортировка по `plannedDate`, не фильтр по нему) —
 * проверено чтением `packages/storage/src/memory/repositories.ts`
 * (`isAlive(task) && task.status === status`, без условия на сам
 * `plannedDate`). У Plan, в отличие от Today, нет команд, меняющих список
 * (нет Complete/Reschedule на этом экране, задание) — поэтому здесь нет и
 * `refreshGroups` наподобие `Today.tsx`.
 *
 * `today` вычисляется один раз в начале рендера (`Temporal.Now.plainDateISO()`,
 * не хук) — тот же приём, что `Today.tsx`: экран не обязан отслеживать
 * переход через полночь, пока открыт (тот же принцип, тот же файл-прецедент).
 *
 * --- Compact date strip: 7 дней (решение "реши сам") ------------------------
 *
 * `01§14` не называет число дней в полосе. Выбрано 7 (сегодня + 6 дней
 * вперёд) — неделя, наименьшая единица, которая уже читается на глаз без
 * подписи «через сколько дней» у каждой даты, и умещается на мобильном
 * экране без горизontального скролла полосы (сама полоса — `SegmentedControl`,
 * ниже). Собрана из готового примитива `@shagi/ui`, не новый компонент
 * `@shagi/ui/DateStrip` — задание прямо просит не изобретать: `SegmentedControl`
 * уже даёт `radiogroup` с roving tabIndex и единственным выбранным значением,
 * ровно семантику "текущая выбранная дата" (M15). Подпись каждого сегмента —
 * `weekdayName` (короткая) + число дня, оба уже готовые примитивы
 * `@shagi/i18n` (не хардкод строк).
 *
 * Даты за пределами полосы — отдельная кнопка-календарь (`IconButton` +
 * `DatePicker` в `Modal`, тот же паттерн конвертации `Temporal ↔
 * CalendarDate`, что `Today.tsx`/`Inbox.tsx`/`TaskDetail.tsx`, см. блок
 * ниже) — ровно "date changes via picker" из `01§14`. Drag НЕ реализован
 * (решение "реши сам" — задание разрешает не строить, если неочевидно):
 * `01§14` перечисляет date strip и picker как способы смены даты, drag
 * упомянут в самом задании отдельно ("Drag-переупорядочивание НЕ имеется в
 * виду... если неочевидно, можно не реализовывать") — здесь именно такой
 * случай: ни один из готовых примитивов `@shagi/ui` (`SegmentedControl`,
 * `DatePicker`) не поддерживает drag сам по себе, а строить перетаскивание
 * дат вручную ради этого пакета работ — за пределами "минимально
 * достаточной реализации".
 *
 * --- Lazy day groups: без пагинации по датам, только по группам -----------
 *
 * `selectPlanAgenda` возвращает ТОЛЬКО те дни, где есть хотя бы задача или
 * маркер (пустые "пропущенные" дни без ни одного основания не заводятся —
 * см. её заголовок) — поэтому "лениво показать дни" здесь означает "лениво
 * показать ПЕРВЫЕ N уже посчитанных групп", не "N календарных дней подряд".
 * `INITIAL_VISIBLE_DAY_GROUPS = 14` (около двух недель дней-групп — разумный
 * охват для мобильного экрана без виртуализации, тот же класс решения, что
 * `COLLAPSE_THRESHOLD = 20` у `Today.tsx`, только для количества ГРУПП, не
 * строк внутри одной), `LOAD_MORE_STEP = 14` — кнопка «Показать ещё»
 * догружает ещё столько же уже посчитанных (не перезапрошенных из
 * хранилища) групп. Виртуализация исключена по той же причине, что и в
 * `Today.tsx`: порядки величины продукта (CLAUDE.md, YAGNI) не оправдывают
 * `@tanstack/react-virtual` для локального однопользовательского масштаба.
 *
 * --- Available From: маркер дня, не строка -----------------------------
 *
 * `PlanDayGroup.availableFromMarker` (булев, `@shagi/core`) рендерится
 * отдельной строкой над списком задач дня — иконка `clock` (та же, что
 * `Today.tsx` использует для `missedPlan`, здесь другой смысл — "время
 * ожидания", не "просрочено", но тот же визуальный язык "часы = про время")
 * плюс текст `t('plan', 'availableFromMarker.label')`. Не `TaskRow` — задание
 * дословно: "не другая задача, не считается в totals" — она НЕ входит в
 * `group.tasks` уже на уровне селектора, здесь просто ничего не добавляет к
 * счёту, кроме собственной строки-подсказки.
 *
 * День, где есть ТОЛЬКО маркер (без единой запланированной задачи) —
 * решение "реши сам", принятое в `selectPlanAgenda` (см. её заголовок): день
 * ПОКАЗЫВАЕТСЯ как отдельная группа с пустым `tasks`, не пропускается —
 * здесь это просто рендерится как секция без единой `TaskRow`, только с
 * маркером.
 *
 * --- Клик по задаче / клик по дате ------------------------------------------
 *
 * Задача → `controller.openTask(id)` (готовый переход E10.2), тот же приём
 * различения интерактивного клика внутри строки (`isInteractiveRowClick`),
 * что уже дублирован в `Today.tsx`/`Search.tsx`/`ProjectDetail.tsx` (тот же
 * узкий прецедент, не общий модуль — граница пакетов, CLAUDE.md). Чекбокс
 * строки — РАБОЧИЙ (`completeTaskCommand`, та же команда, что на Today и во
 * Входящих). Раньше он рендерился `disabled` с обоснованием «задание этого
 * пакета работ не просит Complete на Plan». Обоснование не выдержало живой
 * проверки: на экране нарисован круглый чекбокс ровно того же вида, что и
 * везде, человек по нему жмёт — и не происходит НИЧЕГО. Нерабочий орган
 * управления, неотличимый от рабочего, хуже отсутствующего (тот же принцип
 * честного UI, по которому на экранах нет строк-заглушек). Макет
 * `[R1][M][14]` рисует эти кружки наравне с остальными списками, а `01§8`
 * завершения с «Плана» не запрещает — запрета не было, была граница
 * задания.
 *
 * Дата в полосе/picker → `goToDate`: прокручивает к секции дня, если группа
 * для этой даты уже посчитана (`selectPlanAgenda` её вернула), иначе —
 * молча ничего не делает (кроме визуального выбора в полосе) — на пустой
 * день (без задач и без маркера) переходить некуда, `selectPlanAgenda`
 * такую группу и не создаёт. Если день найден, но скрыт "показать ещё"
 * (`visibleCount` меньше его индекса) — `goToDate` сама раскрывает список
 * ровно настолько, чтобы день стал виден, ПЕРЕД прокруткой (иначе скролл
 * целился бы в несуществующий DOM-узел).
 *
 * --- Конвертация `DatePicker` (Temporal ↔ CalendarDate) ---------------------
 *
 * Тот же приём, что `Today.tsx`/`Inbox.tsx`/`TaskDetail.tsx` (см. их
 * заголовки за общим обоснованием): `packages/ui` не зависит от
 * `@js-temporal/polyfill`, конвертация и локализация подписей — на
 * вызывающем коде, здесь. Узко дублировано намеренно (та же причина: эти
 * функции приватны каждому модулю-экрану, общий модуль — вне территории
 * этого пакета работ).
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
  selectPlanAgenda,
  type PlanDayGroup,
  type Task,
  type Uuid,
} from '@shagi/core';
import {
  Button,
  DatePicker,
  EmptyState,
  Icon,
  IconButton,
  Modal,
  SegmentedControl,
  TaskRow,
  type CalendarDate,
  type CalendarMonth,
} from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';
import './Plan.css';

/** См. заголовок файла, блок «Compact date strip». */
const STRIP_DAYS_COUNT = 7;

/** См. заголовок файла, блок «Lazy day groups». */
const INITIAL_VISIBLE_DAY_GROUPS = 14;
const LOAD_MORE_STEP = 14;

/** См. заголовок файла, блок «Клик по задаче» — тот же приём, что
 * `Today.tsx`/`Search.tsx`/`ProjectDetail.tsx` (узкое дублирование, не
 * общий модуль). */
function isInteractiveRowClick(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, button') !== null;
}

// --- Календарь `DatePicker` — конвертация Temporal ↔ простых чисел ------------
// См. заголовок файла, блок «Конвертация DatePicker».

function toCalendarDate(date: Temporal.PlainDate): CalendarDate {
  return { year: date.year, month: date.month, day: date.day };
}

function toCalendarMonth(date: Temporal.PlainDate): CalendarMonth {
  return { year: date.year, month: date.month };
}

function fromCalendarDate(date: CalendarDate): Temporal.PlainDate {
  return Temporal.PlainDate.from(date);
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

/** DOM id секции дня — общий якорь для прокрутки (`goToDate`) и рендера
 * секции (`PlanDayGroupSection`). */
function dayGroupElementId(date: Temporal.PlainDate): string {
  return `plan-day-${date.toString()}`;
}

interface PlanDayGroupSectionProps {
  readonly group: PlanDayGroup;
  readonly onOpen: (task: Task) => void;
  readonly onComplete: (task: Task) => void;
  /** День, выбранный в полосе дат: его заголовок выделяется цветом (макет
   * `[R1][M][14]`). */
  readonly selected: boolean;
}

/** Секция одного дня — заголовок (`formatDate`), маркер Available From (см.
 * заголовок файла) и список задач (`TaskRow` с рабочим чекбоксом
 * завершения, см. заголовок файла). */
function PlanDayGroupSection({
  group,
  onOpen,
  onComplete,
  selected,
}: PlanDayGroupSectionProps): ReactElement {
  const heading = formatDate(group.date, { weekday: 'long' });
  return (
    <section className="shagi-plan__day" id={dayGroupElementId(group.date)} aria-label={heading}>
      <h2
        className={
          selected
            ? 'shagi-plan__day-heading shagi-plan__day-heading--selected'
            : 'shagi-plan__day-heading'
        }
      >
        {heading}
      </h2>
      {group.availableFromMarker && (
        <p className="shagi-plan__available-marker">
          <Icon name="clock" size={14} />
          <span>{t('plan', 'availableFromMarker.label')}</span>
        </p>
      )}
      {group.tasks.length > 0 && (
        <div className="shagi-plan__day-list">
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              checkboxLabel={task.title}
              checked={false}
              onCheckedChange={() => onComplete(task)}
              state="normal"
              {...(task.plannedTime !== null ? { statusLabel: formatTime(task.plannedTime) } : {})}
              onClick={(event) => {
                if (isInteractiveRowClick(event.target)) return;
                onOpen(task);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface DatePickerDialogState {
  readonly visibleMonth: CalendarMonth;
}

/** Тот же узкий компромисс, что `Today.tsx` `getDeviceId` (см. его
 * заголовок): постоянного порта идентичности устройства в дереве пакетов
 * ещё нет, поэтому id живёт время жизни модуля. Заменяется в одном месте,
 * когда порт появится. */
let cachedPlanDeviceId: Uuid | null = null;

function getPlanDeviceId(): Uuid {
  cachedPlanDeviceId ??= generateDeviceId();
  return cachedPlanDeviceId;
}

export function Plan(): ReactElement {
  const storage = useStorage();
  const controller = useAppController();
  const today = Temporal.Now.plainDateISO();

  const [groups, setGroups] = useState<readonly PlanDayGroup[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_DAY_GROUPS);
  const [selectedStripDate, setSelectedStripDate] = useState<string>(today.toString());
  const [pendingScrollDate, setPendingScrollDate] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState<DatePickerDialogState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storage.tasks.listByStatusAndPlannedDate('active').then((tasks) => {
      if (!cancelled) setGroups(selectPlanAgenda(tasks, today));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` фиксировано на монтирование экрана, см. заголовок файла
  }, [storage]);

  /** Перезапрос повестки после успешной команды — тот же приём, что
   * `Today.tsx` `refreshGroups`: список строится заново из хранилища, а не
   * правится на месте, чтобы экран не разошёлся с тем, что произошло. */
  async function refreshAgenda(): Promise<void> {
    const tasks = await storage.tasks.listByStatusAndPlannedDate('active');
    setGroups(selectPlanAgenda(tasks, today));
  }

  function handleComplete(task: Task): void {
    void (async () => {
      const result = await completeTaskCommand(
        { id: task.id },
        { storage, now: Temporal.Now.instant(), deviceId: getPlanDeviceId() },
      );
      // Провал не проглатывается: список не перезапрашивается под ошибкой,
      // задача остаётся на экране — человек видит, что ничего не
      // изменилось, а не пустоту на месте якобы завершённой задачи.
      if (result.status === 'ok') await refreshAgenda();
    })();
  }

  // Прокрутка к запрошенному дню — после того, как `visibleCount` уже
  // раскрыл нужную группу (см. `goToDate`) и рендер с новым DOM-узлом
  // случился. См. заголовок файла, блок «Клик по задаче / клик по дате».
  useEffect(() => {
    if (pendingScrollDate === null) return;
    const element = document.getElementById(`plan-day-${pendingScrollDate}`);
    if (element !== null) {
      element.scrollIntoView({ block: 'start' });
    }
    setPendingScrollDate(null);
  }, [pendingScrollDate, groups, visibleCount]);

  /** См. заголовок файла, блок «Клик по задаче / клик по дате» — общий
   * обработчик для date strip и `DatePicker`. */
  function goToDate(date: Temporal.PlainDate): void {
    setSelectedStripDate(date.toString());
    if (groups === null) return;
    const targetIndex = groups.findIndex((group) => group.date.equals(date));
    if (targetIndex === -1) return; // ничего не посчитано на этот день — переходить некуда.
    setVisibleCount((current) => Math.max(current, targetIndex + 1));
    setPendingScrollDate(date.toString());
  }

  const stripDays = Array.from({ length: STRIP_DAYS_COUNT }, (_, index) =>
    today.add({ days: index }),
  );
  const allGroups = groups ?? [];
  const visibleGroups = allGroups.slice(0, visibleCount);
  const hasMore = allGroups.length > visibleCount;
  const isEmpty = groups !== null && allGroups.length === 0;

  return (
    <div className="shagi-plan">
      <h1 className="shagi-plan__title">{t('plan', 'pageTitle')}</h1>

      <div className="shagi-plan__strip-row">
        {/* Подпись каждой плитки — две строки, как в макете `[R1][M][14]`:
         * день недели над числом. Компонент прежний (`SegmentedControl`
         * даёт `radiogroup` с roving tabIndex — ровно семантику «одна
         * выбранная дата»), меняется только его содержимое и оформление
         * плиток (`Plan.css`), а не доступная модель. */}
        <SegmentedControl
          className="shagi-plan__strip"
          label={t('plan', 'dateStrip.label')}
          options={stripDays.map((date) => ({
            value: date.toString(),
            label: (
              <span className="shagi-plan__strip-cell">
                <span className="shagi-plan__strip-weekday">
                  {weekdayName(date.dayOfWeek, 'short')}
                </span>
                <span className="shagi-plan__strip-day">{date.day}</span>
              </span>
            ),
          }))}
          value={selectedStripDate}
          onChange={(value) => goToDate(Temporal.PlainDate.from(value))}
        />
        <IconButton
          icon="calendar"
          label={t('plan', 'dateStrip.pickDate')}
          onClick={() => setDatePicker({ visibleMonth: toCalendarMonth(today) })}
        />
      </div>

      {isEmpty && (
        <EmptyState
          icon={<Icon name="calendar" size={32} />}
          title={t('plan', 'empty.title')}
          description={t('plan', 'empty.description')}
        />
      )}

      <div className="shagi-plan__groups">
        {visibleGroups.map((group) => (
          <PlanDayGroupSection
            key={group.date.toString()}
            group={group}
            onOpen={(task) => controller.openTask(task.id)}
            onComplete={handleComplete}
            selected={group.date.toString() === selectedStripDate}
          />
        ))}
      </div>

      {hasMore && (
        <Button
          variant="secondary"
          block
          onClick={() => setVisibleCount((current) => current + LOAD_MORE_STEP)}
        >
          {t('plan', 'loadMore.button')}
        </Button>
      )}

      {datePicker !== null && (
        <Modal open onClose={() => setDatePicker(null)} title={t('plan', 'datePickerDialog.title')}>
          <DatePicker
            value={toCalendarDate(Temporal.PlainDate.from(selectedStripDate))}
            visibleMonth={datePicker.visibleMonth}
            onVisibleMonthChange={(month) =>
              setDatePicker((current) =>
                current === null ? null : { ...current, visibleMonth: month },
              )
            }
            onSelect={(date) => {
              setDatePicker(null);
              goToDate(fromCalendarDate(date));
            }}
            today={toCalendarDate(today)}
            weekStartsOn={WEEKDAY_MONDAY}
            weekdayLabels={WEEKDAY_LABELS}
            monthLabels={MONTH_LABELS}
            label={t('plan', 'datePickerDialog.gridLabel')}
            previousMonthLabel={t('plan', 'datePickerDialog.prevMonth')}
            nextMonthLabel={t('plan', 'datePickerDialog.nextMonth')}
          />
        </Modal>
      )}
    </div>
  );
}
