import type { Temporal } from '@js-temporal/polyfill';

import type { TaskDeadline, TaskPlanning } from '../entities/task.js';

/**
 * Правила сброса полей вокруг Planned Date/Time/Focus/day_bucket
 * (конспект §3, `01§5`, `01§6`). Каждая функция — чистое преобразование
 * среза `TaskPlanning`/`TaskDeadline`, не всей `Task`: сборка изменения
 * обратно в полную задачу (и запись в хранилище) — забота командного слоя
 * (следующий пакет работ).
 */

type TaskPlanningWithDate = Extract<TaskPlanning, { plannedDate: Temporal.PlainDate }>;

/**
 * Удаление Planned Date: убирает Planned Time, сбрасывает Focus и
 * `day_bucket` в `'default'`, но **оставляет Duration** (и Available From —
 * они не зависят от Planned Date, §2 пп.35, 37).
 */
export function clearPlannedDate(
  planning: TaskPlanning,
): Extract<TaskPlanning, { plannedDate: null }> {
  return {
    availableFrom: planning.availableFrom,
    plannedDate: null,
    plannedTime: null,
    durationMin: planning.durationMin,
    focusDate: null,
    dayBucket: 'default',
  };
}

/**
 * Назначение (или снятие) Planned Time на задаче, у которой уже есть
 * Planned Date. Назначение непустого времени задаче «Когда будет время»
 * возвращает `day_bucket` в `'default'` — таймированная задача не должна
 * прятаться в группе «Когда будет время» неожиданно для пользователя.
 * Снятие времени (`null`) `day_bucket` не трогает — это не то же действие.
 */
export function setPlannedTime(
  planning: TaskPlanningWithDate,
  time: Temporal.PlainTime | null,
): TaskPlanningWithDate {
  return {
    ...planning,
    plannedTime: time,
    dayBucket: time !== null ? 'default' : planning.dayBucket,
  };
}

/**
 * Смена (или первое назначение) Planned Date. `day_bucket` всегда
 * сбрасывается в `'default'` — новая дата не наследует "потом" со старой.
 * `focusDate` сбрасывается, если он не совпадает с новой датой (иначе
 * нарушился бы §2 п.10: `focus_date` обязан быть `null` либо равен
 * `planned_date`, а старый `focusDate` был равен старой, отличной,
 * `plannedDate`). `plannedTime` и `durationMin` — независимые поля,
 * переносятся без изменений.
 */
export function setPlannedDate(
  planning: TaskPlanning,
  newDate: Temporal.PlainDate,
): TaskPlanningWithDate {
  const focusDate =
    planning.focusDate !== null && planning.focusDate.equals(newDate) ? planning.focusDate : null;

  return {
    availableFrom: planning.availableFrom,
    plannedDate: newDate,
    plannedTime: planning.plannedDate === null ? null : planning.plannedTime,
    durationMin: planning.durationMin,
    focusDate,
    dayBucket: 'default',
  };
}

/**
 * Действие «Когда будет время»: ставит `day_bucket='later'`, очищает
 * Planned Time, сохраняет Duration и Planned Date (`01§6`). Требует уже
 * заданной Planned Date на уровне типов — действие структурно неприменимо
 * к задаче без плана.
 */
export function setDayBucketLater(planning: TaskPlanningWithDate): TaskPlanningWithDate {
  return {
    ...planning,
    plannedTime: null,
    dayBucket: 'later',
  };
}

/**
 * Удаление Deadline удаляет Deadline Time вместе с ним (конспект §3,
 * `01§5`). Deadline-derived расписание уведомлений — сущность `reminders`,
 * вне этого среза; её отмена — забота командного слоя.
 */
export function clearDeadline(
  _deadline: TaskDeadline,
): Extract<TaskDeadline, { deadlineDate: null }> {
  return { deadlineDate: null, deadlineTime: null };
}
