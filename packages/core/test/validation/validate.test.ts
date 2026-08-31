import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { validateDomainMutation, type DomainMutationInput } from '../../src/validation/validate.js';

describe('validateDomainMutation — единая точка входа (02§11.1: один валидатор на локальные команды и sync-патчи)', () => {
  it('диспетчеризует task-мутацию в validateTask', () => {
    const input: DomainMutationInput = {
      entity: 'task',
      data: {
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
      },
      context: {
        id: null,
        parent: null,
        checklistItemCount: 0,
        labelCount: 0,
        explicitReminderCount: 0,
        linkCount: 0,
        attachmentCount: 0,
      },
    };
    expect(validateDomainMutation(input).valid).toBe(true);
  });

  it('диспетчеризует project-мутацию в validateProject', () => {
    const input: DomainMutationInput = {
      entity: 'project',
      data: { title: '', description: '' },
      context: { origin: 'create', activeProjectCountExcludingThis: 0, hasProEntitlement: false },
    };
    const result = validateDomainMutation(input);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('PROJECT_TITLE_LENGTH_INVALID');
  });

  it('диспетчеризует section-мутацию в validateSection', () => {
    const result = validateDomainMutation({ entity: 'section', data: { title: 'Работа' } });
    expect(result.valid).toBe(true);
  });

  it('диспетчеризует label-мутацию в validateLabel', () => {
    const result = validateDomainMutation({
      entity: 'label',
      data: { displayName: 'Дом' },
      context: { existingNormalizedNames: [] },
    });
    expect(result.valid).toBe(true);
  });

  it('диспетчеризует explicit_reminder-мутацию в validateExplicitReminder', () => {
    const result = validateDomainMutation({
      entity: 'explicit_reminder',
      data: { date: Temporal.PlainDate.from('2026-09-01'), time: null },
      context: { deadlineDate: null, deadlineTime: null },
    });
    expect(result.valid).toBe(true);
  });

  it('диспетчеризует checklist_item-мутацию в validateChecklistItem', () => {
    const result = validateDomainMutation({
      entity: 'checklist_item',
      data: { text: 'Купить молоко' },
    });
    expect(result.valid).toBe(true);
  });
});
