/**
 * `TaskDetail` — экран одной задачи, M24 Simple / M25 Full
 * (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`), эпик E10, пакет работ
 * E10.2. Источник поведения — `01_PRODUCT_BEHAVIOR_R1.md` §17 «Task
 * Detail» (короткий раздел, дословно приведён ниже там, где решение прямо
 * на него опирается) плюс §10/§16 (конверсия чек-лист/subtask, лейблы —
 * уже реализованы командным слоем пакета работ E10.1, здесь только UI).
 *
 * --- Ключевое сознательное решение по объёму (см. задание) ----------------
 *
 * §17 перечисляет полную иерархию M25 Full: 1) title/context, 2) description,
 * 3) Planning, 4) Organization, 5) Subtasks, 6) Checklist, 7) Attachments/
 * Links, 8) future activity. Этот пакет работ строит 1, 2, 4, 5, 6 —
 * реально, функционально, с автосохранением через уже готовые команды
 * (`@shagi/core/commands`, пакеты E01/E10.1). 3 (Planning) и 7 (Attachments/
 * Links) — СОЗНАТЕЛЬНО не строятся полноценно:
 *
 * - **Attachments/Links** — в дереве пакетов нет вообще никакого командного
 *   слоя ни для `task_link`, ни для attachments (только read-only
 *   storage-порты, E02) — нечем наполнить интерфейс, это отдельный будущий
 *   эпик. Раздел не рендерится вовсе — то же решение, что
 *   `ProjectHeader.menuSections={[]}` в `ProjectDetail.tsx`: честно пусто,
 *   не выдуманные разделы.
 * - **Planning** (available_from/planned date+time/duration/deadline/focus)
 *   — командный слой (`updateTaskCommand`) полностью готов, но полноценный
 *   UI редактирования (M27 Date Picker shortcuts+calendar, M28 Advanced
 *   planning: time/duration/deadline/available + blocking/warning conflict
 *   states, M31 Reminder) — отдельный, ещё не начатый пакет работ эпика E08:
 *   работа с Temporal — по CLAUDE.md зона повышенной аккуратности («после
 *   смены пояса задача на 09:00 остаётся на 09:00 по местному» — не
 *   довесок к экрану, а отдельное сфокусированное внимание). В ЭТОМ пакете
 *   работ Planning — ТОЛЬКО НА ЧТЕНИЕ: уже заданные `plannedDate`/
 *   `deadlineDate`/`focusDate` показаны текстом (без интерактивного
 *   редактирования), рядом — честная пометка «редактирование дат появится
 *   в следующем обновлении» (`planning.comingSoon`, реальный i18n-ключ, не
 *   выдуманная функциональность).
 *
 * M24 Simple перечисляет три частых действия: «Добавить дату» / «Приоритет»
 * / «Добавить заметку» (`quickActions.*` ниже) — все три настоящие кнопки:
 * «Приоритет» открывает picker приоритета (тот же `Modal`, что и «Изменить
 * приоритет» в разделе Organization — одна реализация, два входа), «Добавить
 * заметку» фокусирует поле описания (`descriptionRef`), «Добавить дату» —
 * честное сообщение «скоро» через `notice` (тот же приём «кликабельно, но
 * честно», что уже применён для SignIn email/Yandex, `SignIn.tsx`
 * `showUnavailable`, и AppShell «Быстрое добавление», `bottomNav.
 * quickAddUnavailable`).
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
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { formatDate, t } from '@shagi/i18n';
import {
  attachLabelToTaskCommand,
  completeTaskCommand,
  convertChecklistItemToSubtaskCommand,
  convertSubtaskToChecklistItemCommand,
  createChecklistItemCommand,
  createLabelCommand,
  createTaskCommand,
  deleteChecklistItemCommand,
  deleteTaskCommand,
  detachLabelFromTaskCommand,
  generateDeviceId,
  generateUuidV7,
  isTaskLabelActive,
  makePriority,
  updateChecklistItemCommand,
  updateTaskCommand,
  type ChecklistItem,
  type Label as LabelEntity,
  type NewRank,
  type NewTaskRank,
  type Priority,
  type Project,
  type Section,
  type Task,
  type Uuid,
} from '@shagi/core';
import {
  Button,
  Checkbox,
  ChecklistRow,
  IconButton,
  Input,
  Label,
  Modal,
  Priority as PriorityBadge,
  SubtaskRow,
  Textarea,
  Toast,
  type PriorityLevel,
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

export function TaskDetail(): ReactElement | null {
  const storage = useStorage();
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

  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [convertSubtaskConfirm, setConvertSubtaskConfirm] = useState<Task | null>(null);

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
    ] = await Promise.all([
      nextTask.projectId === null
        ? Promise.resolve(null)
        : storage.projects.findById(nextTask.projectId),
      storage.tasks.listDirectSubtasks(nextTask.id, 'active'),
      storage.checklistItems.listByTask(nextTask.id),
      storage.labels.listAll(),
      storage.taskLabels.listByTask(nextTask.id),
      storage.projects.listActive(),
    ]);
    setProject(nextProject);
    setSubtasks(nextSubtasks);
    setChecklistItems(nextChecklistItems);
    setAllLabels(nextAllLabels);
    setActiveLabelIds(
      new Set(nextTaskLabels.filter(isTaskLabelActive).map((link) => link.labelId)),
    );
    setActiveProjects(nextActiveProjects);

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- намеренно только по task?.id, см. комментарий выше
  }, [task?.id]);

  function commandDeps(): { storage: typeof storage; now: Temporal.Instant; deviceId: Uuid } {
    return { storage, now: Temporal.Now.instant(), deviceId: getLocalIdentity().deviceId };
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

  function handleTitleBlur(): void {
    const trimmed = titleDraft;
    if (task === null || trimmed === task.title) return;
    void runAndRefresh(
      updateTaskCommand({ id: task.id, patch: { title: trimmed } }, commandDeps()),
      refreshOk,
      showError,
    );
  }

  function handleDescriptionBlur(): void {
    if (task === null || descriptionDraft === task.description) return;
    void runAndRefresh(
      updateTaskCommand({ id: task.id, patch: { description: descriptionDraft } }, commandDeps()),
      refreshOk,
      showError,
    );
  }

  function handleComplete(): void {
    if (task === null || task.status === 'completed') return;
    void runAndRefresh(completeTaskCommand({ id: task.id }, commandDeps()), refreshOk, showError);
  }

  const breadcrumbText =
    project === null
      ? t('taskDetail', 'breadcrumb.inbox')
      : section === null
        ? project.title
        : `${project.title} › ${section.title}`;

  // --- Planning (только чтение) — см. заголовок файла -----------------------

  function handleAddDateUnavailable(): void {
    setNotice({ message: t('taskDetail', 'quickActions.addDateUnavailable'), variant: 'default' });
  }

  function handleFocusDescription(): void {
    descriptionRef.current?.focus();
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
    void runAndRefresh(
      completeTaskCommand({ id: subtask.id }, commandDeps()),
      refreshOk,
      showError,
    );
  }

  function handleDeleteSubtask(subtask: Task): void {
    void runAndRefresh(deleteTaskCommand({ id: subtask.id }, commandDeps()), refreshOk, showError);
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
    <div>
      {notice !== null && (
        <Toast
          variant={notice.variant === 'error' ? 'error' : 'default'}
          message={notice.message}
          onDismiss={() => setNotice(null)}
          dismissLabel={t('taskDetail', 'errors.dismiss')}
        />
      )}

      {/* --- 1. Заголовок/контекст --------------------------------------- */}
      <div>
        <Checkbox
          aria-label={t('taskDetail', 'completeCheckbox.label', { title: task.title })}
          checked={task.status === 'completed'}
          disabled={task.status === 'completed'}
          onChange={(event) => {
            if (event.target.checked) handleComplete();
          }}
        />
        <Input
          aria-label={t('taskDetail', 'title.label')}
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={handleTitleBlur}
        />
        <Button variant="ghost" onClick={() => controller.closeTask()}>
          {t('taskDetail', 'back.label')}
        </Button>
      </div>
      <p aria-label={t('taskDetail', 'breadcrumb.ariaLabel')}>{breadcrumbText}</p>

      {/* M24 Simple: три частых действия — см. заголовок файла */}
      <div>
        <Button variant="secondary" onClick={handleAddDateUnavailable}>
          {t('taskDetail', 'quickActions.addDate')}
        </Button>
        <Button variant="secondary" onClick={() => setPriorityPickerOpen(true)}>
          {t('taskDetail', 'quickActions.priority')}
        </Button>
        <Button variant="secondary" onClick={handleFocusDescription}>
          {t('taskDetail', 'quickActions.addNote')}
        </Button>
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

      {/* --- 3. Planning (только чтение) — см. заголовок файла ------------- */}
      <section>
        <h2>{t('taskDetail', 'planning.sectionTitle')}</h2>
        {task.plannedDate === null && task.deadlineDate === null ? (
          <p>{t('taskDetail', 'planning.empty')}</p>
        ) : (
          <>
            {task.plannedDate !== null && (
              <p>
                {t('taskDetail', 'planning.plannedLabel', { date: formatDate(task.plannedDate) })}
              </p>
            )}
            {task.deadlineDate !== null && (
              <p>
                {t('taskDetail', 'planning.deadlineLabel', {
                  date: formatDate(task.deadlineDate),
                })}
              </p>
            )}
            {task.focusDate !== null && <p>{t('taskDetail', 'planning.focusLabel')}</p>}
          </>
        )}
        <p>{t('taskDetail', 'planning.comingSoon')}</p>
      </section>

      {/* --- 4. Organization ------------------------------------------------ */}
      <section>
        <h2>{t('taskDetail', 'organization.sectionTitle')}</h2>

        <div>
          <span>{t('taskDetail', 'organization.priorityLabel')}</span>
          <PriorityBadge level={priorityLevelOf(task.priority)}>
            {priorityLabel(task.priority)}
          </PriorityBadge>
          <Button variant="secondary" onClick={() => setPriorityPickerOpen(true)}>
            {t('taskDetail', 'organization.priorityChangeLabel')}
          </Button>
        </div>

        <div>
          <span>{t('taskDetail', 'organization.projectLabel')}</span>
          <span>{project?.title ?? t('taskDetail', 'organization.projectNone')}</span>
          <Button variant="secondary" onClick={() => setProjectPickerOpen(true)}>
            {t('taskDetail', 'organization.projectChangeLabel')}
          </Button>
        </div>

        {task.projectId !== null && (
          <div>
            <span>{section?.title ?? t('taskDetail', 'organization.sectionNone')}</span>
            <Button variant="secondary" onClick={() => setSectionPickerOpen(true)}>
              {t('taskDetail', 'organization.sectionChangeLabel')}
            </Button>
          </div>
        )}

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
    </div>
  );
}
