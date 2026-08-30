import { Temporal } from '@js-temporal/polyfill';

import type { TaskCompletion, TaskDeadline, TaskPlanning } from '../entities/task.js';
import { isDeadlinePassed } from '../temporal/deadline.js';

/**
 * Классификация активной задачи в одну из шести групп экрана Today
 * (конспект §5, `01§6`) — **единая функция ранжирования**, а не
 * разрозненные условия по группам.
 *
 * Причина: независимый review до этого пакета работ нашёл, что задача
 * может попасть сразу в несколько групп, если каждую группу проверять
 * отдельным независимым условием (например «Просрочен срок» и «Не по
 * плану» — оба условия у задачи с дедлайном и планом в прошлом истинны
 * одновременно). Здесь группы проверяются строго по прецедансу §6
 * последовательными `return` — как только условие подошло, функция
 * возвращает результат и дальше не смотрит; структурно невозможно вернуть
 * вторую группу для той же задачи, потому что после первого `return`
 * выполнение уже закончилось. "No duplicates" (`01§6`) — свойство формы
 * функции, а не отдельная проверка поверх неё.
 */
export type TodayGroup = 'missed_deadline' | 'missed_plan' | 'focus' | 'timed' | 'today' | 'later';

export type TaskForTodayClassification = TaskCompletion & TaskDeadline & TaskPlanning;

/**
 * @param now плавающее локальное "сейчас" (`Temporal.PlainDateTime`) — не
 * просто дата: «Просрочен срок» зависит от точного момента (дедлайн в
 * 18:00 сегодня ещё не просрочен в 10:00), а `focus_date`/`planned_date`
 * сравниваются с датой этого момента. Midnight rollover и "focus_date не
 * переносится на следующий день" (мандаторные тесты `06§2`, решение `?4`)
 * следуют из этого автоматически: функция чистая и не хранит состояние —
 * ей неоткуда "помнить" вчера, кроме значения, которое уже лежит в полях
 * задачи.
 */
export function classifyTaskForToday(
  task: TaskForTodayClassification,
  now: Temporal.PlainDateTime,
): TodayGroup | null {
  if (task.status === 'completed') {
    return null;
  }

  if (isDeadlinePassed(task.deadlineDate, task.deadlineTime, now)) {
    return 'missed_deadline';
  }

  const today = now.toPlainDate();

  if (task.plannedDate !== null && Temporal.PlainDate.compare(task.plannedDate, today) < 0) {
    return 'missed_plan';
  }

  if (task.focusDate !== null && task.focusDate.equals(today)) {
    return 'focus';
  }

  const isPlannedToday =
    task.plannedDate !== null && Temporal.PlainDate.compare(task.plannedDate, today) === 0;

  if (isPlannedToday && task.dayBucket === 'default' && task.plannedTime !== null) {
    return 'timed';
  }

  if (isPlannedToday && task.dayBucket === 'default' && task.plannedTime === null) {
    return 'today';
  }

  if (isPlannedToday && task.dayBucket === 'later') {
    return 'later';
  }

  return null;
}
