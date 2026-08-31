import { describe, expect, it } from 'vitest';

import * as sectionDeleteModule from '../../src/commands/section-delete.js';
import { DELETE_SECTION_COMMAND_BLOCKED_REASON } from '../../src/commands/section-delete.js';

/**
 * Пин-тест архитектурного блокера (см. JSDoc `section-delete.ts` и отчёт
 * пакета работ E09): `deleteSectionCommand` не реализован, потому что
 * соглашение о синтетической секции «Без раздела» не зафиксировано нигде
 * в дереве пакетов. Тест существует, чтобы блокер был виден в прогоне
 * тестов (красным бы упал, если бы кто-то тихо добавил
 * `deleteSectionCommand` без адресации находки), а не только в комментарии,
 * который легко не заметить.
 */
describe('deleteSectionCommand (заблокировано)', () => {
  it('не экспортируется — вызывающий код получит ошибку компиляции, а не угадывающую реализацию', () => {
    expect('deleteSectionCommand' in sectionDeleteModule).toBe(false);
  });

  it('причина блокировки задокументирована и упоминает синтетическую секцию', () => {
    expect(DELETE_SECTION_COMMAND_BLOCKED_REASON).toMatch(/Без раздела/);
    expect(DELETE_SECTION_COMMAND_BLOCKED_REASON).toMatch(/заблокирован/);
  });
});
