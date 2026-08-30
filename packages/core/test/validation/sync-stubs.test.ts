import { describe, expect, it } from 'vitest';

import {
  validateOwnership,
  validateSeriesDeleteBoundary,
  validateTemplateRevisionReconciliation,
} from '../../src/validation/sync-stubs.js';
import { asUuid, makeOccurrenceSeq } from '../../src/values.js';

const SCOPE_A = asUuid('00000000-0000-0000-0000-0000000000a1');
const SCOPE_B = asUuid('00000000-0000-0000-0000-0000000000b2');

describe('sync-stubs — задел на правило 29 (ownership входящей sync-мутации)', () => {
  it('validateOwnership бросает: sync-слоя ещё нет, это только объявленная точка подключения', () => {
    expect(() =>
      validateOwnership({ requestOwnerScope: SCOPE_A, entityOwnerScope: SCOPE_B }),
    ).toThrow(/правило 29/i);
  });
});

describe('sync-stubs — задел на правило 30 (remove-wins граница stop_after_occurrence_seq)', () => {
  it('validateSeriesDeleteBoundary бросает: логика принадлежит движку повторов E11', () => {
    expect(() =>
      validateSeriesDeleteBoundary(makeOccurrenceSeq(5n), {
        stopAfterOccurrenceSeq: makeOccurrenceSeq(3n),
      }),
    ).toThrow(/правило 30/i);
  });
});

describe('sync-stubs — задел на правило 31 (template_revision reconciliation)', () => {
  it('validateTemplateRevisionReconciliation бросает: логика принадлежит движку повторов E11', () => {
    expect(() =>
      validateTemplateRevisionReconciliation({
        templateRevision: 3n,
        appliedTemplateRevision: 2n,
        overrideFields: [],
      }),
    ).toThrow(/правило 31/i);
  });
});
