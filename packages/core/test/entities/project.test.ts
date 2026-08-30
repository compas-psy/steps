import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import type { Project } from '../../src/entities/project.js';
import { asUuid } from '../../src/values.js';

describe('Project (§1 «projects», `02§2`)', () => {
  it('активный проект без архивации компилируется и несёт все поля контракта', () => {
    const project: Project = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000010'),
      title: 'Личное',
      description: '',
      colorToken: 'accent.violet',
      icon: null,
      defaultView: 'list',
      favorite: false,
      archivedAt: null,
      rank: '0|hzzzzz:' as Project['rank'],
      createdAt: Temporal.Instant.from('2026-08-30T10:00:00Z'),
      updatedAt: Temporal.Instant.from('2026-08-30T10:00:00Z'),
      deletedAt: null,
      clocks: {},
    };
    expect(project.defaultView).toBe('list');
  });

  it('архивированный проект несёт непустой archivedAt', () => {
    const project: Project = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000011'),
      title: 'Старое',
      description: '',
      colorToken: 'accent.slate',
      icon: null,
      defaultView: 'board',
      favorite: false,
      archivedAt: Temporal.Instant.from('2026-08-30T10:00:00Z'),
      rank: '0|i00000:' as Project['rank'],
      createdAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
      updatedAt: Temporal.Instant.from('2026-08-30T10:00:00Z'),
      deletedAt: null,
      clocks: {},
    };
    expect(project.archivedAt).not.toBeNull();
  });
});
