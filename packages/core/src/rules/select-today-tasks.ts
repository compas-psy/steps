import { Temporal } from '@js-temporal/polyfill';

import type { Task } from '../entities/task.js';
import type { Uuid } from '../values.js';
import { classifyTaskForToday, type TodayGroup } from './today-classification.js';

/**
 * Отбор + группировка кандидатов экрана Today (конспект §5, `01§6`).
 *
 * Порт хранения объявлен здесь же, **своим** узким интерфейсом, а не
 * импортом `TaskRepository`/`StorageQueryPort` из `@shagi/storage` — та же
 * причина и тот же механизм, что у `CommandStoragePort`
 * (`packages/core/src/commands/storage-port.ts`, разобрано целиком в
 * ADR-0003): `packages/storage` уже зависит от `@shagi/core`, поэтому
 * `core` не может импортировать оттуда типы без цикла `storage → core →
 * storage`. `TodayTaskReader` — подмножество трёх методов реального
 * `TaskRepository` (`listByStatusAndPlannedDate`, `listByStatusAndDeadlineDate`,
 * `listByFocusDate`), объявленных method-синтаксисом — настоящий
 * `StoragePort`/`TaskRepository` (`useStorage()` в `@shagi/app`) проходит
 * сюда без единого адаптера благодаря бивариантной проверке параметров
 * метод-сигнатур (см. ADR-0003 за полным разбором механизма).
 */
export interface TodayTaskReader {
  /** Индекс `tasks(status, planned_date)` — источник "Не по плану"/"По
   * времени"/"Сегодня"/"Когда будет время" (все четыре опираются на
   * `plannedDate`, см. `classifyTaskForToday`). */
  listByStatusAndPlannedDate(status: Task['status']): Promise<readonly Task[]>;
  /** Индекс `tasks(status, deadline_date)` — источник "Просрочен срок",
   * в том числе для задач вовсе без `plannedDate`. */
  listByStatusAndDeadlineDate(status: Task['status']): Promise<readonly Task[]>;
  /** Индекс `tasks(focus_date, status)` — источник "Главное". Нужен
   * отдельно от индекса `planned_date`, потому что типы домена (`@shagi/core`
   * `entities/task.ts`, `TaskPlanning`) допускают `focusDate`, отличный от
   * `plannedDate` (само равенство — забота будущего валидатора, не типов):
   * задача с `plannedDate` на другой день, но `focusDate=сегодня` не будет
   * найдена через индекс `planned_date`. */
  listByFocusDate(focusDate: Temporal.PlainDate, status: Task['status']): Promise<readonly Task[]>;
}

/** Точка входа, которую просит `selectTodayTasks` от хранилища — структурный
 * эквивалент среза `StorageQueryPort` (`@shagi/storage`), см. заголовок файла. */
export interface TodayStorageQueryPort {
  readonly tasks: TodayTaskReader;
}

/** Шесть групп экрана Today, каждая уже отсортирована по правилу своей
 * группы (`01§6`) — то, что напрямую рендерит `packages/app`. */
export type TodayGroups = Record<TodayGroup, readonly Task[]>;

function compareByRank(a: Task, b: Task): number {
  if (a.rank < b.rank) return -1;
  if (a.rank > b.rank) return 1;
  return 0;
}

/**
 * "По времени": время по возрастанию, затем `rank` (`01§6`, дословно —
 * единственная группа с явно прописанным двухуровневым правилом). Оба
 * `plannedTime` здесь не `null` по построению — таков контракт
 * `classifyTaskForToday` для группы `'timed'`; `null` тут означало бы, что
 * классификатор поместил в эту группу что-то не по своим же правилам,
 * поэтому в таком (недостижимом) случае обе задачи трактуются как равные
 * по времени и сравниваются только по `rank`, без падения по `null`.
 */
function compareTimed(a: Task, b: Task): number {
  if (a.plannedTime !== null && b.plannedTime !== null) {
    const byTime = Temporal.PlainTime.compare(a.plannedTime, b.plannedTime);
    if (byTime !== 0) return byTime;
  }
  return compareByRank(a, b);
}

/**
 * Правило сортировки внутри группы, примененное к каждой из шести. Три из
 * шести (`missed_deadline`/`missed_plan`/`focus`) `01§6` НЕ прописывает
 * явно — решение этого пакета работ, не вычитанное требование: сортировать
 * их так же, как остальные ручные списки задач (`rank`), а не заново по
 * дате/сроку. Обоснование: и "Просрочен срок", и "Не по плану" уже
 * сгруппированы по смыслу (одна причина показа на всех), у пользователя
 * внутри группы нет второго очевидного авто-критерия сортировки лучше
 * ручного порядка (сравните с `today`/`later`, для которых `01§6` тоже
 * не прописывает критерий явно, но `rank` там — единственный существующий
 * порядок задачи в принципе); для "Главное" `01§6` дополнительно
 * фиксирует "max 3", ручной `rank` — естественный способ отличить, какие
 * три показаны, если пользователь переставляет Focus-задачи вручную (drag,
 * будущий пакет работ). Если владелец продукта позже уточнит другое
 * правило для этих трёх групп — это одна строка ниже, не пересмотр формы
 * функции.
 */
function sortGroup(group: TodayGroup, tasks: Task[]): Task[] {
  const sorted = [...tasks];
  sorted.sort(group === 'timed' ? compareTimed : compareByRank);
  return sorted;
}

/**
 * Собирает кандидатов Today из трёх индексных запросов, классифицирует
 * каждого через `classifyTaskForToday` (`@shagi/core`, не переопределяется
 * здесь) и группирует по `TodayGroup` в порядке прецеденса `01§6`.
 *
 * Дедупликация — `Map` по `id`: одна и та же задача может легитимно
 * попасть сразу в несколько из трёх списков-кандидатов (например
 * `plannedDate=сегодня` И `deadlineDate` в прошлом одновременно) — `Map`
 * схлопывает такие дубли до классификации, поэтому `classifyTaskForToday`
 * вызывается на задаче ровно один раз и кладёт её ровно в одну (высшую по
 * прецедансу, за счёт собственного порядка `return` внутри классификатора)
 * группу — "no duplicates" (`01§6`) физически невозможно нарушить на этом
 * шаге, а не проверяется постфактум.
 *
 * `status: 'active'` передаётся явно в каждый из трёх запросов (защита в
 * глубину: если бы хоть один индекс вернул `completed`-задачу вопреки
 * своему контракту, `classifyTaskForToday` всё равно отбросит её первым же
 * условием — второй, независимый рубеж на тот случай, что кто-то из трёх
 * реальных индексов однажды перестанет фильтровать корректно).
 */
export async function selectTodayTasks(
  storage: TodayStorageQueryPort,
  now: Temporal.PlainDateTime,
): Promise<TodayGroups> {
  const today = now.toPlainDate();

  const [byPlannedDate, byDeadlineDate, byFocusDate] = await Promise.all([
    storage.tasks.listByStatusAndPlannedDate('active'),
    storage.tasks.listByStatusAndDeadlineDate('active'),
    storage.tasks.listByFocusDate(today, 'active'),
  ]);

  const candidatesById = new Map<Uuid, Task>();
  for (const task of byPlannedDate) candidatesById.set(task.id, task);
  for (const task of byDeadlineDate) candidatesById.set(task.id, task);
  for (const task of byFocusDate) candidatesById.set(task.id, task);

  const buckets: Record<TodayGroup, Task[]> = {
    missed_deadline: [],
    missed_plan: [],
    focus: [],
    timed: [],
    today: [],
    later: [],
  };

  for (const task of candidatesById.values()) {
    const group = classifyTaskForToday(task, now);
    if (group === null) continue;
    buckets[group].push(task);
  }

  return {
    missed_deadline: sortGroup('missed_deadline', buckets.missed_deadline),
    missed_plan: sortGroup('missed_plan', buckets.missed_plan),
    focus: sortGroup('focus', buckets.focus),
    timed: sortGroup('timed', buckets.timed),
    today: sortGroup('today', buckets.today),
    later: sortGroup('later', buckets.later),
  };
}
