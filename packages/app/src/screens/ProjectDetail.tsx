/**
 * `ProjectDetail` — экран одного проекта, M17 List / M18 Board (плюс M19
 * Project Empty) из `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`, эпик E09,
 * пакет работ E09.3. Источник поведения — `01_PRODUCT_BEHAVIOR_R1.md`
 * §12 «Sections»/«Delete section» и §13 «List / Board».
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
 * - Создание/переименование/удаление/reorder САМИХ секций через UI —
 *   командный слой готов (E09.1), интерфейса для него здесь нет.
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
  completeTaskCommand,
  createTaskCommand,
  deleteTaskCommand,
  generateDeviceId,
  generateUuidV7,
  resolveRank,
  updateTaskCommand,
  type NewRank,
  type Project,
  type Section,
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

/** Вставка в конец списка (drop на секцию/колонку целиком, «Переместить в
 * раздел») — `excludeId` убирает саму перемещаемую задачу из списка соседей,
 * если она уже была в этой же секции. */
function appendRank(list: readonly Task[], excludeId: Uuid): NewRank {
  const last = list.filter((task) => task.id !== excludeId).at(-1);
  return last === undefined
    ? { placement: 'empty-list' }
    : { placement: 'end', lastRank: last.rank };
}

/** Вставка непосредственно перед `targetTask` в её же списке (drop на
 * конкретную соседнюю карточку/строку). */
function insertBeforeRank(list: readonly Task[], targetId: Uuid, excludeId: Uuid): NewRank {
  const filtered = list.filter((task) => task.id !== excludeId);
  const index = filtered.findIndex((task) => task.id === targetId);
  const target = filtered[index];
  // Оборонительная ветка: цель не найдена в своём же списке (не должно
  // случаться — вызывающий код всегда передаёт реальную соседнюю задачу) —
  // не выдумываем `NewRank` с потенциально `undefined` полем, откатываемся
  // на ту же стратегию «в конец», что и остальной код этого файла.
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

  const sectionEntries = useMemo(
    () =>
      sections === null ? [] : buildSectionEntries(sections, noSectionTasks, tasksBySectionId),
    [sections, noSectionTasks, tasksBySectionId],
  );

  const isEmpty = sectionEntries.every((entry) => entry.tasks.length === 0);

  function handleComplete(task: Task): void {
    setOpenMenuTaskId(null);
    void runCommand(completeTaskCommand({ id: task.id }, commandDeps()));
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
    <div>
      <IconButton
        icon="back"
        label={t('projectDetail', 'back.label')}
        onClick={() => controller.goTo('projects')}
      />
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

      {view === 'list' ? (
        <div>
          {sectionEntries.map((entry) => (
            <div
              key={sectionKeyOf(entry.sectionId)}
              data-testid={`section-${sectionKeyOf(entry.sectionId)}`}
              onDragOver={preventDefault}
              onDrop={() => handleDropOnSectionEnd(entry.sectionId)}
            >
              <SectionHeader title={entry.title} count={taskCountLabel(entry.tasks.length)} />
              {entry.tasks.map((task) => (
                <TaskListRow
                  key={task.id}
                  task={task}
                  sectionEntry={entry}
                  dragging={draggedTask?.task.id === task.id}
                  menuOpen={openMenuTaskId === task.id}
                  onToggleMenu={() => setOpenMenuTaskId((id) => (id === task.id ? null : task.id))}
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
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex' }}>
          {sectionEntries.map((entry) => (
            <BoardColumn
              key={sectionKeyOf(entry.sectionId)}
              title={entry.title}
              count={taskCountLabel(entry.tasks.length)}
              onDragOver={preventDefault}
              onDrop={() => handleDropOnSectionEnd(entry.sectionId)}
            >
              {entry.tasks.map((task) => (
                <TaskBoardCard
                  key={task.id}
                  task={task}
                  sectionEntry={entry}
                  dragging={draggedTask?.task.id === task.id}
                  menuOpen={openMenuTaskId === task.id}
                  onToggleMenu={() => setOpenMenuTaskId((id) => (id === task.id ? null : task.id))}
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
          ))}
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
    </div>
  );
}
