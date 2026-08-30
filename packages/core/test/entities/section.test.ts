import { describe, expect, it } from 'vitest';

import type { Section } from '../../src/entities/section.js';
import { asUuid } from '../../src/values.js';

describe('Section (§1 «sections», `02§2`)', () => {
  it('секция обязана ссылаться на проект (`section_id` требует `project_id`, §2 п.5 — здесь наоборот: секция без проекта невозможна структурно)', () => {
    const section: Section = {
      id: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000020'),
      projectId: asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000010'),
      title: 'Входящие звонки',
      rank: '0|hzzzzz:' as Section['rank'],
      deletedAt: null,
      clocks: {},
    };
    expect(section.projectId).toBeTruthy();
  });
});
