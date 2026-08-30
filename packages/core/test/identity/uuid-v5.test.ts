import { describe, expect, it } from 'vitest';

import {
  deriveChecklistItemId,
  deriveOccurrenceId,
  deriveSubtaskId,
  uuidV5,
} from '../../src/identity/uuid-v5.js';
import { asUuid, makeOccurrenceSeq } from '../../src/values.js';

// Официальный тестовый вектор RFC 4122 §4.3 / Python `uuid.uuid5`:
// `uuid5(NAMESPACE_DNS, "python.org") == 886313e1-3b8a-5372-9b90-0c9aee199e5d`.
const NAMESPACE_DNS = asUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8');

describe('uuidV5', () => {
  it('совпадает с официальным тестовым вектором RFC 4122 (NAMESPACE_DNS + "python.org")', () => {
    expect(uuidV5(NAMESPACE_DNS, 'python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('детерминирован: одни и те же namespace+name всегда дают тот же UUID', () => {
    const seriesId = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001');
    const first = uuidV5(seriesId, 'occurrence:1');
    const second = uuidV5(seriesId, 'occurrence:1');
    expect(first).toBe(second);
  });

  it('различает разные name при том же namespace', () => {
    const seriesId = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001');
    expect(uuidV5(seriesId, 'occurrence:1')).not.toBe(uuidV5(seriesId, 'occurrence:2'));
  });

  it('различает разные namespace при том же name', () => {
    const seriesA = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001');
    const seriesB = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000002');
    expect(uuidV5(seriesA, 'occurrence:1')).not.toBe(uuidV5(seriesB, 'occurrence:1'));
  });

  it('версия и вариант в байтах результата соответствуют UUIDv5', () => {
    const id = uuidV5(NAMESPACE_DNS, 'anything');
    // 15-й hex-символ (индекс 14 без дефисов) — версия, обязана быть '5'.
    const hex = id.replaceAll('-', '');
    expect(hex[12]).toBe('5');
    // Вариант RFC 4122: старшие два бита 17-го hex-символа — '10' → символ ∈ {8,9,a,b}.
    expect(['8', '9', 'a', 'b']).toContain(hex[16]);
  });

  it('результат — синтаксически валидный UUID (проходит asUuid)', () => {
    expect(() => asUuid(uuidV5(NAMESPACE_DNS, 'x'))).not.toThrow();
  });
});

describe('деривация id повторов (конспект §4, 02§13)', () => {
  const seriesId = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001');

  it('deriveOccurrenceId детерминирован по (series_id, occurrence_seq)', () => {
    const seq = makeOccurrenceSeq(3n);
    expect(deriveOccurrenceId(seriesId, seq)).toBe(deriveOccurrenceId(seriesId, seq));
  });

  it('deriveOccurrenceId — два офлайн-устройства с одинаковым occurrence_seq сходятся на одном id', () => {
    // Симуляция: два независимых "устройства" вычисляют id одного и того же
    // следующего occurrence одной и той же серии — не должно быть дубля.
    const seq = makeOccurrenceSeq(7n);
    const deviceA = deriveOccurrenceId(seriesId, seq);
    const deviceB = deriveOccurrenceId(seriesId, seq);
    expect(deviceA).toBe(deviceB);
  });

  it('deriveOccurrenceId различает соседние occurrence_seq одной серии', () => {
    const seqA = makeOccurrenceSeq(1n);
    const seqB = makeOccurrenceSeq(2n);
    expect(deriveOccurrenceId(seriesId, seqA)).not.toBe(deriveOccurrenceId(seriesId, seqB));
  });

  it('deriveSubtaskId и deriveChecklistItemId с одним stable_template_item_id дают разные id (разные префиксы name)', () => {
    const occurrenceId = deriveOccurrenceId(seriesId, makeOccurrenceSeq(1n));
    const subtask = deriveSubtaskId(occurrenceId, 'step-1');
    const checklist = deriveChecklistItemId(occurrenceId, 'step-1');
    expect(subtask).not.toBe(checklist);
  });

  it('deriveSubtaskId детерминирован и различает разные stable_template_item_id', () => {
    const occurrenceId = deriveOccurrenceId(seriesId, makeOccurrenceSeq(1n));
    expect(deriveSubtaskId(occurrenceId, 'a')).toBe(deriveSubtaskId(occurrenceId, 'a'));
    expect(deriveSubtaskId(occurrenceId, 'a')).not.toBe(deriveSubtaskId(occurrenceId, 'b'));
  });

  it('checklist_id вложен в namespace occurrence_id, а не series_id — разные occurrence не пересекаются', () => {
    const occurrenceA = deriveOccurrenceId(seriesId, makeOccurrenceSeq(1n));
    const occurrenceB = deriveOccurrenceId(seriesId, makeOccurrenceSeq(2n));
    expect(deriveChecklistItemId(occurrenceA, 'item')).not.toBe(
      deriveChecklistItemId(occurrenceB, 'item'),
    );
  });
});
