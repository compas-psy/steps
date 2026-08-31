/**
 * `Icon` — React-обёртка над framework-agnostic слоем `src/icons/` (E03.0:
 * контур — данные, список `IconPrimitive`, не JSX). `renderIconMarkup` там
 * же отдаёт строку markup для сценариев без React; здесь тот же реестр и та
 * же геометрия один раз превращаются в настоящие SVG-элементы React — любой
 * компонент этого пакета обязан идти через `Icon`, а не собирать `<svg>`
 * заново (иначе перевод `IconPrimitive → JSX` продублируется по каждому
 * месту использования, как предупреждает комментарий в `icons/index.ts`).
 *
 * Доступность (§15): по умолчанию иконка декоративна (`aria-hidden`, как и
 * в `renderIconMarkup`) — смысл несёт соседний текст. Если иконка —
 * единственный носитель смысла (например, внутри `IconButton`), доступное
 * имя передаётся через `label`, и `role="img"` ставится автоматически —
 * тот же контракт, что и `RenderIconOptions`. Сам пакет не хранит текстовых
 * подписей иконок (ТЗ §3) — `label` это ответственность вызывающего кода
 * (`packages/app` + `packages/i18n`).
 */
import type { ReactElement } from 'react';

import {
  ICON_DEFAULT_SIZE,
  ICON_STROKE_LINECAP,
  ICON_STROKE_LINEJOIN,
  ICON_STROKE_WIDTH,
  ICON_VIEW_BOX,
  getIconPrimitives,
  type IconName,
} from '../icons/index.js';
import type { IconPrimitive } from '../icons/types.js';

export interface IconProps {
  /** Имя иконки из реестра `src/icons/` (38 штук, E03.0). */
  readonly name: IconName;
  /** Сторона квадрата в px. По умолчанию — `ICON_DEFAULT_SIZE` (24). */
  readonly size?: number;
  /** Доступное имя — см. заголовок файла. Не задано → иконка декоративна. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * `primitive.transform` и `rect.rx` необязательны (`IconPrimitive`,
 * `icons/types.ts`). При `exactOptionalPropertyTypes` (ТЗ, `tsconfig.base.json`)
 * ключ со значением `undefined` — не то же самое, что отсутствующий ключ:
 * присвоение `undefined` в необязательный JSX-атрибут не проходит проверку
 * типов. Условный spread ниже добавляет ключ, только когда значение реально
 * есть — так конкретные примитивы (большинство без `transform`) не тащат
 * лишний атрибут ни в разметке, ни в типах.
 */
function renderPrimitive(primitive: IconPrimitive, key: number): ReactElement {
  const transformProps =
    primitive.transform !== undefined ? { transform: primitive.transform } : {};
  switch (primitive.tag) {
    case 'path':
      return <path key={key} d={primitive.d} {...transformProps} />;
    case 'circle':
      return (
        <circle key={key} cx={primitive.cx} cy={primitive.cy} r={primitive.r} {...transformProps} />
      );
    case 'line':
      return (
        <line
          key={key}
          x1={primitive.x1}
          y1={primitive.y1}
          x2={primitive.x2}
          y2={primitive.y2}
          {...transformProps}
        />
      );
    case 'rect': {
      const rxProps = primitive.rx !== undefined ? { rx: primitive.rx } : {};
      return (
        <rect
          key={key}
          x={primitive.x}
          y={primitive.y}
          width={primitive.width}
          height={primitive.height}
          {...rxProps}
          {...transformProps}
        />
      );
    }
    case 'polyline':
      return <polyline key={key} points={primitive.points} {...transformProps} />;
    case 'polygon':
      return <polygon key={key} points={primitive.points} {...transformProps} />;
  }
}

export function Icon({
  name,
  size = ICON_DEFAULT_SIZE,
  label,
  className,
}: IconProps): ReactElement {
  const primitives = getIconPrimitives(name);
  const a11yProps =
    label !== undefined
      ? { role: 'img' as const, 'aria-label': label }
      : { 'aria-hidden': true as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={ICON_VIEW_BOX}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap={ICON_STROKE_LINECAP}
      strokeLinejoin={ICON_STROKE_LINEJOIN}
      className={className}
      {...a11yProps}
    >
      {primitives.map((primitive, index) => renderPrimitive(primitive, index))}
    </svg>
  );
}
