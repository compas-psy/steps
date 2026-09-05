/**
 * Человекочитаемые подписи чипов разбора — общий словарь превью Quick Add.
 *
 * Вынесено из `QuickAdd.tsx`, когда у превью появилась вторая точка показа
 * (онбординг `FirstTask`): подпись чипа обязана быть ОДНА, иначе одна и та
 * же распознанная сущность называлась бы на двух экранах по-разному, а
 * пользователь читал бы это как два разных поведения продукта.
 */
import type { ReactNode } from 'react';

import { formatDate, formatTime, t, weekdayName } from '@shagi/i18n';
import type { Project } from '@shagi/core';
import type { AnyAcceptedChip, RecurrenceChipValue } from '@shagi/nlp';

// --- Recurrence-чип: человекочитаемая подпись (эпик E11.2) -------------------
//
// Тот же приём/то же обоснование формулировок, что `TaskDetail.tsx`
// `recurrenceRuleLabel` (см. её заголовок за подробным разбором решений по
// склонениям) — узкое дублирование между двумя экранами, не общий модуль.
// `RecurrenceChipValue` (`@shagi/nlp`) уже — подмножество форм, которые
// умеет распознать грамматика (`01§4`, шесть форм: день/будни/конкретный
// день недели/число месяца/раз в.../каждые N) — `unit` здесь никогда не
// `'year'` (NLP такую форму не производит), поэтому этот helper короче
// `TaskDetail.tsx`-варианта на одну ветку.

const QUICK_ADD_RECURRENCE_WEEKDAYS_MON_FRI: readonly number[] = [1, 2, 3, 4, 5];

function isQuickAddRecurrenceWeekdaysMonFri(byWeekday: readonly number[]): boolean {
  return (
    byWeekday.length === QUICK_ADD_RECURRENCE_WEEKDAYS_MON_FRI.length &&
    QUICK_ADD_RECURRENCE_WEEKDAYS_MON_FRI.every((day) => byWeekday.includes(day))
  );
}

/** Каждая ветка — литеральный вызов `t()` (тот же приём, что `chipLabel`
 * ради статического гейта `check-i18n-catalog.mjs`). */
export function recurrenceChipLabel(value: RecurrenceChipValue): string {
  switch (value.unit) {
    case 'day':
      return value.interval === 1
        ? t('quickAdd', 'chips.recurrenceEveryDay')
        : t('quickAdd', 'chips.recurrenceEveryNDays', { interval: value.interval });
    case 'week': {
      if (value.byWeekday !== undefined && value.byWeekday.length > 0) {
        if (isQuickAddRecurrenceWeekdaysMonFri(value.byWeekday)) {
          return t('quickAdd', 'chips.recurrenceWeekdays');
        }
        const days = value.byWeekday
          .toSorted((a, b) => a - b)
          .map((day) => weekdayName(day, 'long'))
          .join(', ');
        return t('quickAdd', 'chips.recurrenceWeeklyOnDays', { days });
      }
      return value.interval === 1
        ? t('quickAdd', 'chips.recurrenceEveryWeek')
        : t('quickAdd', 'chips.recurrenceEveryNWeeks', { interval: value.interval });
    }
    case 'month':
      return value.byMonthDay !== undefined
        ? t('quickAdd', 'chips.recurrenceMonthlyOnDay', { day: value.byMonthDay })
        : value.interval === 1
          ? t('quickAdd', 'chips.recurrenceEveryMonth')
          : t('quickAdd', 'chips.recurrenceEveryNMonths', { interval: value.interval });
  }
}

/** `switch` без `default` по `chip.category` — умышленно (тот же приём, что
 * `NlpOnboarding.tsx chipLabel`): если категория когда-нибудь вырастет, это
 * перестанет компилироваться, а не молча покажет пустой чип. */
export function chipLabel(chip: AnyAcceptedChip, resolvedProject: Project | null): ReactNode {
  switch (chip.category) {
    case 'date':
    case 'weekday':
      return formatDate(chip.value.date, { weekday: 'short' });
    case 'time':
      return formatTime(chip.value.time);
    case 'deadline':
      return chip.value.time === null
        ? t('quickAdd', 'chips.deadlineDateOnly', {
            date: formatDate(chip.value.date, { weekday: 'short' }),
          })
        : t('quickAdd', 'chips.deadlineWithTime', {
            date: formatDate(chip.value.date, { weekday: 'short' }),
            time: formatTime(chip.value.time),
          });
    case 'duration':
      return t('quickAdd', 'chips.durationMinutes', { minutes: chip.value.minutes });
    case 'recurrence':
      return recurrenceChipLabel(chip.value);
    case 'project':
      return resolvedProject !== null
        ? resolvedProject.title
        : t('quickAdd', 'chips.projectNotFound', { name: chip.value.name });
    case 'label':
      return chip.value.name;
    case 'priority':
      switch (chip.value.priority) {
        case 1:
          return t('quickAdd', 'chips.priorityP1');
        case 2:
          return t('quickAdd', 'chips.priorityP2');
        case 3:
          return t('quickAdd', 'chips.priorityP3');
        case 4:
          return t('quickAdd', 'chips.priorityP4');
      }
  }
}
