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
 *
 * --- E12.3: Системные фильтры (§16) — решение о размещении --------------
 *
 * `01_PRODUCT_BEHAVIOR_R1.md` §16 «System filters R1» (раздел прочитан
 * целиком): "Без даты / P1 Критичные / Не по плану / Просрочен срок /
 * Повторяющиеся. Read-only predefined." Ни одного слова про то, ГДЕ в UI
 * они живут — задание пакета работ E12.3 прямо потребовало исследовать это
 * ПЕРЕД реализацией, а не угадывать. Разбор, что было прочитано и почему
 * выбран именно этот экран:
 *
 * 1. `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md` прочитана целиком, все
 *    M01–M52 и D01–D20 — ни одна строка не про «Фильтры». В отличие от
 *    Search (M34/M35) и Plan (M14/M15), у фильтров нет своего M-номера.
 *    Вывод: это не отдельный полноэкранный маршрут матрицы — заводить
 *    новый `ScreenId` под то, чего матрица не называет, значило бы
 *    придумывать экран, которого нет в контракте (тот же принцип, по
 *    которому выше отклонён клик по метке).
 *
 * 2. `Filter` (`@shagi/ui`, `components/organization/Filter.tsx`) уже
 *    существует и построен design-system эпиком (E03.6) — прочитан целиком.
 *    Его собственный заголовок цитирует ИМЕННО этот раздел ТЗ (§16) как
 *    причину существования: "Read-only предустановленные фильтры". Тонкая
 *    обёртка над `Chip` с фиксированным `tone='neutral'`. Компонент собран
 *    и ждёт использования — это сильный сигнал НАМЕРЕНИЯ, что фильтры
 *    рендерятся как ряд чипов внутри уже существующего экрана, а не как
 *    вёрстка нового.
 *
 * 3. Три кандидата на размещение проверены чтением кода:
 *    - `Today.tsx` — отклонён. У него уже есть `missed_plan`/`missed_deadline`
 *      (`classifyTaskForToday`, `@shagi/core`), которые ПОХОЖИ на два из
 *      пяти фильтров, но три оставшихся ("Без даты"/"P1"/"Повторяющиеся")
 *      никак не связаны с окном Today: критичная задача вовсе без единой
 *      даты (кандидат "Без даты" И "P1" одновременно) никогда не попадёт ни
 *      в одну из шести групп Today (`classifyTaskForToday` вернёт `null` —
 *      см. её заголовок, "на Today задачи без ни одного из
 *      plannedDate/deadlineDate/focusDate не бывает"). Встроить фильтры в
 *      Today означало бы либо молча терять 3 из 5 фильтров, либо городить
 *      второй, несвязанный с шестью группами Today режим поверх экрана,
 *      который уже несёт мультивыбор/bulk/меню строк/четыре модалки —
 *      добавлять пятый независимый режим переключения было бы явной
 *      перегрузкой одного файла двумя расходящимися задачами.
 *    - Новый отдельный `ScreenId`/маршрут — отклонён по п.1 выше (матрица
 *      не называет такой экран) и потому, что фильтры — ТОЛЬКО просмотр
 *      (без действий, задание) величиной в пять маленьких списков, а не
 *      самостоятельный экран со своей навигацией/раскладкой — заводить
 *      отдельный `ScreenId` ради этого означало бы новую точку входа в
 *      `SCREENS`/`ScreenId` (`state/store.ts`), которую ничто в продукте не
 *      просит открывать напрямую.
 *    - `Search.tsx` (этот файл, эпик E12, предыдущий пакет работ E12.1) —
 *      ВЫБРАН. M34 "Search Empty" — уже единственный существующий в дереве
 *      пакетов экран вида "открыл → сразу видишь read-only список задач,
 *      кликабельный в Task Detail, без единого действия над строкой", то
 *      есть ровно тот же жанр UI, что нужен пяти фильтрам (задание: "без
 *      действий... то же решение, что уже принято Search.tsx/Plan.tsx для
 *      декоративного чекбокса TaskRow"). Сейчас M34 показывает только
 *      спокойное приглашение ввести запрос — пустое место, где пользователь
 *      УЖЕ находится в намерении "найти задачу", просто ещё не начал
 *      печатать. Показать там пять чипов быстрых фильтров — естественное
 *      расширение того же намерения ("найти" не только через текст, но и
 *      через готовый предопределённый критерий), не новая точка входа.
 *
 * --- Видимость: только пока запрос пуст --------------------------------
 *
 * Фильтры и их результаты рендерятся ТОЛЬКО при `isEmptyQuery` — как
 * только пользователь начинает печатать, обычный поиск (уровни 1–7,
 * `01§15`) забирает экран целиком, чипы и результат активного фильтра
 * скрываются. Это два независимых способа найти задачу, не один
 * комбинированный (пересечение "фильтр И текстовый запрос" — задание не
 * просит, YAGNI): печать запроса — однозначный сигнал, что пользователь
 * переключился на текстовый поиск. `activeFilter` при этом НЕ обнуляется
 * (только скрывается) — если запрос стереть обратно до пустого, ранее
 * выбранный фильтр возвращается сам, без дополнительного клика; это
 * побочный эффект отсутствия лишнего сброса состояния, не отдельная
 * фича.
 *
 * --- Переключение и снятие фильтра — `Chip`/`Filter` `aria-pressed` -----
 *
 * `activeFilter: SystemFilterId | null`. Клик по чипу переключает: другой
 * id — заменяет `activeFilter` (список подставляется мгновенно, без
 * повторного похода в `@shagi/core`, см. следующий блок); тот же id
 * повторно — снимает выбор (`null`), возвращая спокойное приглашение M34.
 * Такой toggle — стандартное поведение переключаемого `Chip`
 * (`aria-pressed`, см. её заголовок: "селект/тег с возможностью снять
 * выбор"), Filter ничего здесь не переопределяет.
 *
 * --- Источник данных: `selectSystemFilters` (`@shagi/core`), один запрос --
 *
 * Реализация предиката — целиком в `@shagi/core`
 * (`rules/select-system-filters.ts`, прочитан целиком за полным разбором:
 * "Не по плану"/"Просрочен срок" переиспользуют `classifyTaskForToday`
 * буквально, не копируют условие "просрочена" второй раз — задание прямо
 * этого требует). Этот экран только запрашивает у хранилища список
 * активных задач и передаёт его туда — тот же принцип разделения
 * ответственности, что уже применяет сам файл для `rankCandidates`
 * (поиск) и что `Plan.tsx` применяет для `selectPlanAgenda`.
 *
 * `storage.tasks.listByStatusAndPlannedDate('active')` — тот же индекс,
 * что уже использует `Plan.tsx` (см. её заголовок: подтверждено чтением
 * `packages/storage/src/memory/repositories.ts`, что он возвращает ВСЕ
 * живые активные задачи, не только с заданным `plannedDate` — сортировка
 * по полю, не фильтр по нему). Запрошен ВТОРЫМ отдельным вызовом в ТОМ ЖЕ
 * `useEffect`, что уже грузит `loadCandidates` (`Promise.all`, не второй
 * эффект) — тот же приём, что `inboxCount` в `Today.tsx` (см. её
 * заголовок, блок «Бейдж Входящих»): один лишний, но дешёвый локальный
 * запрос вместо второго асинхронного захода в жизненный цикл компонента.
 * Он технически дублирует один из четырёх запросов, которые уже делает
 * `loadCandidates` внутри себя (та же самая `activeTasks`) — цена этого
 * дублирования признана меньше цены трогать сигнатуру уже протестированной
 * `loadCandidates` (которая тестируется отдельно и не должна знать о нуждах
 * фильтров) ради экономии одного локального чтения IndexedDB/SQLite
 * (CLAUDE.md, YAGNI — не порядки величины, на которых это имело бы
 * значение).
 *
 * `now` — `Temporal.Now.plainDateTimeISO()`, вычислено ОДИН раз внутри
 * этого эффекта на монтирование (не хук, не пересчитывается на каждый
 * рендер) — тот же принцип, что `Today.tsx` использует для своего `now`
 * внутри эффекта загрузки: `selectSystemFilters` — чистая функция, ей
 * нужен явный снимок момента (CLAUDE.md «Время»), не системные часы,
 * прочитанные заново при каждом клике по чипу.
 *
 * --- Результат фильтра: `TaskRow`, декоративный чекбокс, клик → Task Detail
 *
 * Тот же приём, что `TaskResultRow` выше и `PlanDayGroupSection` в
 * `Plan.tsx`: `checked={false}`, `disabled`, `state='normal'` — фильтр
 * показывает только активные задачи (`selectSystemFilters` — защита в
 * глубину на `status`, см. её заголовок), состояние "завершена" здесь
 * структурно невозможно, в отличие от секции "Задачи" обычного поиска
 * (та ищет и по завершённым). Действий (Complete/Reschedule) нет — задание
 * пакета работ прямо исключает их из объёма, тот же выбор, что уже
 * закреплён в этом файле для секции "Задачи" и в `Plan.tsx` целиком.
 *
 * Пустой список выбранного фильтра — отдельный `EmptyState`
 * (`filters.empty.*`, не переиспользует `noResults.*` M35: разный контекст,
 * "нет активных задач под условие" — это не то же самое сообщение, что
 * "ничего не нашлось по вашему запросу").
 *
 * --- Вне объёма (задание, дословно) --------------------------------------
 *
 * Custom filters (R1.1) — не строятся, задание прямо исключает волну 1.
 * Любые действия над задачей из результата фильтра, кроме перехода в Task
 * Detail — не строятся (см. блок выше). Персистентность "последний открытый
 * фильтр" между сессиями (перезагрузка страницы/новый заход) — не строится:
 * `activeFilter` — обычный `useState`, обнуляется при размонтировании
 * экрана, как и `query`.
 *
 * --- E12.4: точка входа в «Завершённые» (M36) ------------------------------
 *
 * Кнопка `completed.entry.*` — новая строка, добавленная ПОСЛЕДНИМ пакетом
 * работ эпика E12 (`screens/Completed.tsx`, читай его заголовок за полным
 * разбором, ПОЧЕМУ именно этот экран несёт точку входа: коротко — D17
 * десктопной половины матрицы дословно связывает «Search» и «Completed»
 * одной строкой контракта, тот же жанр решения, что уже принят здесь для
 * системных фильтров E12.3). Видна в ТОМ ЖЕ `isEmptyQuery`-блоке, что
 * фильтры — обе вещи про «просмотр без текстового запроса», не текстовый
 * поиск; переход — обычный `controller.goTo('completed')`.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import {
  isTaskLabelActive,
  selectSystemFilters,
  SYSTEM_FILTER_IDS,
  type SystemFilterGroups,
  type SystemFilterId,
  type Task,
} from '@shagi/core';
import {
  rankCandidates,
  type RankedSearchResult,
  type SearchableLabel,
  type SearchableProject,
  type SearchableTask,
  type SearchCandidate,
} from '@shagi/storage';
import type { StoragePort } from '@shagi/storage';
import { Button, EmptyState, Filter, Icon, Input, Label, ProjectRow, TaskRow } from '@shagi/ui';

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

/** Подпись чипа — см. заголовок файла, блок «E12.3». Каждая ветка вызывает
 * `t` с литеральными строковыми аргументами (не переменной с вычисленным
 * ключом), тот же приём, что `groupLabel` в `Today.tsx` — так
 * `check-i18n-catalog.mjs` (статический разбор регулярным выражением)
 * видит все пять ключей. */
function systemFilterLabel(id: SystemFilterId): string {
  switch (id) {
    case 'noDate':
      return t('search', 'filters.noDate');
    case 'p1':
      return t('search', 'filters.p1');
    case 'missedPlan':
      return t('search', 'filters.missedPlan');
    case 'missedDeadline':
      return t('search', 'filters.missedDeadline');
    case 'recurring':
      return t('search', 'filters.recurring');
  }
}

interface FilterResultRowProps {
  readonly task: Task;
  readonly onOpen: (id: Task['id']) => void;
}

/** Строка результата системного фильтра — см. заголовок файла, блок «E12.3»,
 * раздел «Результат фильтра». `selectSystemFilters` отдаёт только активные
 * задачи (защита в глубину на `status`), поэтому `checked`/`state` здесь не
 * ветвятся на завершённость, в отличие от `TaskResultRow` выше. */
function FilterResultRow({ task, onOpen }: FilterResultRowProps): ReactElement {
  return (
    <TaskRow
      title={task.title}
      checkboxLabel={task.title}
      checked={false}
      disabled
      state="normal"
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
  /** Пять готовых списков системных фильтров (см. заголовок файла, блок
   * «E12.3») — `null` до разрешения эффекта ниже, та же семантика "ещё не
   * знаем", что `candidates === null`. */
  const [systemFilterGroups, setSystemFilterGroups] = useState<SystemFilterGroups | null>(null);
  const [activeFilter, setActiveFilter] = useState<SystemFilterId | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = Temporal.Now.plainDateTimeISO();
    // Оба запроса — в одном эффекте (см. заголовок файла, блок «Источник
    // данных»), тот же приём, что `Today.tsx` делает для `inboxCount`.
    void Promise.all([
      loadCandidates(storage),
      storage.tasks.listByStatusAndPlannedDate('active'),
    ]).then(([nextCandidates, activeTasks]) => {
      if (cancelled) return;
      setCandidates(nextCandidates);
      setSystemFilterGroups(selectSystemFilters(activeTasks, now));
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

      {/* Системные фильтры (§16) — только пока запрос пуст, см. заголовок
       * файла, блок «E12.3». */}
      {isEmptyQuery && (
        <div role="group" aria-label={t('search', 'filters.groupLabel')}>
          {SYSTEM_FILTER_IDS.map((id) => (
            <Filter
              key={id}
              selected={activeFilter === id}
              onClick={() => setActiveFilter((current) => (current === id ? null : id))}
            >
              {systemFilterLabel(id)}
            </Filter>
          ))}
        </div>
      )}

      {/* Точка входа в M36 «Завершённые» — см. заголовок файла, блок
       * «E12.4». Тот же `isEmptyQuery`-блок, что фильтры выше. */}
      {isEmptyQuery && (
        <Button variant="secondary" onClick={() => controller.goTo('completed')}>
          {t('search', 'completed.entry.button')}
        </Button>
      )}

      {isEmptyQuery && activeFilter === null && (
        <EmptyState
          icon={<Icon name="search" size={32} />}
          title={t('search', 'empty.title')}
          description={t('search', 'empty.description')}
        />
      )}

      {isEmptyQuery && activeFilter !== null && systemFilterGroups !== null && (
        <section aria-label={systemFilterLabel(activeFilter)}>
          {systemFilterGroups[activeFilter].length === 0 ? (
            <EmptyState
              icon={<Icon name="search" size={32} />}
              title={t('search', 'filters.empty.title')}
              description={t('search', 'filters.empty.description')}
            />
          ) : (
            systemFilterGroups[activeFilter].map((task) => (
              <FilterResultRow key={task.id} task={task} onOpen={controller.openTask} />
            ))
          )}
        </section>
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
