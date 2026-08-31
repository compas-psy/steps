/**
 * Общий контролируемый enum цвета маркера — `ProjectRow` (маркер проекта) и
 * `Label` (опциональный маркер метки) ссылаются на одну и ту же палитру
 * (`04_UI_DESIGN_SYSTEM.md` §4.1 «R1 Project marker palette»: «Controlled
 * tokens only: forest, gold, blue, violet, orange, red, neutral/sage... No
 * arbitrary color picker in R1»). Тип вынесен в общий модуль, а не
 * продублирован в обоих компонентах, чтобы палитра не могла разойтись
 * между `ProjectRow` и `Label` при будущей правке одного файла без другого.
 *
 * Значения — не hex, а controlled union: любое значение вне списка не
 * компилируется. Цвет-пикер (свободный hex/rgb) в R1 не предусмотрен —
 * это продуктовое решение спеки, не техническое ограничение компонента.
 */
export const MARKER_COLORS = [
  'forest',
  'gold',
  'blue',
  'violet',
  'orange',
  'red',
  'neutral',
] as const;

export type MarkerColor = (typeof MARKER_COLORS)[number];
