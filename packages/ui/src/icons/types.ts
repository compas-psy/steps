/**
 * Иконка — данные, а не React-компонент (ТЗ E03.0): контур описывается
 * как список примитивных SVG-элементов, а не JSX/строка markup. Это даёт
 * один способ проверить весь набор автоматически (viewBox, толщина
 * обводки, отсутствие заливки — см. `test/icons/`) и не привязывает
 * `packages/ui` к конкретному UI-фреймворку — пакет их не содержит.
 *
 * Форма примитива намеренно узкая: только то подмножество SVG, которого
 * достаточно для одного линейного семейства (round caps/joins, без
 * заливки, `04_UI_DESIGN_SYSTEM.md` §12). `transform` разрешён точечно —
 * он нужен единственному иконке `link` для двух повёрнутых на 45°
 * капсул — но сам по себе не задаёт цвет и не нарушает адгезию.
 */

interface IconPrimitiveBase {
  readonly transform?: string;
}

export type IconPrimitive = IconPrimitiveBase &
  (
    | { readonly tag: 'path'; readonly d: string }
    | { readonly tag: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
    | {
        readonly tag: 'line';
        readonly x1: number;
        readonly y1: number;
        readonly x2: number;
        readonly y2: number;
      }
    | {
        readonly tag: 'rect';
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly rx?: number;
      }
    | { readonly tag: 'polyline'; readonly points: string }
    | { readonly tag: 'polygon'; readonly points: string }
  );

/**
 * Одна запись реестра: имя — обычный английский идентификатор (не
 * продуктовая строка, ТЗ §3 запрещает пользовательский текст в
 * `packages/ui`), контур — список примитивов в порядке отрисовки.
 *
 * Массив, а не объект `{ [name]: primitives }` — литерал объекта в JS
 * молча схлопывает повторяющийся ключ (последнее определение побеждает
 * без единого предупреждения), и тест на уникальность имён тогда не
 * может упасть на настоящей ошибке копипаста. Массив такую запись
 * сохраняет, и `test/icons/registry.test.ts` реально её ловит.
 */
export interface IconDefinition {
  readonly name: string;
  readonly primitives: readonly IconPrimitive[];
}
