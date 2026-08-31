/**
 * Секция «Planning» харнесса (E03.5) — DateChip/TimeChip/DurationChip/
 * DeadlineChip/ReminderChip/RecurrenceChip (тонкие обёртки над `Chip`,
 * Default/Selected/Removable — тот же контракт, что и у самого `Chip`),
 * DatePicker/TimePicker (открыты с выбранным значением), TemporalConflict
 * (три типа конфликта).
 */
import { type ReactElement, useState } from 'react';

import {
  type CalendarDate,
  type CalendarMonth,
  DateChip,
  DatePicker,
  DeadlineChip,
  DurationChip,
  ReminderChip,
  RecurrenceChip,
  TemporalConflict,
  TimeChip,
  TimePicker,
  type TimeValue,
} from '../../src/components/index.js';
import { Example, HarnessSection } from './Example.js';

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
const MONTH_LABELS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

const TODAY: CalendarDate = { year: 2026, month: 8, day: 31 };

function ChipTrio({
  testId,
  Component,
}: {
  readonly testId: string;
  readonly Component: typeof DateChip;
}): ReactElement {
  return (
    <Example testId={testId} label="Default / Selected / Removable">
      <div className="dev-row">
        <Component label="3 сен" />
        <Component label="3 сен" selected onClick={() => {}} />
        <Component label="3 сен" removable removeLabel="Убрать" onRemove={() => {}} />
      </div>
    </Example>
  );
}

function DatePickerExample(): ReactElement {
  const [value, setValue] = useState<CalendarDate | null>({ year: 2026, month: 8, day: 20 });
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>({ year: 2026, month: 8 });
  return (
    <Example testId="example-date-picker" label="С выбранной датой" wide>
      <DatePicker
        label="Выбор даты"
        value={value}
        visibleMonth={visibleMonth}
        onVisibleMonthChange={setVisibleMonth}
        onSelect={setValue}
        today={TODAY}
        weekStartsOn={1}
        weekdayLabels={WEEKDAY_LABELS}
        monthLabels={MONTH_LABELS}
        previousMonthLabel="Предыдущий месяц"
        nextMonthLabel="Следующий месяц"
      />
    </Example>
  );
}

function TimePickerExample(): ReactElement {
  const [value, setValue] = useState<TimeValue | null>({ hour: 9, minute: 30 });
  return (
    <Example testId="example-time-picker" label="С выбранным временем">
      <TimePicker
        label="Выбор времени"
        hourListLabel="Часы"
        minuteListLabel="Минуты"
        value={value}
        onSelect={setValue}
      />
    </Example>
  );
}

export function PlanningSection(): ReactElement {
  return (
    <HarnessSection testId="section-planning" title="Planning">
      <ChipTrio testId="example-date-chip" Component={DateChip} />
      <ChipTrio testId="example-time-chip" Component={TimeChip} />
      <ChipTrio testId="example-duration-chip" Component={DurationChip} />
      <ChipTrio testId="example-deadline-chip" Component={DeadlineChip} />
      <ChipTrio testId="example-reminder-chip" Component={ReminderChip} />
      <ChipTrio testId="example-recurrence-chip" Component={RecurrenceChip} />

      <DatePickerExample />
      <TimePickerExample />

      <Example testId="example-temporal-conflict" label="Три типа конфликта" wide>
        <div className="dev-stack">
          <TemporalConflict
            type="plannedAfterDeadline"
            message="Дата планирования позже срока задачи."
          />
          <TemporalConflict
            type="durationCrossesDeadline"
            message="Длительность выходит за пределы срока."
          />
          <TemporalConflict
            type="reminderAfterDeadline"
            message="Напоминание назначено после срока."
          />
        </div>
      </Example>
    </HarnessSection>
  );
}
