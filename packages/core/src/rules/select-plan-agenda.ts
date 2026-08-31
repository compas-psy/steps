import { Temporal } from '@js-temporal/polyfill';

import type { Task } from '../entities/task.js';

/**
 * Отбор + группировка задач экрана Plan (M14 Plan Agenda / M15 Plan
 * selected, `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`) — конспект
 * `01_PRODUCT_BEHAVIOR_R1.md` §14 «Plan R1», прочитан целиком (короткий
 * раздел). Пакет работ E12.2.
 *
 * --- Только `plannedDate` — не `deadlineDate` -----------------------------
 *
 * `01§14`, дословно: "Deadline-only future task without planned date is
 * not invented into Plan; it surfaces when relevant via filters and when
 * deadline is missed." Значит группировка идёт СТРОГО по `plannedDate` —
 * задача с одним лишь дедлайном (без `plannedDate`) не появляется в Plan ни
 * на какой день, включая день дедлайна. В отличие от `selectTodayTasks`
 * (`./select-today-tasks.ts`, три индексных источника — planned/deadline/
 * focus), здесь источник кандидатов ОДИН: `plannedDate`.
 *
 * --- Не занимается загрузкой/пагинацией -----------------------------------
 *
 * Функция чистая и синхронная — не ходит в хранилище (в отличие от
 * `selectTodayTasks`, которая сама вызывает три метода `TaskRepository`).
 * Задание пакета работ прямо это требует: список задач уже загружен
 * вызывающим кодом (`packages/app`, `Plan.tsx`, обычно через
 * `TaskRepository.listByStatusAndPlannedDate('active')` — индекс, который
 * уже возвращает ВСЕ живые активные задачи, не только с заданной датой,
 * сортировка там по `plannedDate`, не фильтр по нему), а сколько дней
 * показать в UI ("lazy day groups", "показать ещё") — забота экрана, не
 * этой функции: она группирует всё, что получила, а не решает объём.
 *
 * --- Граница будущего: с сегодня включительно -----------------------------
 *
 * Задание оставляло выбор между «с сегодня» и «строго с завтра». Решение
 * этого пакета работ — С СЕГОДНЯ ВКЛЮЧИТЕЛЬНО: `01§14` нигде не говорит,
 * что Today и Plan взаимоисключающие экраны («задача может быть и там, и
 * там одновременно», задание). "Agenda... что впереди" читается как «не
 * младше сегодня», а не «строго после сегодня» — пользователь, открывший
 * План утром, разумно ожидает увидеть в нём и то, что запланировано на
 * сегодня (иначе пришлось бы объяснять, почему сегодняшняя задача исчезает
 * из Плана сразу после полуночи, а не после её выполнения). Граница —
 * `Temporal.PlainDate.compare(date, today) >= 0`, тот же приём, что
 * `classifyTaskForToday` использует для сравнения дат (`@js-temporal/
 * polyfill`, не `Date`, CLAUDE.md «Время»).
 *
 * --- Available From: маркер, не задача -------------------------------------
 *
 * `01§14`, дословно: "Available From can show lightweight `станет
 * доступна` marker on availability date. Marker is not another task and
 * not counted in task totals." `availableFrom` — поле `TaskPlanning`,
 * НЕЗАВИСИМОЕ от `plannedDate` (`@shagi/core` `entities/task.ts`: оно есть
 * в обеих ветках union, включая ветку без `plannedDate`) — значит источник
 * маркера не совпадает с источником группировки задач: маркер строится по
 * `availableFrom` ЛЮБОЙ активной задачи (даже без `plannedDate` вовсе),
 * задача-строка — только по `plannedDate`. Один и тот же день может нести
 * и маркер, и список задач одновременно, независимо друг от друга —
 * `PlanDayGroup.availableFromMarker` и `PlanDayGroup.tasks` заполняются
 * раздельными проходами по входному списку.
 *
 * Та же граница будущего (`>= today`) применена и к маркеру: `availableFrom`
 * в прошлом означает «уже доступна», а не «станет доступна» — показывать
 * маркер о том, что уже случилось, было бы неверно по смыслу самой фразы.
 *
 * Решение "реши сам" про день только с маркером (без единой запланированной
 * задачи): ПОКАЗЫВАТЬ такой день как отдельную группу с пустым `tasks` —
 * не пропускать. Обоснование: маркер существует именно чтобы предупредить
 * «скоро станет доступна такая-то задача», и это осмысленно только если
 * пользователь видит день, на котором это произойдёт — молча пропущенный
 * день лишил бы маркер единственного места, где он мог бы быть замечен.
 * `groups.length` поэтому не равен числу дней с задачами — только дням с
 * задачами ИЛИ маркером (объединение, не пересечение).
 *
 * --- Сортировка внутри дня (решение этого пакета работ, `01§14` не задаёт) -
 *
 * Задачи со `plannedTime` — по возрастанию времени первыми (тот же принцип,
 * что группа `timed` `selectTodayTasks`: видимый порядок дня должен
 * соответствовать хронологии времени, если оно указано), задачи без
 * времени — following, по `rank` (тот же критерий, что и остальные ручные
 * списки продукта). Смешение «время → потом rank» в одном списке дня — не
 * копия `selectTodayTasks` (там время/безвременные — РАЗНЫЕ группы `timed`/
 * `today`/`later`), Plan такого разделения не заводит (задание не просит
 * шесть Today-групп внутри Plan) — здесь один список на день, и это
 * простейшее правило, которое остаётся предсказуемым без деления на
 * подгруппы.
 */
export interface PlanDayGroup {
  readonly date: Temporal.PlainDate;
  /** Запланированные на этот день задачи (`plannedDate`), уже
   * отсортированные — см. заголовок файла, блок «Сортировка внутри дня». */
  readonly tasks: readonly Task[];
  /** `true`, если на этот день приходится `availableFrom` хотя бы одной
   * активной задачи (независимо от `plannedDate`) — см. заголовок файла,
   * блок «Available From». НЕ входит в `tasks.length` ни при каком исходе. */
  readonly availableFromMarker: boolean;
}

function compareByRank(a: Task, b: Task): number {
  if (a.rank < b.rank) return -1;
  if (a.rank > b.rank) return 1;
  return 0;
}

/** См. заголовок файла, блок «Сортировка внутри дня». */
function compareWithinDay(a: Task, b: Task): number {
  const aHasTime = a.plannedTime !== null;
  const bHasTime = b.plannedTime !== null;
  if (aHasTime && bHasTime) {
    const byTime = Temporal.PlainTime.compare(a.plannedTime!, b.plannedTime!);
    if (byTime !== 0) return byTime;
    return compareByRank(a, b);
  }
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
  return compareByRank(a, b);
}

interface MutableDayBucket {
  tasks: Task[];
  availableFromMarker: boolean;
}

/**
 * Группирует уже загруженный список задач по `plannedDate` в хронологическом
 * порядке дней — см. заголовок файла за полным разбором решений (граница
 * будущего, маркер Available From, сортировка внутри дня, отсутствие
 * пагинации внутри функции).
 *
 * `today` — явный вход (`Temporal.PlainDate`), функция не читает системные
 * часы сама — тот же принцип, что `selectTodayTasks`/`classifyTaskForToday`
 * (CLAUDE.md «Время», детерминированность и тестируемость без моков часов).
 *
 * `status === 'completed'` отфильтровывается защитой в глубину (тот же
 * приём, что первая проверка `classifyTaskForToday`): вызывающий код должен
 * передавать только активные задачи, но функция не падает и не выдумывает
 * группу для завершённой, если фильтр выше по стеку однажды ошибётся.
 */
export function selectPlanAgenda(
  tasks: readonly Task[],
  today: Temporal.PlainDate,
): readonly PlanDayGroup[] {
  const buckets = new Map<string, MutableDayBucket>();

  function bucketFor(date: Temporal.PlainDate): MutableDayBucket {
    const key = date.toString();
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { tasks: [], availableFromMarker: false };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const task of tasks) {
    if (task.status === 'completed') continue;

    if (task.plannedDate !== null && Temporal.PlainDate.compare(task.plannedDate, today) >= 0) {
      bucketFor(task.plannedDate).tasks.push(task);
    }

    if (task.availableFrom !== null && Temporal.PlainDate.compare(task.availableFrom, today) >= 0) {
      bucketFor(task.availableFrom).availableFromMarker = true;
    }
  }

  // Ключи — ISO `YYYY-MM-DD` (`Temporal.PlainDate#toString()`), лексикографическая
  // сортировка строк совпадает с хронологической для этого формата.
  const orderedKeys = [...buckets.keys()].toSorted();

  return orderedKeys.map((key) => {
    const bucket = buckets.get(key)!;
    return {
      date: Temporal.PlainDate.from(key),
      tasks: bucket.tasks.toSorted(compareWithinDay),
      availableFromMarker: bucket.availableFromMarker,
    };
  });
}
