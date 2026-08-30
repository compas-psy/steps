/**
 * `@shagi/nlp` — детерминированный русский парсер для Quick Add (SPEC/00 §0,
 * раздел «Baseline stack»: цели R1 включают «deterministic Russian NLP»).
 *
 * Парсер детерминирован по определению: одинаковый ввод — одинаковый
 * результат, без обращения к сети или ML-инференсу. Результат разбора —
 * это черновик `CreateTaskCommand` (см. `@shagi/core`), а не прямая
 * мутация домена.
 */
export const PACKAGE_NAME = '@shagi/nlp' as const;
