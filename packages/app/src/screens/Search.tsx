/**
 * `Search` — M34 Search Empty / M35 Search Results
 * (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`), эпик E12 «План, поиск,
 * фильтры, завершённые», первый пакет работ этого эпика (E12.1). Источник
 * поведения — `01_PRODUCT_BEHAVIOR_R1.md` §15 «Search».
 *
 * Движок ранжирования (normalize/match/rank, все 7 уровней §15 буквально)
 * ПОЛНОСТЬЮ построен и оттестирован golden-корпусом эпиком E02.3
 * (`packages/storage/src/search/`, барель `@shagi/storage`) — этот экран
 * только собирает `readonly SearchCandidate[]` из уже загруженного
 * хранилища и вызывает готовый `rankCandidates`, не переписывая ни одного
 * правила ранжирования здесь.
 *
 * --- Кандидаты: загрузка один раз, ранжирование на каждый ввод -----------
 *
 * Задание пакета работ прямо предлагает выбор между пересчётом кандидатов
 * из хранилища на каждое изменение текста запроса и загрузкой один раз с
 * локальным ранжированием уже загруженного списка. Выбран второй вариант:
 * `01§15` не описывает debounce или потоковую инвалидацию, а
 * `rankCandidates` — чистая функция над уже полученным массивом (см. её
 * комментарий в `rank.ts`), которая делает всю сортировку мгновенно в
 * памяти; перечитывать хранилище на каждое нажатие клавиши означало бы N
 * избыточных обращений к IndexedDB/SQLite ради работы, которая не требует
 * повторного чтения. Единственная цена — кандидаты устаревают, если данные
 * изменились, пока экран открыт (задача создана в другом месте, метка
 * переименована) — приемлемо для локального однопользовательского масштаба
 * этого пакета работ (CLAUDE.md, YAGNI): ни `Today.tsx`, ни `ProjectDetail.
 * tsx` тоже не подписываются на фоновые изменения хранилища, только
 * перезапрашивают список после СВОИХ собственных команд — у Search в этом
 * пакете работ команд нет вовсе (экран только читает и переходит).
 *
 * --- Денормализация project/label для задачи-кандидата --------------------
 *
 * Тот же приём, что уже применяет `TaskDetail.tsx` (см. её заголовок, блок
 * про активные метки задачи): `storage.taskLabels.listByTask(id)`,
 * отфильтрованные `isTaskLabelActive` (`@shagi/core` — OR-set по HLC, не
 * факт существования строки), затем найдены в уже загруженном списке меток
 * по `labelId`. `projectTitle` — прямой поиск в уже загруженном списке
 * активных проектов по `task.projectId` (обычный `Map.get`, без
 * дополнительного запроса на задачу).
 *
 * --- Только активные проекты — архивные вне охвата этого пакета работ -----
 *
 * `01§12` («Archived project... remain Search-visible in Archived context»)
 * подразумевает, что архивные проекты ДОЛЖНЫ участвовать в поиске — но
 * `ProjectRepository` (`@shagi/storage`, `ports/project-repository.ts`) не
 * даёт метода прочитать их: есть только `listActive()` (живые, не архивные)
 * и `countActiveExcluding` (счётчик для валидатора лимитов), проверено
 * чтением файла целиком. Завести такой метод — территория `packages/
 * storage`, вне границ этого пакета работ (CLAUDE.md «Границы пакетов»):
 * экран не может закрыть пробел хранилища правкой своего файла. Решение
 * этого пакета работ — ограничиться активными проектами; архивные проекты в
 * поиске остаются открытым следующим шагом (либо будущий пакет работ этого
 * же эпика, либо пакет работ `packages/storage`, который заведёт метод
 * чтения архивных проектов).
 *
 * --- Разметка результатов по видам (задание — "реши сам") ------------------
 *
 * Три секции с заголовком вида (Задачи/Проекты/Метки), в ФИКСИРОВАННОМ
 * порядке экрана (задачи → проекты → метки) — не порядок появления в едином
 * массиве `rankCandidates` (тот сортирует по уровню совпадения ПОВЕРХ видов
 * сразу, `01§15` не разделяет виды на разные "полосы" результата). Внутри
 * каждой секции порядок — то, что вернул `rankCandidates` (стабильная
 * фильтрация уже отсортированного массива по `candidate.kind`) — буквальный
 * порядок уровней 1–7 сохраняется без пересортировки. Пустая секция не
 * рендерится вовсе.
 *
 * Задачи — `TaskRow` (`@shagi/ui`) с чекбоксом `disabled` (только
 * визуальная индикация активна/завершена через `state`/`checked` — уровень
 * 7 `01§15` буквально про ПОРЯДОК active/completed при равенстве, не про
 * действие «завершить» из результатов поиска, которого задание не просит),
 * клик по строке → `controller.openTask(id)` (готовый переход E10.2), тот
 * же приём различения интерактивного клика внутри строки
 * (`isInteractiveRowClick`), что уже дублирован в `Today.tsx`/
 * `ProjectDetail.tsx` (тот же узкий прецедент, не общий модуль). Проекты —
 * `ProjectRow` (тот же компонент, что `Projects.tsx`, без цветового маркера
 * — проекция кандидата поиска не несёт `colorToken`), клик →
 * `controller.openProject(id)` (E09.3). Метки — статичный `Label` (`@shagi/
 * ui`, без `onClick`/`selected` — рендерится как `<span>`, см. её
 * заголовок): управления метками нигде в дереве пакетов ещё нет, клик по
 * метке — прямо вне объёма этого пакета работ (задание запрещает выдумывать
 * несуществующий экран).
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { isTaskLabelActive } from '@shagi/core';
import {
  rankCandidates,
  type RankedSearchResult,
  type SearchableLabel,
  type SearchableProject,
  type SearchableTask,
  type SearchCandidate,
} from '@shagi/storage';
import type { StoragePort } from '@shagi/storage';
import { EmptyState, Icon, Input, Label, ProjectRow, TaskRow } from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';

/** См. заголовок файла, блок «Разметка результатов по видам» — та же
 * функция, что `Today.tsx`/`ProjectDetail.tsx` (узкое дублирование, тот же
 * прецедент, не общий модуль вне разрешённой территории этого пакета
 * работ). */
function isInteractiveRowClick(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, button') !== null;
}

function isTaskResult(result: RankedSearchResult): result is RankedSearchResult<SearchableTask> {
  return result.candidate.kind === 'task';
}

function isProjectResult(
  result: RankedSearchResult,
): result is RankedSearchResult<SearchableProject> {
  return result.candidate.kind === 'project';
}

function isLabelResult(result: RankedSearchResult): result is RankedSearchResult<SearchableLabel> {
  return result.candidate.kind === 'label';
}

/**
 * Собирает `readonly SearchCandidate[]` из хранилища — см. заголовок файла,
 * блоки «Кандидаты»/«Денормализация»/«Только активные проекты». Один вызов
 * при монтировании экрана (не на каждое изменение запроса).
 */
async function loadCandidates(storage: StoragePort): Promise<readonly SearchCandidate[]> {
  const [activeTasks, completedTasks, projects, labels] = await Promise.all([
    storage.tasks.listByStatusAndPlannedDate('active'),
    storage.tasks.listByStatusAndPlannedDate('completed'),
    storage.projects.listActive(),
    storage.labels.listAll(),
  ]);
  const tasks = [...activeTasks, ...completedTasks];

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const labelById = new Map(labels.map((label) => [label.id, label]));

  // Одно чтение `task_labels` на задачу — тот же приём, что `TaskDetail.tsx`
  // делает для одной задачи; здесь их несколько, но каждая задача (даже в
  // сумме active+completed) — локальный однопользовательский масштаб этого
  // продукта (CLAUDE.md, YAGNI: без FTS5/индекса вне охвата этого пакета
  // работ), не десятки тысяч строк.
  const taskLabelLinks = await Promise.all(
    tasks.map((task) => storage.taskLabels.listByTask(task.id)),
  );

  const taskCandidates: readonly SearchableTask[] = tasks.map((task, index) => {
    const activeLabelIds = (taskLabelLinks[index] ?? [])
      .filter(isTaskLabelActive)
      .map((link) => link.labelId);
    const labelDisplayNames = activeLabelIds
      .map((labelId) => labelById.get(labelId)?.displayName)
      .filter((name): name is string => name !== undefined);
    return {
      kind: 'task',
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      projectTitle:
        task.projectId === null ? null : (projectById.get(task.projectId)?.title ?? null),
      labelDisplayNames,
    };
  });

  const projectCandidates: readonly SearchableProject[] = projects.map((project) => ({
    kind: 'project',
    id: project.id,
    title: project.title,
    description: project.description,
  }));

  const labelCandidates: readonly SearchableLabel[] = labels.map((label) => ({
    kind: 'label',
    id: label.id,
    title: label.displayName,
  }));

  return [...taskCandidates, ...projectCandidates, ...labelCandidates];
}

interface TaskResultRowProps {
  readonly task: SearchableTask;
  readonly onOpen: (id: SearchableTask['id']) => void;
}

function TaskResultRow({ task, onOpen }: TaskResultRowProps): ReactElement {
  const completed = task.status === 'completed';
  return (
    <TaskRow
      title={task.title}
      checkboxLabel={task.title}
      checked={completed}
      disabled
      state={completed ? 'completed' : 'normal'}
      {...(completed ? { statusLabel: t('search', 'status.completed') } : {})}
      onClick={(event) => {
        if (isInteractiveRowClick(event.target)) return;
        onOpen(task.id);
      }}
    />
  );
}

export function Search(): ReactElement {
  const storage = useStorage();
  const controller = useAppController();
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<readonly SearchCandidate[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCandidates(storage).then((next) => {
      if (!cancelled) setCandidates(next);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const trimmedQuery = query.trim();

  const results = useMemo(
    () => (candidates === null ? [] : rankCandidates(trimmedQuery, candidates)),
    [candidates, trimmedQuery],
  );

  const taskResults = useMemo(() => results.filter(isTaskResult), [results]);
  const projectResults = useMemo(() => results.filter(isProjectResult), [results]);
  const labelResults = useMemo(() => results.filter(isLabelResult), [results]);

  const isEmptyQuery = trimmedQuery.length === 0;
  // "Ничего не найдено" — отдельное состояние от M34 (задание): непустой
  // запрос, кандидаты уже загружены (не путать «ещё грузится» с «точно
  // ничего нет»), и ранжирование не дало ни одного совпадения ни на одном
  // уровне/виде.
  const hasNoResults = !isEmptyQuery && candidates !== null && results.length === 0;

  return (
    <div>
      <h1>{t('search', 'pageTitle')}</h1>
      <Input
        aria-label={t('search', 'input.label')}
        placeholder={t('search', 'input.placeholder')}
        leading={<Icon name="search" size={16} />}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {isEmptyQuery && (
        <EmptyState
          icon={<Icon name="search" size={32} />}
          title={t('search', 'empty.title')}
          description={t('search', 'empty.description')}
        />
      )}

      {hasNoResults && (
        <EmptyState
          icon={<Icon name="search" size={32} />}
          title={t('search', 'noResults.title')}
          description={t('search', 'noResults.description')}
        />
      )}

      {!isEmptyQuery && taskResults.length > 0 && (
        <section aria-label={t('search', 'sections.tasks')}>
          <h2>{t('search', 'sections.tasks')}</h2>
          {taskResults.map((result) => (
            <TaskResultRow
              key={result.candidate.id}
              task={result.candidate}
              onOpen={controller.openTask}
            />
          ))}
        </section>
      )}

      {!isEmptyQuery && projectResults.length > 0 && (
        <section aria-label={t('search', 'sections.projects')}>
          <h2>{t('search', 'sections.projects')}</h2>
          <ul>
            {projectResults.map((result) => (
              <li key={result.candidate.id}>
                <ProjectRow
                  name={result.candidate.title}
                  onClick={() => controller.openProject(result.candidate.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isEmptyQuery && labelResults.length > 0 && (
        <section aria-label={t('search', 'sections.labels')}>
          <h2>{t('search', 'sections.labels')}</h2>
          <ul>
            {labelResults.map((result) => (
              <li key={result.candidate.id}>
                <Label>{result.candidate.title}</Label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
