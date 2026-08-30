import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  PACKAGE_NAME,
  asUuid,
  classifyTaskForToday,
  isDeadlinePassed,
  type Task,
} from '../src/index.js';

/** Проверка типизации: `Task` реэкспортируется из корня пакета. */
function assertTaskType(task: Task) {
  return task.id;
}

describe('@shagi/core', () => {
  it('экспортирует собственное имя пакета — подтверждает, что резолвинг модулей, tsconfig и vitest настроены сквозь весь тулчейн', () => {
    expect(PACKAGE_NAME).toBe('@shagi/core');
  });

  it('барrel-экспорт даёт доступ к сущностям, значениям и правилам одним импортом', () => {
    expect(asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001')).toBeTruthy();
    expect(isDeadlinePassed(null, null, Temporal.PlainDateTime.from('2026-09-01T00:00:00'))).toBe(
      false,
    );
    expect(
      classifyTaskForToday(
        {
          status: 'active',
          completedAt: null,
          completionKind: null,
          deadlineDate: null,
          deadlineTime: null,
          availableFrom: null,
          plannedDate: null,
          plannedTime: null,
          durationMin: null,
          focusDate: null,
          dayBucket: 'default',
        },
        Temporal.PlainDateTime.from('2026-09-01T00:00:00'),
      ),
    ).toBeNull();
  });

  it('тип Task реэкспортируется из корня пакета (компилируется без прямого импорта из src/entities)', () => {
    expect(typeof assertTaskType).toBe('function');
  });
});
