/**
 * `Inbox` — экран матрицы `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`, M12
 * Inbox / M13 Inbox Process, эпик E07 «Входящие: очередь, разбор, Inbox
 * Zero». Домен: `capture_state = inbox | processed` (`01§2`) — Входящие =
 * активные задачи с `capture_state='inbox'`, запрос
 * `storage.tasks.listByCaptureStateAndStatus('inbox', 'active')`
 * (`TaskRepository`, `@shagi/storage`).
 *
 * Именно `capture_state`, а не производный вид над `project_id=null`,
 * делает Inbox Zero РЕАЛЬНО достижимым (`01§2`, дословно: "Именно
 * capture_state позволяет реальный Inbox Zero"): `project_id=null` у
 * processed-задачи остаётся полностью законным состоянием (проекты не
 * обязательны, `01§2`) — вид "задачи без проекта" никогда бы не опустел
 * для пользователя, который просто не пользуется Projects. `capture_state`
 * же переключается КОМАНДОЙ (см. действия карточки ниже) и переключается
 * ровно один раз на задачу — разобрал все, счётчик дошёл до нуля, и
 * это состояние держится, пока не появится новый явный захват
 * (Quick Add без контекста, `01§2` «Что попадает»).
 *
 * --- Архитектурное решение экрана: карточка за раз, не список -------------
 *
 * `01§2` описывает Process Inbox как процесс со СЛЕДУЮЩИМ шагом ("Skip:
 * remains inbox, go next") — формулировка "go next" уже подразумевает
 * последовательный разбор одной задачи за раз, а не список действий на
 * каждой строке. Список (по образцу `Today.tsx`, `TaskRow`+`TaskMenu` на
 * строке) был бы технически валиден, но сделал бы «Пропустить» странным
 * действием списка (что вообще значит «пропустить» строку в списке, где и
 * так видны все?) — этот пакет работ выбирает карточку-за-раз именно
 * потому, что тогда «Пропустить» — осмысленное, а не искусственно
 * притянутое действие: единственная задача в фокусе, «Пропустить» уводит
 * фокус к следующей БЕЗ обращения к хранилищу вовсе (см. `handleSkip`
 * ниже) — только эта команда не меняет `capture_state`.
 *
 * --- Очередь и фокус (без персистентного состояния) ------------------------
 *
 * `tasks` — снимок `listByCaptureStateAndStatus` (перезапрашивается после
 * КАЖДОЙ успешной команды, `refreshTasks`, тот же приём, что `Today.tsx`
 * `refreshGroups`: список — производный результат хранилища, вторая копия
 * на клиенте рисковала бы рассинхронизацией). `focusIndex` — целое число,
 * не обязательно валидный индекс текущего массива: реальная позиция
 * карточки на экране — `focusIndex % tasks.length`, вычисляется в рендере
 * (не хранится отдельно) по двум причинам разом:
 *   1. после успешной команды обработанная задача пропадает из `tasks` —
 *      всё, что было ПОСЛЕ неё, сдвигается на одну позицию влево, и то же
 *      самое `focusIndex` уже показывает следующую по очереди задачу без
 *      явной перестановки — тот же принцип, что и у `Today.tsx`
 *      (перезапрос, не ручная мутация индекса);
 *   2. «Пропустить» — единственное действие, не обращающееся к хранилищу
 *      вовсе (см. выше), поэтому оно просто увеличивает `focusIndex` на 1 —
 *      обёртка по модулю в рендере не даёт значению стать "нереальным"
 *      индексом, даже если пользователь пропускает много раз подряд.
 * Само значение `focusIndex` — `useState`, не персистентно между заходами
 * на экран (порядок разбора не обязан переживать уход с экрана — задание
 * не просит большего).
 *
 * --- Действия карточки (`01§2`, дословно) -----------------------------
 *
 * - Сегодня → `{plannedDate: today, captureState: 'processed'}`.
 * - Дата → `planning/DatePicker` в `Modal` (та же конвертация
 *   Temporal↔CalendarDate/`weekdayLabels`/`monthLabels`, что и «Изменить
 *   срок» в `Today.tsx` — см. блок ниже «Конвертация DatePicker»; открывает
 *   ТЕКУЩИЙ месяц, не месяц уже стоящей даты, по тому же соображению, что
 *   `Today.tsx`: типичный сценарий Inbox — выбрать близкую дату, не листать
 *   календарь назад) → `{plannedDate: <выбранная>, captureState:
 *   'processed'}`.
 * - Проект → `storage.projects.listActive()` (см. блок ниже «Пустой список
 *   проектов») в `Menu` (`@shagi/ui/overlay`, тот же примитив, на котором
 *   уже построен `TaskMenu` в `Today.tsx` — не новый компонент выбора из
 *   списка, только другой набор пунктов) → `{projectId: <выбранный>,
 *   captureState: 'processed'}`.
 * - Удалить → `deleteTaskCommand` — **мягкое** удаление (tombstone,
 *   `deletedAt`), уже встроенное в саму команду (`packages/core`,
 *   `commands/delete-task.ts`, CLAUDE.md п.6 «Tombstone вместо жёсткого
 *   удаления, retention 90 дней») — этот экран не добавляет отдельной
 *   логики поверх, только вызывает готовую команду.
 * - Пропустить → НЕ вызывает никакую команду (см. блок «Очередь и фокус»
 *   выше) — задача остаётся `inbox`, фокус переходит к следующей карточке.
 *
 * Как и `Today.tsx`: провал команды (`status !== 'ok'`) не проглатывается —
 * `Toast` с сообщением об ошибке, `tasks` НЕ перезапрашивается (задание —
 * тот же принцип, что demo адверсариальной проверки требует показать явно).
 *
 * --- Пустой список проектов (действие «Проект») -----------------------
 *
 * Команды создания проекта в дереве пакетов ещё нет (эпик E09) — список
 * активных проектов на практике сейчас почти всегда пуст. Решение этого
 * пакета работ: кнопка «Проект» остаётся ВСЕГДА видимой (не прячется по
 * количеству проектов — прятать целое действие карточки по недетерминиро-
 * ванному для пользователя условию хуже, чем объяснить пустоту), но при
 * пустом списке открывшийся `Menu` показывает единственный НЕактивный
 * пункт с текстом «Проектов пока нет» (`disabled: true`, тот же `Menu`,
 * без нового примитива) — тот же принцип прозрачного пустого состояния,
 * что `EmptyState` для Inbox Zero, только в масштабе одного пункта меню, а
 * не целого экрана (полноразмерный `EmptyState` внутри выпадающего меню
 * был бы избыточен).
 *
 * --- M12 Inbox Zero --------------------------------------------------------
 *
 * `tasks.length === 0` → `EmptyState` (`@shagi/ui/feedback`) с готовым
 * ключом каталога `common.inbox.cleared` («Входящие разобраны.») —
 * КАТАЛОГ УЖЕ СОДЕРЖАЛ этот ключ (заведён раньше этого пакета работ,
 * `packages/i18n/src/catalog/ru-RU/common.json`) ровно потому, что это
 * общий текст с бейджем/другими местами продукта, не специфика одного
 * экрана — переиспользован, не задублирован новым ключом в `inbox.json`
 * (тот же приём, что `Today.tsx` уже делает для `common.today.doneAll`).
 * Тон — взрослый, без гейминга (ТЗ §18): факт, не поздравление.
 *
 * --- Бейдж на Today и обратная навигация -----------------------------
 *
 * Вход на этот экран — бейдж-счётчик на `Today.tsx` (см. точечную правку
 * там, блок «Бейдж Входящих»), не отдельный маршрут с постоянной панелью
 * (`.ultraplan/research/02-ui.md` §4). Кнопка «Назад» здесь (`IconButton
 * icon="close"`, тот же `close`, что использует `CommandPalette` для своей
 * кнопки закрытия, — общий для оверлеев/полноэкранных потоков продукта
 * стиль, не новый выбор) возвращает `controller.goTo('todayEmpty')` — имя
 * `'todayEmpty'`, не `'today'`: `ScreenId` не заводит отдельного экрана
 * «Today» (сам компонент `Today.tsx` решает по факту данных, показать M06
 * Empty или M07 Normal — см. `screens/index.ts`), единственная
 * зарегистрированная запись для него исторически называется `todayEmpty`
 * (E04.1) — использовать любое другое имя означало бы либо не попасть в
 * `SCREENS`, либо завести дубликат записи под другим ключом.
 *
 * --- Локальная идентичность устройства --------------------------------
 *
 * Тот же узкий приём, что уже дважды использован в дереве пакетов
 * (`FirstTask.tsx`, `Today.tsx`) с тем же обоснованием (см. заголовок
 * `Today.tsx`, блок «Локальная идентичность (deviceId)»): персистентного
 * порта идентичности устройства ещё нет (`packages/platform`/
 * `packages/storage` его не заводят), поэтому — свой закэшированный
 * `Uuid` через `generateDeviceId` (`@shagi/core`), сведённый к одному полю
 * (`deviceId`, `ownerScope` не нужен — обе команды этого экрана мутируют
 * уже существующие задачи, не создают новых). Дублирование этого узкого
 * куска, а не импорт приватной функции соседнего экрана, — то же
 * сознательное решение, что уже задокументировано в `Today.tsx`.
 *
 * --- Конвертация DatePicker ---------------------------------------------
 *
 * `packages/ui` намеренно не зависит от `@js-temporal/polyfill` —
 * конвертация Temporal↔`CalendarDate`/локализация подписей недель/месяцев
 * целиком на вызывающем коде. Здесь — точная копия того же набора
 * маленьких чистых функций, что уже есть в `Today.tsx` (`toCalendarDate`/
 * `toCalendarMonth`/`fromCalendarDate`/`WEEKDAY_LABELS`/`MONTH_LABELS`), не
 * импорт оттуда: `Today.tsx` их не экспортирует (те же приватные функции
 * модуля, что и `getDeviceId`), а выносить их в общий модуль вне
 * разрешённой территории этого пакета работ (`packages/app/src/{App.tsx,
 * state/context.tsx}` и `packages/ui/src/**` — под запретом; новый общий
 * файл в `screens/` тоже не входит в список «можно трогать»). То же
 * решение, что уже принято и явно задокументировано для `getDeviceId` —
 * узкое дублирование сейчас, а не рефакторинг в общий модуль вне рамок
 * этого пакета работ.
 *
 * --- Открытие Task Detail по клику на карточку (эпик E10.2) ----------------
 *
 * Клик по `<section>` карточки → `controller.openTask(current.id)` (M24/M25,
 * `packages/app/src/screens/TaskDetail.tsx`). В отличие от `Today.tsx`
 * (`TaskRow`, чужой непрозрачный чекбокс — там нужна проверка цели клика,
 * см. заголовок `Today.tsx`), здесь ВСЕ интерактивные элементы карточки —
 * `Button`/`IconButton`, целиком собранные этим же файлом: настоящий
 * `event.stopPropagation()` на каждой из пяти кнопок карточки (Сегодня/
 * Дата/Проект/Удалить/Пропустить) и на обёртке меню проектов — тот же
 * приём, что `Label.tsx` (`@shagi/ui`) уже применяет для своей кнопки
 * `onRemove`.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { DEFAULT_LOCALE, WEEKDAY_MONDAY, WEEKDAY_SUNDAY, t, weekdayName } from '@shagi/i18n';
import {
  deleteTaskCommand,
  generateDeviceId,
  updateTaskCommand,
  type Project,
  type Task,
  type TaskCommandResult,
  type Uuid,
} from '@shagi/core';
import {
  Button,
  DatePicker,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  Modal,
  Toast,
  type CalendarDate,
  type CalendarMonth,
  type MenuItemData,
} from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';

// --- Календарь `DatePicker` — конвертация Temporal ↔ простых чисел ------------
// См. заголовок файла, блок «Конвертация DatePicker» — намеренное узкое
// дублирование тех же функций, что уже есть в `Today.tsx`.

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

// --- Локальная идентичность устройства (см. заголовок файла) -----------------

let cachedDeviceId: Uuid | null = null;

function getDeviceId(): Uuid {
  cachedDeviceId ??= generateDeviceId();
  return cachedDeviceId;
}

interface DatePickerState {
  readonly task: Task;
  readonly visibleMonth: CalendarMonth;
}

export function Inbox(): ReactElement {
  const storage = useStorage();
  const controller = useAppController();

  const [tasks, setTasks] = useState<readonly Task[] | null>(null);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState<DatePickerState | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      storage.tasks.listByCaptureStateAndStatus('inbox', 'active'),
      storage.projects.listActive(),
    ]).then(([nextTasks, nextProjects]) => {
      if (!cancelled) {
        setTasks(nextTasks);
        setProjects(nextProjects);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  /** Перезапрашивает очередь после успешной команды — см. заголовок файла,
   * блок «Очередь и фокус». Проекты не перезапрашиваются здесь: ни одна
   * команда этого экрана их не мутирует. */
  async function refreshTasks(): Promise<void> {
    const next = await storage.tasks.listByCaptureStateAndStatus('inbox', 'active');
    setTasks(next);
  }

  /** Тот же разбор исхода команды, что `Today.tsx` `runCommand`: провал не
   * проглатывается молча, список не перезапрашивается под ошибкой. */
  async function runCommand(promise: Promise<TaskCommandResult>): Promise<void> {
    const result = await promise;
    if (result.status === 'ok') {
      setErrorMessage(null);
      await refreshTasks();
      return;
    }
    setErrorMessage(t('inbox', 'errors.actionFailed'));
  }

  function commandDeps(): { storage: typeof storage; now: Temporal.Instant; deviceId: Uuid } {
    return { storage, now: Temporal.Now.instant(), deviceId: getDeviceId() };
  }

  function handleToday(task: Task): void {
    void runCommand(
      updateTaskCommand(
        {
          id: task.id,
          patch: { plannedDate: Temporal.Now.plainDateISO(), captureState: 'processed' },
        },
        commandDeps(),
      ),
    );
  }

  function handleSelectDate(date: CalendarDate): void {
    if (datePicker === null) return;
    const { task } = datePicker;
    setDatePicker(null);
    void runCommand(
      updateTaskCommand(
        { id: task.id, patch: { plannedDate: fromCalendarDate(date), captureState: 'processed' } },
        commandDeps(),
      ),
    );
  }

  // `originalProjectNameSnapshot` в патче (E09.1 приёмка, fix update-task.ts):
  // это единственное сегодня реальное место в дереве пакетов, где задаче
  // назначается проект ПОСЛЕ создания — без явной передачи снимка здесь он
  // остался бы `null` навсегда (CLAUDE.md п.7 / 01§12 "keeps project-name
  // snapshot after project deletion").
  function handleAssignProject(task: Task, project: Project): void {
    setProjectMenuOpen(false);
    void runCommand(
      updateTaskCommand(
        {
          id: task.id,
          patch: {
            projectId: project.id,
            originalProjectNameSnapshot: project.title,
            captureState: 'processed',
          },
        },
        commandDeps(),
      ),
    );
  }

  function handleDelete(task: Task): void {
    void runCommand(deleteTaskCommand({ id: task.id }, commandDeps()));
  }

  /** «Пропустить» — см. заголовок файла, блок «Очередь и фокус»: НЕ
   * обращается к хранилищу, только двигает фокус. */
  function handleSkip(): void {
    setFocusIndex((index) => index + 1);
  }

  const isLoading = tasks === null;
  const isEmpty = tasks !== null && tasks.length === 0;
  const current =
    tasks !== null && tasks.length > 0 ? (tasks[focusIndex % tasks.length] ?? null) : null;

  const projectMenuItems: readonly MenuItemData[] =
    projects.length === 0
      ? [{ key: 'empty', label: t('inbox', 'projectPicker.empty'), disabled: true }]
      : projects.map((project) => ({
          key: project.id,
          label: project.title,
          onSelect: () => {
            if (current !== null) handleAssignProject(current, project);
          },
        }));

  return (
    <div>
      <div>
        <IconButton
          icon="close"
          label={t('inbox', 'back.label')}
          onClick={() => controller.goTo('todayEmpty')}
        />
        <h1>{t('inbox', 'pageTitle')}</h1>
      </div>

      {errorMessage !== null && (
        <Toast
          variant="error"
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
          dismissLabel={t('inbox', 'errors.dismiss')}
        />
      )}

      {isEmpty && (
        <EmptyState
          icon={<Icon name="check" size={32} />}
          title={t('common', 'inbox.cleared')}
          description={t('inbox', 'empty.description')}
        />
      )}

      {!isLoading && current !== null && (
        <section
          aria-label={t('inbox', 'card.ariaLabel', { title: current.title })}
          onClick={() => controller.openTask(current.id)}
        >
          <p>{current.title}</p>

          <Button
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              handleToday(current);
            }}
          >
            {t('inbox', 'actions.today')}
          </Button>

          <Button
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              setDatePicker({
                task: current,
                visibleMonth: toCalendarMonth(Temporal.Now.plainDateISO()),
              });
            }}
          >
            {t('inbox', 'actions.date')}
          </Button>

          <div style={{ position: 'relative' }} onClick={(event) => event.stopPropagation()}>
            <Button variant="secondary" onClick={() => setProjectMenuOpen((open) => !open)}>
              {t('inbox', 'actions.project')}
            </Button>
            <Menu
              open={projectMenuOpen}
              onClose={() => setProjectMenuOpen(false)}
              aria-label={t('inbox', 'projectPicker.ariaLabel')}
              sections={[{ key: 'projects', items: projectMenuItems }]}
            />
          </div>

          <Button
            variant="destructive"
            onClick={(event) => {
              event.stopPropagation();
              handleDelete(current);
            }}
          >
            {t('inbox', 'actions.delete')}
          </Button>

          <Button
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              handleSkip();
            }}
          >
            {t('inbox', 'actions.skip')}
          </Button>
        </section>
      )}

      {datePicker !== null && (
        <Modal open onClose={() => setDatePicker(null)} title={t('inbox', 'dateDialog.title')}>
          <DatePicker
            value={
              datePicker.task.plannedDate !== null
                ? toCalendarDate(datePicker.task.plannedDate)
                : null
            }
            visibleMonth={datePicker.visibleMonth}
            onVisibleMonthChange={(month) =>
              setDatePicker((prev) => (prev === null ? null : { ...prev, visibleMonth: month }))
            }
            onSelect={handleSelectDate}
            today={toCalendarDate(Temporal.Now.plainDateISO())}
            weekStartsOn={WEEKDAY_MONDAY}
            weekdayLabels={WEEKDAY_LABELS}
            monthLabels={MONTH_LABELS}
            label={t('inbox', 'dateDialog.gridLabel')}
            previousMonthLabel={t('inbox', 'dateDialog.prevMonth')}
            nextMonthLabel={t('inbox', 'dateDialog.nextMonth')}
          />
        </Modal>
      )}
    </div>
  );
}
