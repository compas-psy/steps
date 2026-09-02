/**
 * `ProjectDetail` — экран одного проекта, M17 List / M18 Board (плюс M19
 * Project Empty) из `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`, эпик E09,
 * пакеты работ E09.3 (рендер секций/задач, drag-and-drop задач, инлайн-
 * добавление задачи) и E09.4 (CRUD секций: создание/переименование/
 * удаление/reorder, см. блок «CRUD секций» ниже). Источник поведения —
 * `01_PRODUCT_BEHAVIOR_R1.md` §12 «Sections»/«Delete section» и §13
 * «List / Board».
 *
 * --- Секции: единый источник и порядок (§13) --------------------------
 *
 * §13, дословно (только про Board): "`Без раздела` first only if
 * non-empty." §12, дословно (общее правило): "User-created empty Section
 * remains visible; synthetic `Без раздела` is hidden only when empty."
 * Спецификация не оговаривает порядок List отдельно — трактовка этого
 * пакета работ: тот же порядок, что и Board (реальные секции по `rank`
 * возрастанием, «Без раздела» первой при непустоте), ради согласованности
 * между двумя видами одних и тех же данных (§13: "Same Sections are used
 * in both") — List и Board отличаются только раскладкой (колонки vs
 * вертикальный список), не порядком секций внутри. `buildSectionEntries`
 * ниже — ЕДИНСТВЕННОЕ место, которое решает порядок; и `renderList`, и
 * `renderBoard` берут готовый результат, не считают его каждый по-своему.
 *
 * Исключение из «hidden only when empty»: если у проекта вообще нет
 * пользовательских секций (`sections.length === 0`), «Без раздела»
 * показывается ВСЕГДА, даже пустой — иначе M19 (пустой проект без единой
 * секции) не имел бы вообще ни одного места на экране, куда можно было бы
 * вписать первую задачу (инлайн-поле живёт внутри секции, см. ниже). Это
 * единственная причина исключения — как только появляется хотя бы одна
 * реальная секция, синтетическая пустая «Без раздела» снова скрывается по
 * буквальному правилу §12.
 *
 * --- M19 Project Empty — CTA поверх, не вместо (сознательное решение) ---
 *
 * В отличие от `Projects.tsx` (где `EmptyState` заменяет список целиком),
 * здесь `EmptyState` рендерится ДОПОЛНИТЕЛЬНО поверх обычной структуры
 * секций, а не вместо неё: задание требует, чтобы CTA «фокусировал
 * инлайн-поле добавления» — а полю неоткуда взяться, если структуру
 * секций скрыть. Секции с их (пустыми) инлайн-полями остаются
 * смонтированными всегда; `EmptyState`, когда виден, — заметный баннер
 * над ними, указывающий на первое доступное поле ввода.
 *
 * --- Открытие Task Detail по клику на строку/карточку (эпик E10.2) --------
 *
 * Task Detail (`TaskDetail.tsx`) появился этим пакетом работ — обёртки
 * строки/карточки (`TaskListRow`/`TaskBoardCard` ниже) получили ровно одну
 * точечную правку: `onClick={() => controller.openTask(task.id)}` на их
 * внешний контейнер (`TaskListRow` — уже существующий `<div data-testid=
 * task-row-...>`, использовавшийся только под drag-обвязку; `TaskBoardCard`
 * — сам `BoardCard.onClick`, компонент уже проектировался под это, см. его
 * заголовок в `@shagi/ui`). Чекбокс строки — `TaskRow`/`TaskCheckbox`
 * (`@shagi/ui`) не даёт вызывающему коду проброс `onClick` на сам `<input>`
 * (тот же разбор, что `Today.tsx`, заголовок, блок «Открытие Task Detail»),
 * поэтому клик по строке в List проверяет свою цель — `isInteractiveRowClick`
 * ниже, буквально та же функция, что уже введена в `Today.tsx` (узкое
 * дублирование, а не импорт приватной функции соседнего экрана — тот же
 * прецедент, что `getLocalIdentity`/`getDeviceId` в этом же файле).
 * `TaskMenuTrigger` (и в List, и в Board) — свой собственный `<div
 * style={{position:'relative'}}>`, уже написанный этим файлом, получил
 * настоящий `event.stopPropagation()`, тот же приём, что `Label.tsx`
 * (`@shagi/ui`) уже применяет для своей кнопки `onRemove`.
 *
 * --- Не в объёме этого пакета работ (см. задание) ------------------------
 *
 * - Запись переключения List/Board обратно в `project.defaultView` —
 *   переключатель ниже управляет только локальным видом экрана
 *   (`useState`), не мутирует проект.
 * - Виртуализация Board при >200 карточек (§13: "Board virtualizes
 *   >200 cards") — YAGNI: ни один тестовый сценарий не создаёт такое
 *   число задач, проектировать под гипотетическую нагрузку раньше времени
 *   не имеет смысла (CLAUDE.md).
 * - Точное произвольное позиционирование клавиатурой при перемещении
 *   между секциями — доступная альтернатива drag ограничена пунктом меню
 *   «Переместить в раздел», кладущим задачу В КОНЕЦ выбранной секции (см.
 *   блок «Доступная альтернатива drag» ниже) — этого достаточно, чтобы
 *   выполнить буквальное требование §13 ("accessible context-menu/
 *   keyboard alternative"), не более.
 * - Действия над самим проектом (архивировать/редактировать) из меню
 *   `ProjectHeader` — компонент требует рабочий `menuSections` по контракту
 *   пропсов, но ни одно продуктовое действие проекта не входит в это
 *   задание: `menuSections={[]}` — честно пустое меню, а не выдуманные
 *   пункты сверх задания.
 *
 * --- Локальная идентичность устройства/владельца ------------------------
 *
 * Тот же узкий приём, что `FirstTask.tsx` (`getLocalIdentity`): постоянного
 * порта идентичности ещё нет в дереве пакетов, поэтому `ownerScope`
 * (нужен только для `createTaskCommand`, инлайн-добавление) и `deviceId`
 * (тай-брейк HLC всех команд экрана) генерируются и кэшируются один раз за
 * время жизни модуля. Дублирование именно этой узкой функции, а не импорт
 * приватной функции `FirstTask.tsx`, — то же решение, что уже
 * задокументировано там и в `Today.tsx`/`Inbox.tsx`.
 *
 * --- Drag-and-drop: расчёт ранга ------------------------------------------
 *
 * `resolveRank`/`NewRank` (`@shagi/core`, `commands/project-rank.ts`) —
 * generic по `Rank`, задание прямо разрешает переиспользовать их для Task
 * («Готово, только используй»). Здесь они используются, чтобы посчитать
 * готовый `Rank`, который затем передаётся в `updateTaskCommand` как
 * `{placement:'explicit', rank}` (форма `NewTaskRank` из `rank-input.ts` —
 * та же не по импорту, а по структуре: оба типа — один и тот же набор
 * вариантов `placement`). Три операции сведены в две маленькие чистые
 * функции ниже (`appendRank`/`insertBeforeRank`) — вставка в конец списка
 * (drop на пустое место секции/колонки, «Переместить в раздел») и вставка
 * перед конкретной соседней задачей (drop на саму карточку/строку).
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import {
  completeOccurrenceCommand,
  createSectionCommand,
  createTaskCommand,
  deleteSectionCommand,
  deleteTaskCommand,
  generateDeviceId,
  generateUuidV7,
  resolveRank,
  updateSectionCommand,
  updateTaskCommand,
  type DeleteSectionDeps,
  type NewRank,
  type Project,
  type Rank,
  type Section,
  type SectionCommandDeps,
  type SectionCommandResult,
  type Task,
  type TaskCommandResult,
  type Uuid,
} from '@shagi/core';
import {
  BoardCard,
  BoardColumn,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Input,
  Modal,
  ProjectHeader,
  Section as SectionHeader,
  SegmentedControl,
  TaskMenu,
  TaskRow,
  Toast,
  type TaskMenuItemData,
} from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';
import './ProjectDetail.css';

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

// --- Модель секции экрана (см. заголовок файла, блок «Секции») --------------

/** `sectionId: null` — синтетическое «Без раздела» (§12/§13). */
interface SectionEntry {
  readonly sectionId: Uuid | null;
  readonly title: string;
  readonly tasks: readonly Task[];
}

/** Строковый ключ для React `key`/тестовых `data-testid` — `Uuid | null` не
 * годится напрямую как ключ карты `Record`. */
function sectionKeyOf(sectionId: Uuid | null): string {
  return sectionId ?? '__none__';
}

/**
 * Единственное место, решающее порядок секций — см. заголовок файла, блок
 * «Секции: единый источник и порядок». `sections` уже отсортированы по
 * `rank` (`SectionRepository.listByProject`, см. его комментарий).
 */
function buildSectionEntries(
  sections: readonly Section[],
  noSectionTasks: readonly Task[],
  tasksBySectionId: ReadonlyMap<Uuid, readonly Task[]>,
): readonly SectionEntry[] {
  const realEntries: SectionEntry[] = sections.map((section) => ({
    sectionId: section.id,
    title: section.title,
    tasks: tasksBySectionId.get(section.id) ?? [],
  }));

  // См. заголовок файла: скрыта, когда пуста — ЕСЛИ есть хотя бы одна
  // реальная секция, куда вместо неё смотреть; иначе показана как
  // единственная точка входа для первой задачи (M19).
  const showNoSection = noSectionTasks.length > 0 || sections.length === 0;
  if (!showNoSection) return realEntries;

  const noSectionEntry: SectionEntry = {
    sectionId: null,
    title: t('projectDetail', 'sections.none'),
    tasks: noSectionTasks,
  };
  return [noSectionEntry, ...realEntries];
}

// --- Расчёт ранга при перемещении (см. заголовок файла, блок «Drag-and-drop») -
//
// Обобщены до `Ranked` (пакет работ E09.4, CRUD секций): и Task, и Section
// несут `id`/`rank` в одной и той же форме (`Rank` — не параметризованный по
// сущности branded-тип, `project-rank.ts`), поэтому две функции ниже (уже
// написанные под Task) переиспользуются для reorder Section буквально тем же
// вызовом с другим списком — не копия логики под новым именем.

interface Ranked {
  readonly id: Uuid;
  readonly rank: Rank;
}

/** Вставка в конец списка (drop на секцию/колонку целиком, «Переместить в
 * раздел»; для Section — конец списка реальных секций при создании) —
 * `excludeId` убирает сам перемещаемый элемент из списка соседей, если он
 * уже был в этом же списке. */
function appendRank<T extends Ranked>(list: readonly T[], excludeId: Uuid): NewRank {
  const last = list.filter((item) => item.id !== excludeId).at(-1);
  return last === undefined
    ? { placement: 'empty-list' }
    : { placement: 'end', lastRank: last.rank };
}

/** Вставка непосредственно перед `target` в его же списке (drop на
 * конкретную соседнюю карточку/строку/секцию). */
function insertBeforeRank<T extends Ranked>(
  list: readonly T[],
  targetId: Uuid,
  excludeId: Uuid,
): NewRank {
  const filtered = list.filter((item) => item.id !== excludeId);
  const index = filtered.findIndex((item) => item.id === targetId);
  const target = filtered[index];
  // Оборонительная ветка: цель не найдена в своём же списке (не должно
  // случаться — вызывающий код всегда передаёт реального соседа) — не
  // выдумываем `NewRank` с потенциально `undefined` полем, откатываемся на
  // ту же стратегию «в конец», что и остальной код этого файла.
  if (target === undefined) return appendRank(list, excludeId);
  const prev = index > 0 ? filtered[index - 1] : undefined;
  return prev === undefined
    ? { placement: 'start', firstRank: target.rank }
    : { placement: 'between', lowerRank: prev.rank, upperRank: target.rank };
}

// --- Меню действий строки/карточки задачи -----------------------------------

interface TaskActionHandlers {
  readonly onComplete: (task: Task) => void;
  readonly onMoveToSection: (task: Task) => void;
  readonly onDelete: (task: Task) => void;
}

function buildTaskMenuActions(
  task: Task,
  handlers: TaskActionHandlers,
): { frequent: readonly TaskMenuItemData[]; destructive: TaskMenuItemData } {
  const frequent: readonly TaskMenuItemData[] = [
    {
      key: 'complete',
      label: t('projectDetail', 'actions.complete'),
      icon: 'check',
      onSelect: () => handlers.onComplete(task),
    },
    {
      key: 'move-to-section',
      label: t('projectDetail', 'actions.moveToSection'),
      icon: 'section',
      onSelect: () => handlers.onMoveToSection(task),
    },
  ];
  const destructive: TaskMenuItemData = {
    key: 'delete',
    label: t('projectDetail', 'actions.delete'),
    icon: 'delete',
    onSelect: () => handlers.onDelete(task),
  };
  return { frequent, destructive };
}

function preventDefault(event: DragEvent): void {
  event.preventDefault();
}

/** См. заголовок файла, блок «Открытие Task Detail по клику на строку/
 * карточку» — та же функция, что `Today.tsx` (узкое дублирование, тот же
 * прецедент, что `getLocalIdentity`/`getDeviceId`). */
function isInteractiveRowClick(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, button') !== null;
}

/** Счётчик задач секции/колонки — вынесена на верхний уровень (не замыкает
 * ничего из компонента), oxlint `unicorn/consistent-function-scoping`. */
function taskCountLabel(count: number): string {
  return t('tasks', 'count', { count });
}

// --- Инлайн-добавление задачи (без NLP — E05 отдельно, см. заголовок) -------

interface InlineAddFormProps {
  readonly sectionEntry: SectionEntry;
  readonly inputRef: (el: HTMLInputElement | null) => void;
  readonly onSubmit: (sectionEntry: SectionEntry, title: string) => void;
}

function InlineAddForm({ sectionEntry, inputRef, onSubmit }: InlineAddFormProps): ReactElement {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (trimmed.length === 0) return;
        onSubmit(sectionEntry, trimmed);
        setValue('');
      }}
    >
      <Input
        ref={inputRef}
        aria-label={t('projectDetail', 'inlineAdd.label', { section: sectionEntry.title })}
        placeholder={t('projectDetail', 'inlineAdd.placeholder')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="ghost">
        {t('projectDetail', 'inlineAdd.submit')}
      </Button>
    </form>
  );
}

// --- CRUD секций (пакет работ E09.4) -----------------------------------------
//
// «Без раздела» (`sectionId: null`) — вне территории всех операций ниже (см.
// заголовок файла и текст задания): у неё физически нет записи `Section`,
// которую можно было бы патчить/тombstone-ить/двигать. Три компонента ниже
// работают ТОЛЬКО с реальным `Section` (не `SectionEntry`) — ренд секции в
// `sectionEntries.map` передаёт `section: Section | null`, `null` только для
// синтетической записи, и в этом случае просто рендерит текст без органов
// управления.

/** Форма создания раздела — ОДНА над списком секций/колонок (не внутри
 * каждой, в отличие от `InlineAddForm` для задач, см. текст задания), видна
 * и в List, и в Board одинаково (рендерится один раз, выше переключателя
 * вида). Тот же приём триминга/no-op-на-пустом, что `InlineAddForm`. */
interface CreateSectionFormProps {
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (title: string) => void;
}

function CreateSectionForm({
  value,
  error,
  onChange,
  onSubmit,
}: CreateSectionFormProps): ReactElement {
  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (trimmed.length === 0) return;
        onSubmit(trimmed);
      }}
    >
      <Input
        aria-label={t('projectDetail', 'sections.createLabel')}
        placeholder={t('projectDetail', 'sections.createPlaceholder')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        errorMessage={error ?? undefined}
      />
      <Button type="submit" variant="secondary">
        {t('projectDetail', 'sections.createSubmit')}
      </Button>
    </form>
  );
}

/**
 * Заголовок реальной секции + её органы управления — единственный узел,
 * который передаётся как `title` в `Section`(`@shagi/ui`)/`BoardColumn`
 * (оба принимают `title: ReactNode`, не только строку — задание того же
 * рода, что уже использует этот файл для `sectionEntry.title`).
 *
 * Переименование (задание, п.2: "Клик по заголовку секции... превращает
 * заголовок в редактируемое поле") — здесь выбран именно клик по заголовку,
 * не отдельная кнопка-карандаш: в реестре иконок `@shagi/ui`
 * (`packages/ui/src/icons/contours.ts`, вне территории этого пакета работ)
 * нет иконки "редактировать"/карандаш, а задание явно разрешает выбор между
 * двумя вариантами ("реши по обстоятельствам"). Autosave-по-blur — тот же
 * приём, что `TaskDetail.tsx` `handleTitleBlur`; Enter — та же команда
 * коммита, просто через программный `blur()` (не дублирует логику commit
 * дважды под двумя разными обработчиками).
 *
 * Кнопки «вверх»/«вниз» — текстовые `Button`, не `IconButton` с `chevron`:
 * `chevron` в реестре ровно один, без параметра направления (комментарий
 * `contours.ts`: "поворот через CSS `transform` у потребителя" — но
 * `IconButton` не даёт потребителю дотянуться до `className` самой иконки,
 * только до кнопки целиком), а вращать иконку через CSS вне `packages/ui`
 * ради недоступного-в-реестре второго глифа усложняет ровно то, что задание
 * прямо разрешает сделать "просто и видимо" текстом.
 */
interface SectionTitleControlsProps {
  readonly section: Section;
  readonly isEditing: boolean;
  readonly titleDraft: string;
  readonly titleError: string | null;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onStartEdit: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onRequestDelete: () => void;
}

function SectionTitleControls({
  section,
  isEditing,
  titleDraft,
  titleError,
  canMoveUp,
  canMoveDown,
  onStartEdit,
  onDraftChange,
  onCommit,
  onMoveUp,
  onMoveDown,
  onRequestDelete,
}: SectionTitleControlsProps): ReactElement {
  return (
    <span style={{ display: 'flex', alignItems: 'center' }}>
      {isEditing ? (
        <Input
          aria-label={t('projectDetail', 'sections.renameFieldLabel', { title: section.title })}
          value={titleDraft}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.currentTarget.blur();
          }}
          errorMessage={titleError ?? undefined}
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          data-testid={`sectionTitleButton-${section.id}`}
        >
          {section.title}
        </button>
      )}
      <Button variant="ghost" size="sm" disabled={!canMoveUp} onClick={onMoveUp}>
        {t('projectDetail', 'sections.moveUp')}
      </Button>
      <Button variant="ghost" size="sm" disabled={!canMoveDown} onClick={onMoveDown}>
        {t('projectDetail', 'sections.moveDown')}
      </Button>
      <IconButton
        icon="delete"
        variant="destructive"
        size="sm"
        label={t('projectDetail', 'sections.deleteLabel', { title: section.title })}
        onClick={onRequestDelete}
      />
    </span>
  );
}

// --- Строка/карточка задачи с drag-обвязкой ---------------------------------

interface TaskItemProps {
  readonly task: Task;
  readonly sectionEntry: SectionEntry;
  readonly dragging: boolean;
  readonly menuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly handlers: TaskActionHandlers;
  readonly onDragStart: (task: Task, sectionEntry: SectionEntry) => void;
  readonly onDropOnTask: (task: Task, sectionEntry: SectionEntry) => void;
  /** См. заголовок файла, блок «Открытие Task Detail по клику на строку/
   * карточку». */
  readonly onOpen: (task: Task) => void;
}

function TaskMenuTrigger({
  task,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  handlers,
}: {
  readonly task: Task;
  readonly menuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly handlers: TaskActionHandlers;
}): ReactElement {
  const { frequent, destructive } = buildTaskMenuActions(task, handlers);
  return (
    <div style={{ position: 'relative' }} onClick={(event) => event.stopPropagation()}>
      <IconButton
        icon="more"
        label={t('projectDetail', 'menu.triggerLabel', { title: task.title })}
        variant="ghost"
        onClick={onToggleMenu}
      />
      <TaskMenu
        open={menuOpen}
        onClose={onCloseMenu}
        aria-label={t('projectDetail', 'menu.ariaLabel', { title: task.title })}
        frequentActions={frequent}
        destructiveAction={destructive}
      />
    </div>
  );
}

function TaskListRow({
  task,
  sectionEntry,
  dragging,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  handlers,
  onDragStart,
  onDropOnTask,
  onOpen,
}: TaskItemProps): ReactElement {
  return (
    <div
      data-testid={`task-row-${task.id}`}
      draggable
      onDragStart={() => onDragStart(task, sectionEntry)}
      onDragOver={preventDefault}
      onDrop={(event) => {
        event.stopPropagation();
        onDropOnTask(task, sectionEntry);
      }}
      onClick={(event) => {
        if (isInteractiveRowClick(event.target)) return;
        onOpen(task);
      }}
    >
      <TaskRow
        title={task.title}
        checkboxLabel={task.title}
        checked={false}
        state={dragging ? 'dragging' : 'normal'}
        onCheckedChange={(checked) => {
          if (checked) handlers.onComplete(task);
        }}
        trailing={
          <TaskMenuTrigger
            task={task}
            menuOpen={menuOpen}
            onToggleMenu={onToggleMenu}
            onCloseMenu={onCloseMenu}
            handlers={handlers}
          />
        }
      />
    </div>
  );
}

function TaskBoardCard({
  task,
  sectionEntry,
  dragging,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  handlers,
  onDragStart,
  onDropOnTask,
  onOpen,
}: TaskItemProps): ReactElement {
  return (
    <div
      data-testid={`board-card-${task.id}`}
      draggable
      onDragStart={() => onDragStart(task, sectionEntry)}
      onDragOver={preventDefault}
      onDrop={(event) => {
        event.stopPropagation();
        onDropOnTask(task, sectionEntry);
      }}
    >
      <BoardCard dragging={dragging} onClick={() => onOpen(task)}>
        {task.title}
        <TaskMenuTrigger
          task={task}
          menuOpen={menuOpen}
          onToggleMenu={onToggleMenu}
          onCloseMenu={onCloseMenu}
          handlers={handlers}
        />
      </BoardCard>
    </div>
  );
}

export function ProjectDetail(): ReactElement | null {
  const storage = useStorage();
  const controller = useAppController();
  const projectId = controller.getState().selectedProjectId;

  const [project, setProject] = useState<Project | null>(null);
  const [sections, setSections] = useState<readonly Section[] | null>(null);
  const [noSectionTasks, setNoSectionTasks] = useState<readonly Task[]>([]);
  const [tasksBySectionId, setTasksBySectionId] = useState<ReadonlyMap<Uuid, readonly Task[]>>(
    new Map(),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewOverride, setViewOverride] = useState<Project['defaultView'] | null>(null);
  const [openMenuTaskId, setOpenMenuTaskId] = useState<Uuid | null>(null);
  const [moveDialogTask, setMoveDialogTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<{
    readonly task: Task;
    readonly sectionEntry: SectionEntry;
  } | null>(null);

  // --- CRUD секций (E09.4) — см. заголовок файла, блок «CRUD секций» -------
  const [createSectionTitle, setCreateSectionTitle] = useState('');
  const [createSectionError, setCreateSectionError] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<Uuid | null>(null);
  const [sectionTitleDraft, setSectionTitleDraft] = useState('');
  const [sectionTitleError, setSectionTitleError] = useState<string | null>(null);
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<Section | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<Uuid | null>(null);

  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  async function loadAll(): Promise<void> {
    if (projectId === null) return;
    const [nextProject, nextSections] = await Promise.all([
      storage.projects.findById(projectId),
      storage.sections.listByProject(projectId),
    ]);
    setProject(nextProject);
    setSections(nextSections);

    const [nextNoSection, ...perSection] = await Promise.all([
      storage.tasks.listByProjectSection(projectId, null, 'active'),
      ...nextSections.map((section) =>
        storage.tasks.listByProjectSection(projectId, section.id, 'active'),
      ),
    ]);
    setNoSectionTasks(nextNoSection);
    setTasksBySectionId(
      new Map(nextSections.map((section, index) => [section.id, perSection[index] ?? []])),
    );
  }

  useEffect(() => {
    let cancelled = false;
    void loadAll().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storage/projectId стабильны на время жизни экрана
  }, [storage, projectId]);

  function commandDeps(): { storage: typeof storage; now: Temporal.Instant; deviceId: Uuid } {
    return { storage, now: Temporal.Now.instant(), deviceId: getLocalIdentity().deviceId };
  }

  async function runCommand(promise: Promise<TaskCommandResult>): Promise<void> {
    const result = await promise;
    if (result.status === 'ok') {
      setErrorMessage(null);
      await loadAll();
      return;
    }
    setErrorMessage(t('projectDetail', 'errors.actionFailed'));
  }

  // --- CRUD секций (E09.4): зависимости команд ------------------------------
  //
  // `storage` (полный `StoragePort`, `@shagi/storage`) структурно подходит
  // и под `SectionCommandDeps.storage` (`CommandSectionStoragePort`:
  // `.sections`+`runTransaction`), и под `DeleteSectionDeps.tasks`
  // (`CommandProjectTaskReader`: `storage.tasks.listByProjectSection`) и
  // `.taskCommandStorage` (`CommandStoragePort` — тот же порт, что уже
  // передаётся в task-команды этого экрана, `commandDeps().storage` выше) —
  // без адаптера, тот же приём инверсии зависимости (ADR-0003), что уже
  // работает для Task/Project.
  function sectionCommandDeps(): SectionCommandDeps {
    return { storage, now: Temporal.Now.instant(), deviceId: getLocalIdentity().deviceId };
  }

  function deleteSectionDeps(): DeleteSectionDeps {
    return {
      storage,
      tasks: storage.tasks,
      taskCommandStorage: storage,
      now: Temporal.Now.instant(),
      deviceId: getLocalIdentity().deviceId,
    };
  }

  /** Общий разбор исхода Section-команд без полевой ошибки (reorder — `rank`
   * не проходит через `validateSection`, `rejected` там практически
   * недостижим) — та же дисциплина, что `runCommand` для Task. */
  async function runSectionCommand(promise: Promise<SectionCommandResult>): Promise<void> {
    const result = await promise;
    if (result.status === 'ok') {
      setErrorMessage(null);
      await loadAll();
      return;
    }
    setErrorMessage(t('projectDetail', 'errors.actionFailed'));
  }

  function handleCreateSection(title: string): void {
    if (project === null || sections === null) return;
    // `generateUuidV7()` как `excludeId` — та же уловка, что уже применяет
    // `handleInlineAdd` для Task: у ещё не созданной сущности нет своего
    // `id`, а `appendRank` фильтрует список по `excludeId`, никогда не
    // совпадающему ни с одной реальной секцией — эффективно no-op фильтр.
    const rank = appendRank(sections, generateUuidV7());
    void (async () => {
      const result = await createSectionCommand(
        { projectId: project.id, title, rank },
        sectionCommandDeps(),
      );
      if (result.status === 'ok') {
        setCreateSectionTitle('');
        setCreateSectionError(null);
        await loadAll();
        return;
      }
      if (result.status === 'rejected') {
        setCreateSectionError(t('projectDetail', 'sections.errors.titleInvalid'));
        return;
      }
      setErrorMessage(t('projectDetail', 'errors.actionFailed'));
    })();
  }

  function startEditSection(section: Section): void {
    setEditingSectionId(section.id);
    setSectionTitleDraft(section.title);
    setSectionTitleError(null);
  }

  /** Autosave-по-blur (задание, п.2: "тот же приём... что в TaskDetail.tsx
   * для title/description задачи") — no-op без сети, если черновик не
   * отличается от текущего заголовка (закрывает режим редактирования без
   * вызова команды, тот же щадящий путь, что `handleTitleBlur`). Отклонение
   * (`validateSection`, правило 23) — ошибка у поля, режим редактирования
   * остаётся открытым, чтобы пользователь мог исправить (`01§17`-приём,
   * применённый `TaskDetail.tsx` `savePlanningPatch` к Planning-полям). */
  function handleCommitSectionTitle(section: Section): void {
    const trimmed = sectionTitleDraft.trim();
    if (trimmed === section.title) {
      setEditingSectionId(null);
      setSectionTitleError(null);
      return;
    }
    void (async () => {
      const result = await updateSectionCommand(
        { id: section.id, patch: { title: trimmed } },
        sectionCommandDeps(),
      );
      if (result.status === 'ok') {
        setEditingSectionId(null);
        setSectionTitleError(null);
        await loadAll();
        return;
      }
      if (result.status === 'rejected') {
        setSectionTitleError(t('projectDetail', 'sections.errors.titleInvalid'));
        return;
      }
      setEditingSectionId(null);
      setErrorMessage(t('projectDetail', 'errors.actionFailed'));
    })();
  }

  function handleConfirmDeleteSection(): void {
    if (deleteSectionConfirm === null) return;
    const target = deleteSectionConfirm;
    setDeleteSectionConfirm(null);
    void (async () => {
      const result = await deleteSectionCommand({ id: target.id }, deleteSectionDeps());
      if (result.status === 'ok') {
        setErrorMessage(null);
        await loadAll();
        return;
      }
      setErrorMessage(t('projectDetail', 'errors.actionFailed'));
    })();
  }

  /** Доступная альтернатива drag (задание, п.4; тот же принцип §13, что уже
   * применён для задач этого экрана) — перестановка ровно с соседом, не
   * произвольная позиция: у Section фиксированный список, соседняя
   * перестановка исчерпывающе покрывает reorder (в отличие от задач, где
   * между секциями движение произвольное). */
  function handleMoveSectionUp(section: Section): void {
    if (sections === null) return;
    const index = sections.findIndex((candidate) => candidate.id === section.id);
    const prev = index > 0 ? sections[index - 1] : undefined;
    if (prev === undefined) return;
    const rank = insertBeforeRank(sections, prev.id, section.id);
    void runSectionCommand(
      updateSectionCommand({ id: section.id, patch: { rank } }, sectionCommandDeps()),
    );
  }

  function handleMoveSectionDown(section: Section): void {
    if (sections === null) return;
    const index = sections.findIndex((candidate) => candidate.id === section.id);
    const next = sections[index + 1];
    if (next === undefined) return;
    const afterNext = sections[index + 2];
    const rank =
      afterNext === undefined
        ? appendRank(sections, section.id)
        : insertBeforeRank(sections, afterNext.id, section.id);
    void runSectionCommand(
      updateSectionCommand({ id: section.id, patch: { rank } }, sectionCommandDeps()),
    );
  }

  function handleSectionDragStart(sectionId: Uuid): void {
    setDraggedSectionId(sectionId);
  }

  /** Один диспетчер и на drop секции (reorder), и на существовавший ранее
   * drop задачи в конец секции — оба используют один и тот же DOM-дропзон
   * (заголовок/колонка секции), различаются только тем, какое состояние
   * сейчас непусто (`draggedSectionId` vs `draggedTask`). */
  function handleSectionOrTaskDrop(entry: SectionEntry, section: Section | null): void {
    if (draggedSectionId !== null) {
      if (section !== null && draggedSectionId !== section.id && sections !== null) {
        const movedId = draggedSectionId;
        const rank = insertBeforeRank(sections, section.id, movedId);
        setDraggedSectionId(null);
        void runSectionCommand(
          updateSectionCommand({ id: movedId, patch: { rank } }, sectionCommandDeps()),
        );
        return;
      }
      setDraggedSectionId(null);
      return;
    }
    handleDropOnSectionEnd(entry.sectionId);
  }

  const sectionEntries = useMemo(
    () =>
      sections === null ? [] : buildSectionEntries(sections, noSectionTasks, tasksBySectionId),
    [sections, noSectionTasks, tasksBySectionId],
  );

  const isEmpty = sectionEntries.every((entry) => entry.tasks.length === 0);

  // `completeOccurrenceCommand` (эпик E11.2) — см. тот же комментарий в
  // `Today.tsx`: для НЕ recurring задачи ведёт себя идентично
  // `completeTaskCommand`, обязательный вход `occurrenceLocalDate` — уже
  // материализованная локальная дата (CLAUDE.md «Время»).
  function handleComplete(task: Task): void {
    setOpenMenuTaskId(null);
    void runCommand(
      completeOccurrenceCommand(
        { id: task.id, occurrenceLocalDate: Temporal.Now.plainDateISO() },
        commandDeps(),
      ),
    );
  }

  function handleDelete(task: Task): void {
    setOpenMenuTaskId(null);
    void runCommand(deleteTaskCommand({ id: task.id }, commandDeps()));
  }

  function listOfSection(sectionId: Uuid | null): readonly Task[] {
    return sectionEntries.find((entry) => entry.sectionId === sectionId)?.tasks ?? [];
  }

  /** Перемещение В КОНЕЦ целевой секции — общая механика и для «Переместить
   * в раздел» (доступная альтернатива drag, см. заголовок файла), и для
   * drop на пустое место секции/колонки целиком. */
  function moveTaskToSectionEnd(task: Task, targetSectionId: Uuid | null): void {
    const targetList = listOfSection(targetSectionId);
    const rank = resolveRank(appendRank(targetList, task.id));
    const patch =
      targetSectionId === task.sectionId
        ? { rank: { placement: 'explicit' as const, rank } }
        : { sectionId: targetSectionId, rank: { placement: 'explicit' as const, rank } };
    void runCommand(updateTaskCommand({ id: task.id, patch }, commandDeps()));
  }

  function handleMoveToSection(task: Task): void {
    setOpenMenuTaskId(null);
    setMoveDialogTask(task);
  }

  function handleMoveDialogSelect(targetSectionId: Uuid | null): void {
    if (moveDialogTask === null) return;
    const task = moveDialogTask;
    setMoveDialogTask(null);
    moveTaskToSectionEnd(task, targetSectionId);
  }

  function handleDragStart(task: Task, sectionEntry: SectionEntry): void {
    setDraggedTask({ task, sectionEntry });
  }

  function handleDropOnSectionEnd(targetSectionId: Uuid | null): void {
    if (draggedTask === null) return;
    const { task } = draggedTask;
    setDraggedTask(null);
    moveTaskToSectionEnd(task, targetSectionId);
  }

  function handleDropOnTask(targetTask: Task, targetSectionEntry: SectionEntry): void {
    if (draggedTask === null) return;
    const { task } = draggedTask;
    setDraggedTask(null);
    if (task.id === targetTask.id) return;
    const targetList = listOfSection(targetSectionEntry.sectionId);
    const rank = resolveRank(insertBeforeRank(targetList, targetTask.id, task.id));
    const patch =
      targetSectionEntry.sectionId === task.sectionId
        ? { rank: { placement: 'explicit' as const, rank } }
        : {
            sectionId: targetSectionEntry.sectionId,
            rank: { placement: 'explicit' as const, rank },
          };
    void runCommand(updateTaskCommand({ id: task.id, patch }, commandDeps()));
  }

  function handleInlineAdd(sectionEntry: SectionEntry, title: string): void {
    if (project === null) return;
    const { ownerScope } = getLocalIdentity();
    const rank = resolveRank(appendRank(sectionEntry.tasks, generateUuidV7()));
    void runCommand(
      createTaskCommand(
        {
          ownerScope,
          title,
          projectId: project.id,
          sectionId: sectionEntry.sectionId,
          // §3 «Contextual Quick Add»: «+» из Project/Section/Board →
          // processed + project context, НЕ голый Inbox-захват.
          captureState: 'processed',
          source: 'user',
          sourceChannel: 'text',
          rank: { placement: 'explicit', rank },
        },
        commandDeps(),
      ),
    );
  }

  function focusFirstInlineInput(): void {
    const first = sectionEntries[0];
    if (first === undefined) return;
    inputRefs.current.get(sectionKeyOf(first.sectionId))?.focus();
  }

  const view: Project['defaultView'] = viewOverride ?? project?.defaultView ?? 'list';

  if (project === null || sections === null) return null;

  return (
    <div className="shagi-project-detail">
      <div className="shagi-project-detail__header">
        <IconButton
          icon="back"
          label={t('projectDetail', 'back.label')}
          onClick={() => controller.goTo('projects')}
        />
        <div className="shagi-project-detail__header-title">
          <ProjectHeader
            title={project.title}
            menuOpen={false}
            onMenuOpenChange={() => {
              /* см. заголовок файла: у проекта пока нет действий в этом пакете работ */
            }}
            menuSections={[]}
            menuLabel={t('projectDetail', 'header.menuLabel')}
            triggerLabel={t('projectDetail', 'header.menuTriggerLabel')}
          />
        </div>
      </div>

      {errorMessage !== null && (
        <Toast
          variant="error"
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
          dismissLabel={t('projectDetail', 'errors.dismiss')}
        />
      )}

      <SegmentedControl<Project['defaultView']>
        label={t('projectDetail', 'view.label')}
        value={view}
        onChange={setViewOverride}
        options={[
          { value: 'list', label: t('projectDetail', 'view.list'), icon: 'list' },
          { value: 'board', label: t('projectDetail', 'view.board'), icon: 'board' },
        ]}
      />

      {isEmpty && (
        <EmptyState
          icon={<Icon name="folder" size={32} />}
          title={t('projectDetail', 'empty.title')}
          description={t('projectDetail', 'empty.description')}
          action={
            <Button variant="primary" onClick={focusFirstInlineInput}>
              {t('projectDetail', 'empty.cta')}
            </Button>
          }
        />
      )}

      {/* Создание раздела (задание, п.1) — ОДИН элемент управления над
       * списком секций/колонок, общий для List и Board (не внутри каждой
       * секции, в отличие от `InlineAddForm` для задач) — рендерится один
       * раз здесь, выше переключателя вида, поэтому виден в обоих. */}
      <CreateSectionForm
        value={createSectionTitle}
        error={createSectionError}
        onChange={setCreateSectionTitle}
        onSubmit={handleCreateSection}
      />

      {view === 'list' ? (
        <div className="shagi-project-detail__list">
          {sectionEntries.map((entry) => {
            const section = sections.find((candidate) => candidate.id === entry.sectionId) ?? null;
            const sectionIndex =
              section === null
                ? -1
                : sections.findIndex((candidate) => candidate.id === section.id);
            return (
              <div
                className="shagi-project-detail__section"
                key={sectionKeyOf(entry.sectionId)}
                data-testid={`section-${sectionKeyOf(entry.sectionId)}`}
                onDragOver={preventDefault}
                onDrop={() => handleSectionOrTaskDrop(entry, section)}
              >
                {section === null ? (
                  <SectionHeader title={entry.title} count={taskCountLabel(entry.tasks.length)} />
                ) : (
                  <div
                    data-testid={`sectionDrag-${section.id}`}
                    draggable={editingSectionId !== section.id}
                    onDragStart={() => handleSectionDragStart(section.id)}
                    onDragOver={preventDefault}
                    onDrop={(event) => {
                      event.stopPropagation();
                      handleSectionOrTaskDrop(entry, section);
                    }}
                  >
                    <SectionHeader
                      title={
                        <SectionTitleControls
                          section={section}
                          isEditing={editingSectionId === section.id}
                          titleDraft={sectionTitleDraft}
                          titleError={editingSectionId === section.id ? sectionTitleError : null}
                          canMoveUp={sectionIndex > 0}
                          canMoveDown={sectionIndex >= 0 && sectionIndex < sections.length - 1}
                          onStartEdit={() => startEditSection(section)}
                          onDraftChange={setSectionTitleDraft}
                          onCommit={() => handleCommitSectionTitle(section)}
                          onMoveUp={() => handleMoveSectionUp(section)}
                          onMoveDown={() => handleMoveSectionDown(section)}
                          onRequestDelete={() => setDeleteSectionConfirm(section)}
                        />
                      }
                      count={taskCountLabel(entry.tasks.length)}
                    />
                  </div>
                )}
                {entry.tasks.length > 0 && (
                  <div className="shagi-project-detail__section-tasks">
                    {entry.tasks.map((task) => (
                      <TaskListRow
                        key={task.id}
                        task={task}
                        sectionEntry={entry}
                        dragging={draggedTask?.task.id === task.id}
                        menuOpen={openMenuTaskId === task.id}
                        onToggleMenu={() =>
                          setOpenMenuTaskId((id) => (id === task.id ? null : task.id))
                        }
                        onCloseMenu={() => setOpenMenuTaskId(null)}
                        handlers={{
                          onComplete: handleComplete,
                          onMoveToSection: handleMoveToSection,
                          onDelete: handleDelete,
                        }}
                        onDragStart={handleDragStart}
                        onDropOnTask={handleDropOnTask}
                        onOpen={(openedTask) => controller.openTask(openedTask.id)}
                      />
                    ))}
                  </div>
                )}
                <InlineAddForm
                  sectionEntry={entry}
                  inputRef={(el) => {
                    if (el === null) inputRefs.current.delete(sectionKeyOf(entry.sectionId));
                    else inputRefs.current.set(sectionKeyOf(entry.sectionId), el);
                  }}
                  onSubmit={handleInlineAdd}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="shagi-project-detail__board">
          {sectionEntries.map((entry) => {
            const section = sections.find((candidate) => candidate.id === entry.sectionId) ?? null;
            const sectionIndex =
              section === null
                ? -1
                : sections.findIndex((candidate) => candidate.id === section.id);
            return (
              <div
                key={sectionKeyOf(entry.sectionId)}
                draggable={section !== null && editingSectionId !== section.id}
                onDragStart={() => {
                  if (section !== null) handleSectionDragStart(section.id);
                }}
              >
                <BoardColumn
                  title={
                    section === null ? (
                      entry.title
                    ) : (
                      <SectionTitleControls
                        section={section}
                        isEditing={editingSectionId === section.id}
                        titleDraft={sectionTitleDraft}
                        titleError={editingSectionId === section.id ? sectionTitleError : null}
                        canMoveUp={sectionIndex > 0}
                        canMoveDown={sectionIndex >= 0 && sectionIndex < sections.length - 1}
                        onStartEdit={() => startEditSection(section)}
                        onDraftChange={setSectionTitleDraft}
                        onCommit={() => handleCommitSectionTitle(section)}
                        onMoveUp={() => handleMoveSectionUp(section)}
                        onMoveDown={() => handleMoveSectionDown(section)}
                        onRequestDelete={() => setDeleteSectionConfirm(section)}
                      />
                    )
                  }
                  count={taskCountLabel(entry.tasks.length)}
                  onDragOver={preventDefault}
                  onDrop={() => handleSectionOrTaskDrop(entry, section)}
                >
                  {entry.tasks.map((task) => (
                    <TaskBoardCard
                      key={task.id}
                      task={task}
                      sectionEntry={entry}
                      dragging={draggedTask?.task.id === task.id}
                      menuOpen={openMenuTaskId === task.id}
                      onToggleMenu={() =>
                        setOpenMenuTaskId((id) => (id === task.id ? null : task.id))
                      }
                      onCloseMenu={() => setOpenMenuTaskId(null)}
                      handlers={{
                        onComplete: handleComplete,
                        onMoveToSection: handleMoveToSection,
                        onDelete: handleDelete,
                      }}
                      onDragStart={handleDragStart}
                      onDropOnTask={handleDropOnTask}
                      onOpen={(openedTask) => controller.openTask(openedTask.id)}
                    />
                  ))}
                  <InlineAddForm
                    sectionEntry={entry}
                    inputRef={(el) => {
                      if (el === null) inputRefs.current.delete(sectionKeyOf(entry.sectionId));
                      else inputRefs.current.set(sectionKeyOf(entry.sectionId), el);
                    }}
                    onSubmit={handleInlineAdd}
                  />
                </BoardColumn>
              </div>
            );
          })}
        </div>
      )}

      {/* Доступная альтернатива drag (§13: "Every drag operation has
       * accessible context-menu/keyboard alternative") — см. заголовок
       * файла, блок «M19»/«Не в объёме»: перемещение всегда В КОНЕЦ
       * выбранной секции, без произвольного позиционирования. */}
      {moveDialogTask !== null && (
        <Modal
          open
          onClose={() => setMoveDialogTask(null)}
          title={t('projectDetail', 'moveDialog.title')}
        >
          <ul aria-label={t('projectDetail', 'moveDialog.ariaLabel')}>
            {sectionEntries.map((entry) => (
              <li key={sectionKeyOf(entry.sectionId)}>
                <button type="button" onClick={() => handleMoveDialogSelect(entry.sectionId)}>
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {/* Удаление раздела (задание, п.3) — подтверждение обязательно: раздел
       * молча переносит все свои задачи в «Без раздела» (`deleteSectionCommand`,
       * `01§12`), тот же паттерн `Modal`, что уже применяет `TaskDetail.tsx`
       * для перевода подзадачи в чек-лист (ощутимая по последствиям, не
       * мгновенно обратимая операция — этот пакет работ не строит Undo). */}
      {deleteSectionConfirm !== null && (
        <Modal
          open
          onClose={() => setDeleteSectionConfirm(null)}
          title={t('projectDetail', 'sections.deleteConfirmTitle')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteSectionConfirm(null)}>
                {t('projectDetail', 'sections.deleteConfirmCancel')}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDeleteSection}>
                {t('projectDetail', 'sections.deleteConfirmConfirm')}
              </Button>
            </>
          }
        >
          <p>
            {t('projectDetail', 'sections.deleteConfirmBody', {
              title: deleteSectionConfirm.title,
            })}
          </p>
        </Modal>
      )}
    </div>
  );
}
