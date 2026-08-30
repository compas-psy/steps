import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import {
  validateTask,
  type TaskParentSnapshot,
  type TaskValidationContext,
  type TaskValidationInput,
} from '../../src/validation/task.js';
import type { ValidationIssue } from '../../src/validation/types.js';
import { asUuid } from '../../src/values.js';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const t = (iso: string) => Temporal.PlainTime.from(iso);

const SELF_ID = asUuid('00000000-0000-0000-0000-000000000001');
const PARENT_ID = asUuid('00000000-0000-0000-0000-000000000002');
const PROJECT_ID = asUuid('00000000-0000-0000-0000-000000000003');
const SECTION_ID = asUuid('00000000-0000-0000-0000-000000000004');
const OTHER_PROJECT_ID = asUuid('00000000-0000-0000-0000-000000000005');
const SERIES_ID = asUuid('00000000-0000-0000-0000-000000000006');
const GRANDPARENT_ID = asUuid('00000000-0000-0000-0000-000000000007');

/** Базовая, полностью нейтральная задача — точка отсчёта для точечных
 * вариаций в каждом тесте (тот же паттерн, что в `today-classification.test.ts`). */
function bareInput(): TaskValidationInput {
  return {
    title: 'Купить молоко',
    description: '',
    projectId: null,
    sectionId: null,
    parentTaskId: null,
    captureState: 'processed',
    seriesId: null,
    availableFrom: null,
    plannedDate: null,
    plannedTime: null,
    durationMin: null,
    focusDate: null,
    dayBucket: 'default',
    deadlineDate: null,
    deadlineTime: null,
    status: 'active',
    completedAt: null,
    completionKind: null,
    priority: 4,
  };
}

function bareContext(): TaskValidationContext {
  return {
    id: SELF_ID,
    parent: null,
    checklistItemCount: 0,
    labelCount: 0,
    explicitReminderCount: 0,
    linkCount: 0,
    attachmentCount: 0,
  };
}

function parentSnapshot(overrides: Partial<TaskParentSnapshot> = {}): TaskParentSnapshot {
  return {
    id: PARENT_ID,
    projectId: null,
    sectionId: null,
    parentTaskId: null,
    directSubtaskCount: 0,
    ...overrides,
  };
}

function issuesFor(rule: number, issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.rule === rule);
}

describe('validateTask — правило 1: planned_time требует planned_date (блокирующее)', () => {
  it('время задано, дата нет — блокируется', () => {
    const result = validateTask({ ...bareInput(), plannedTime: t('09:00') }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(1, result.issues)).toEqual([
      { rule: 1, code: 'TEMPORAL_CONFLICT', severity: 'blocking', field: 'plannedTime' },
    ]);
  });
});

describe('validateTask — правило 2: deadline_time требует deadline_date (блокирующее)', () => {
  it('время дедлайна задано, дата нет — блокируется', () => {
    const result = validateTask({ ...bareInput(), deadlineTime: t('18:00') }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(2, result.issues)).toHaveLength(1);
    expect(issuesFor(2, result.issues)[0]?.code).toBe('TEMPORAL_CONFLICT');
    expect(issuesFor(2, result.issues)[0]?.field).toBe('deadlineTime');
  });
});

describe('validateTask — правило 3: planned_date < available_from (блокирующее)', () => {
  it('план раньше доступности — блокируется', () => {
    const result = validateTask(
      { ...bareInput(), plannedDate: d('2026-09-01'), availableFrom: d('2026-09-05') },
      bareContext(),
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(3, result.issues)).toHaveLength(1);
  });

  it('план в день доступности (граница включительно) — не блокируется', () => {
    const result = validateTask(
      { ...bareInput(), plannedDate: d('2026-09-05'), availableFrom: d('2026-09-05') },
      bareContext(),
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateTask — правило 4: deadline < начало дня available_from (блокирующее)', () => {
  it('дедлайн раньше доступности — блокируется', () => {
    const result = validateTask(
      { ...bareInput(), deadlineDate: d('2026-09-01'), availableFrom: d('2026-09-05') },
      bareContext(),
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(4, result.issues)).toHaveLength(1);
  });
});

describe('validateTask — правило 5: section_id без project_id (блокирующее)', () => {
  it('секция без проекта — блокируется', () => {
    const result = validateTask({ ...bareInput(), sectionId: SECTION_ID }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(5, result.issues)).toEqual([
      { rule: 5, code: 'TASK_SECTION_REQUIRES_PROJECT', severity: 'blocking', field: 'sectionId' },
    ]);
  });

  it('секция с проектом — не блокируется (проверяется только этим правилом)', () => {
    const result = validateTask(
      { ...bareInput(), projectId: PROJECT_ID, sectionId: SECTION_ID },
      bareContext(),
    );
    expect(issuesFor(5, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 6: child обязан иметь тот же Project/Section, что и Parent (блокирующее)', () => {
  it('child в другом проекте, чем parent — блокируется', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot({ projectId: PROJECT_ID, sectionId: null }),
    };
    const result = validateTask(
      {
        ...bareInput(),
        parentTaskId: PARENT_ID,
        projectId: OTHER_PROJECT_ID,
        captureState: 'processed',
      },
      context,
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(6, result.issues).map((i) => i.field)).toContain('projectId');
  });

  it('child в другой секции того же проекта, чем parent — блокируется', () => {
    const otherSection = asUuid('00000000-0000-0000-0000-000000000008');
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot({ projectId: PROJECT_ID, sectionId: SECTION_ID }),
    };
    const result = validateTask(
      {
        ...bareInput(),
        parentTaskId: PARENT_ID,
        projectId: PROJECT_ID,
        sectionId: otherSection,
        captureState: 'processed',
      },
      context,
    );
    expect(issuesFor(6, result.issues).map((i) => i.field)).toContain('sectionId');
  });

  it('child с тем же Project/Section, что и parent — не блокируется', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot({ projectId: PROJECT_ID, sectionId: SECTION_ID }),
    };
    const result = validateTask(
      {
        ...bareInput(),
        parentTaskId: PARENT_ID,
        projectId: PROJECT_ID,
        sectionId: SECTION_ID,
        captureState: 'processed',
      },
      context,
    );
    expect(issuesFor(6, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 7: нет цикла, user-created глубина ≤1 (блокирующее)', () => {
  it('задача указывает сама себя родителем — цикл, блокируется', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      id: SELF_ID,
      parent: parentSnapshot({ id: SELF_ID }),
    };
    const result = validateTask(
      { ...bareInput(), parentTaskId: SELF_ID, captureState: 'processed' },
      context,
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(7, result.issues).map((i) => i.code)).toContain('TASK_HIERARCHY_CYCLE');
  });

  it('родитель сам является дочерней задачей (глубина 2) — блокируется', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot({ parentTaskId: GRANDPARENT_ID }),
    };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, captureState: 'processed' },
      context,
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(7, result.issues).map((i) => i.code)).toContain(
      'TASK_HIERARCHY_DEPTH_EXCEEDED',
    );
  });

  it('родитель top-level (глубина 1) — не блокируется этим правилом', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot({ parentTaskId: null }),
    };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, captureState: 'processed' },
      context,
    );
    expect(issuesFor(7, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 8: recurring обязана быть top-level (блокирующее)', () => {
  it('задача с series_id и parent_task_id одновременно — блокируется', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot(),
    };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, seriesId: SERIES_ID, captureState: 'processed' },
      context,
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(8, result.issues)).toEqual([
      {
        rule: 8,
        code: 'TASK_RECURRING_MUST_BE_TOP_LEVEL',
        severity: 'blocking',
        field: 'parentTaskId',
        details: { seriesId: SERIES_ID },
      },
    ]);
  });

  it('попытка переместить существующую повторяющуюся задачу под другую — то же условие, блокируется', () => {
    // "Перенос" на уровне валидатора неотличим от "создания с обоими полями
    // сразу" — обе ситуации сводятся к одной и той же проверке предложенного
    // состояния (parentTaskId != null && seriesId != null), что и требуется
    // ("блокируется, пока повтор не снят").
    const context: TaskValidationContext = { ...bareContext(), parent: parentSnapshot() };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, seriesId: SERIES_ID, captureState: 'processed' },
      context,
    );
    expect(result.valid).toBe(false);
  });

  it('recurring top-level (без parent) — не блокируется', () => {
    const result = validateTask({ ...bareInput(), seriesId: SERIES_ID }, bareContext());
    expect(issuesFor(8, result.issues)).toHaveLength(0);
  });

  it('после снятия повтора (seriesId=null) перенос под родителя больше не блокируется этим правилом', () => {
    const context: TaskValidationContext = { ...bareContext(), parent: parentSnapshot() };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, seriesId: null, captureState: 'processed' },
      context,
    );
    expect(issuesFor(8, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 9: дочерняя задача не может быть в inbox (блокирующее)', () => {
  it('child с capture_state=inbox — блокируется', () => {
    const context: TaskValidationContext = { ...bareContext(), parent: parentSnapshot() };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, captureState: 'inbox' },
      context,
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(9, result.issues)).toEqual([
      {
        rule: 9,
        code: 'TASK_CHILD_MUST_BE_PROCESSED',
        severity: 'blocking',
        field: 'captureState',
      },
    ]);
  });

  it('top-level задача в inbox — не блокируется этим правилом', () => {
    const result = validateTask({ ...bareInput(), captureState: 'inbox' }, bareContext());
    expect(issuesFor(9, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 10: focus_date — null либо строго равен planned_date (блокирующее)', () => {
  it('focus_date задан без planned_date — блокируется', () => {
    const result = validateTask({ ...bareInput(), focusDate: d('2026-09-01') }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(10, result.issues)).toHaveLength(1);
  });

  it('focus_date отличается от planned_date — блокируется', () => {
    const result = validateTask(
      { ...bareInput(), plannedDate: d('2026-09-01'), focusDate: d('2026-09-02') },
      bareContext(),
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(10, result.issues)).toHaveLength(1);
  });

  it('focus_date равен planned_date — не блокируется', () => {
    const result = validateTask(
      { ...bareInput(), plannedDate: d('2026-09-01'), focusDate: d('2026-09-01') },
      bareContext(),
    );
    expect(issuesFor(10, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 11: day_bucket=later требует Planned Date (блокирующее)', () => {
  it('later без planned_date — блокируется', () => {
    const result = validateTask({ ...bareInput(), dayBucket: 'later' }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(11, result.issues)).toEqual([
      {
        rule: 11,
        code: 'TASK_DAY_BUCKET_REQUIRES_PLANNED_DATE',
        severity: 'blocking',
        field: 'dayBucket',
      },
    ]);
  });

  it('later с planned_date — не блокируется', () => {
    const result = validateTask(
      { ...bareInput(), dayBucket: 'later', plannedDate: d('2026-09-01') },
      bareContext(),
    );
    expect(issuesFor(11, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 12: status=completed согласован с completed_at (блокирующее)', () => {
  it('completed без completed_at — блокируется', () => {
    const result = validateTask({ ...bareInput(), status: 'completed' }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(12, result.issues)).toHaveLength(1);
  });

  it('active с заданным completed_at — блокируется', () => {
    const result = validateTask(
      {
        ...bareInput(),
        status: 'active',
        completedAt: Temporal.Instant.from('2026-09-01T09:00:00Z'),
      },
      bareContext(),
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(12, result.issues)).toHaveLength(1);
  });

  it('completed с completed_at — не блокируется этим правилом', () => {
    const result = validateTask(
      {
        ...bareInput(),
        status: 'completed',
        completedAt: Temporal.Instant.from('2026-09-01T09:00:00Z'),
        completionKind: 'done',
      },
      bareContext(),
    );
    expect(issuesFor(12, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 13: completion_kind согласован со status (блокирующее)', () => {
  it('active с ненулевым completion_kind — блокируется', () => {
    const result = validateTask({ ...bareInput(), completionKind: 'done' }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(13, result.issues)).toHaveLength(1);
  });

  it('completed без completion_kind — блокируется', () => {
    const result = validateTask(
      {
        ...bareInput(),
        status: 'completed',
        completedAt: Temporal.Instant.from('2026-09-01T09:00:00Z'),
        completionKind: null,
      },
      bareContext(),
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(13, result.issues)).toHaveLength(1);
  });

  it('completed skipped (пропуск повтора) — валидная комбинация', () => {
    const result = validateTask(
      {
        ...bareInput(),
        status: 'completed',
        completedAt: Temporal.Instant.from('2026-09-01T09:00:00Z'),
        completionKind: 'skipped',
      },
      bareContext(),
    );
    expect(issuesFor(13, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 14: title 1..500 после нормализации + читаемость (блокирующее)', () => {
  it('пустой заголовок — блокируется', () => {
    const result = validateTask({ ...bareInput(), title: '' }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(14, result.issues).map((i) => i.code)).toContain('TASK_TITLE_LENGTH_INVALID');
  });

  it('заголовок длиннее 500 символов — блокируется', () => {
    const result = validateTask({ ...bareInput(), title: 'а'.repeat(501) }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(14, result.issues).map((i) => i.code)).toContain('TASK_TITLE_LENGTH_INVALID');
  });

  it('ровно 500 символов — граница включительно, не блокируется', () => {
    const result = validateTask({ ...bareInput(), title: 'а'.repeat(500) }, bareContext());
    expect(issuesFor(14, result.issues)).toHaveLength(0);
  });

  it('заголовок из одних принятых service-токенов ("!1 #проект") — не остаётся читаемого текста, блокируется (решение ?10)', () => {
    const result = validateTask({ ...bareInput(), title: '!  #' }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(14, result.issues).map((i) => i.code)).toContain('TASK_TITLE_NOT_READABLE');
  });

  it('заголовок с переводами строк и табами — нормализуется в пробелы, не блокируется этим правилом', () => {
    const result = validateTask({ ...bareInput(), title: 'Купить\nмолоко\tи хлеб' }, bareContext());
    expect(issuesFor(14, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 15: description 0..100000 (блокирующее)', () => {
  it('пустое описание — валидно', () => {
    const result = validateTask({ ...bareInput(), description: '' }, bareContext());
    expect(issuesFor(15, result.issues)).toHaveLength(0);
  });

  it('описание длиннее 100000 символов — блокируется', () => {
    const result = validateTask(
      { ...bareInput(), description: 'a'.repeat(100_001) },
      bareContext(),
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(15, result.issues)).toHaveLength(1);
  });

  it('ровно 100000 символов — граница включительно, не блокируется', () => {
    const result = validateTask(
      { ...bareInput(), description: 'a'.repeat(100_000) },
      bareContext(),
    );
    expect(issuesFor(15, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 16: max 100 прямых subtasks (блокирующее)', () => {
  it('у родителя уже 100 subtasks — 101-я блокируется', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot({ directSubtaskCount: 100 }),
    };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, captureState: 'processed' },
      context,
    );
    expect(result.valid).toBe(false);
    expect(issuesFor(16, result.issues)).toEqual([
      {
        rule: 16,
        code: 'TASK_SUBTASK_LIMIT_EXCEEDED',
        severity: 'blocking',
        field: 'parentTaskId',
        details: { limit: 100, current: 100 },
      },
    ]);
  });

  it('у родителя 99 subtasks — 100-я не блокируется', () => {
    const context: TaskValidationContext = {
      ...bareContext(),
      parent: parentSnapshot({ directSubtaskCount: 99 }),
    };
    const result = validateTask(
      { ...bareInput(), parentTaskId: PARENT_ID, captureState: 'processed' },
      context,
    );
    expect(issuesFor(16, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 17: max 200 checklist items (блокирующее)', () => {
  it('201-й checklist item — блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), checklistItemCount: 201 });
    expect(result.valid).toBe(false);
    expect(issuesFor(17, result.issues)).toHaveLength(1);
  });

  it('ровно 200 — не блокируется (граница включительно)', () => {
    const result = validateTask(bareInput(), { ...bareContext(), checklistItemCount: 200 });
    expect(issuesFor(17, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 18: max 50 labels (блокирующее)', () => {
  it('51-я метка — блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), labelCount: 51 });
    expect(result.valid).toBe(false);
    expect(issuesFor(18, result.issues)).toHaveLength(1);
  });

  it('ровно 50 — не блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), labelCount: 50 });
    expect(issuesFor(18, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 19: max 1 explicit reminder (блокирующее)', () => {
  it('2-е напоминание — блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), explicitReminderCount: 2 });
    expect(result.valid).toBe(false);
    expect(issuesFor(19, result.issues)).toHaveLength(1);
  });

  it('ровно 1 — не блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), explicitReminderCount: 1 });
    expect(issuesFor(19, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 20: max 20 links (блокирующее)', () => {
  it('21-я ссылка — блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), linkCount: 21 });
    expect(result.valid).toBe(false);
    expect(issuesFor(20, result.issues)).toHaveLength(1);
  });

  it('ровно 20 — не блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), linkCount: 20 });
    expect(issuesFor(20, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 21: max 10 attachments (блокирующее, код ATTACHMENT_QUOTA_EXCEEDED из `03§19`)', () => {
  it('11-е вложение — блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), attachmentCount: 11 });
    expect(result.valid).toBe(false);
    expect(issuesFor(21, result.issues)).toEqual([
      {
        rule: 21,
        code: 'ATTACHMENT_QUOTA_EXCEEDED',
        severity: 'blocking',
        field: 'attachments',
        details: { limit: 10, current: 11 },
      },
    ]);
  });

  it('ровно 10 — не блокируется', () => {
    const result = validateTask(bareInput(), { ...bareContext(), attachmentCount: 10 });
    expect(issuesFor(21, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — правило 25: duration_min ∈ [1,1440] (блокирующее)', () => {
  it('0 минут — блокируется', () => {
    const result = validateTask({ ...bareInput(), durationMin: 0 }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(25, result.issues)).toHaveLength(1);
  });

  it('1441 минута — блокируется', () => {
    const result = validateTask({ ...bareInput(), durationMin: 1441 }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(25, result.issues)).toHaveLength(1);
  });

  it('дробное значение — блокируется', () => {
    const result = validateTask({ ...bareInput(), durationMin: 1.5 }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(25, result.issues)).toHaveLength(1);
  });

  it('1 и 1440 — границы включительны, не блокируются', () => {
    expect(
      issuesFor(25, validateTask({ ...bareInput(), durationMin: 1 }, bareContext()).issues),
    ).toHaveLength(0);
    expect(
      issuesFor(25, validateTask({ ...bareInput(), durationMin: 1440 }, bareContext()).issues),
    ).toHaveLength(0);
  });
});

describe('validateTask — правило 26: priority ∈ [1,4] (блокирующее)', () => {
  it('0 — блокируется', () => {
    const result = validateTask({ ...bareInput(), priority: 0 }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(26, result.issues)).toHaveLength(1);
  });

  it('5 — блокируется', () => {
    const result = validateTask({ ...bareInput(), priority: 5 }, bareContext());
    expect(result.valid).toBe(false);
    expect(issuesFor(26, result.issues)).toHaveLength(1);
  });

  it('1 и 4 — границы включительны, не блокируются', () => {
    expect(
      issuesFor(26, validateTask({ ...bareInput(), priority: 1 }, bareContext()).issues),
    ).toHaveLength(0);
    expect(
      issuesFor(26, validateTask({ ...bareInput(), priority: 4 }, bareContext()).issues),
    ).toHaveLength(0);
  });
});

describe('validateTask — правило 32: planned > deadline (предупреждение, сохранение разрешено)', () => {
  it('план позже дедлайна — предупреждение, но valid=true', () => {
    const result = validateTask(
      {
        ...bareInput(),
        plannedDate: d('2026-09-10'),
        deadlineDate: d('2026-09-05'),
        deadlineTime: t('18:00'),
      },
      bareContext(),
    );
    expect(result.valid).toBe(true);
    expect(issuesFor(32, result.issues)).toEqual([
      { rule: 32, code: 'TEMPORAL_CONFLICT', severity: 'warning', field: 'plannedDate' },
    ]);
  });
});

describe('validateTask — правило 33: planned_time+duration заканчивается после deadline (предупреждение)', () => {
  it('длительность заходит за дедлайн — предупреждение, valid=true', () => {
    const result = validateTask(
      {
        ...bareInput(),
        plannedDate: d('2026-09-01'),
        plannedTime: t('17:30'),
        durationMin: 90,
        deadlineDate: d('2026-09-01'),
        deadlineTime: t('18:00'),
      },
      bareContext(),
    );
    expect(result.valid).toBe(true);
    expect(issuesFor(33, result.issues)).toEqual([
      { rule: 33, code: 'TEMPORAL_CONFLICT', severity: 'warning', field: 'durationMin' },
    ]);
  });

  it('укладывается в дедлайн — без предупреждения', () => {
    const result = validateTask(
      {
        ...bareInput(),
        plannedDate: d('2026-09-01'),
        plannedTime: t('16:00'),
        durationMin: 30,
        deadlineDate: d('2026-09-01'),
        deadlineTime: t('18:00'),
      },
      bareContext(),
    );
    expect(issuesFor(33, result.issues)).toHaveLength(0);
  });
});

describe('validateTask — явно валидные комбинации (§2 пп.35–38): валидатор не должен их блокировать', () => {
  it('35. Duration без Time — валидно, без единого issue', () => {
    const result = validateTask({ ...bareInput(), durationMin: 45 }, bareContext());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('36. Deadline без Planned Date — валидно, без единого issue', () => {
    const result = validateTask(
      { ...bareInput(), deadlineDate: d('2026-09-10'), deadlineTime: t('18:00') },
      bareContext(),
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('37. Available From без Planned Date — валидно, без единого issue', () => {
    const result = validateTask({ ...bareInput(), availableFrom: d('2026-09-10') }, bareContext());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('38. Задача вовсе без temporal-полей — валидно, без единого issue', () => {
    const result = validateTask(bareInput(), bareContext());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe('validateTask — контракт вызова: parentTaskId без TaskValidationContext.parent — ошибка вызывающего кода', () => {
  it('бросает, а не тихо пропускает проверки 6–9, 16', () => {
    expect(() => validateTask({ ...bareInput(), parentTaskId: PARENT_ID }, bareContext())).toThrow(
      TypeError,
    );
  });
});
