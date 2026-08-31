import {
  ICON_DEFAULT_SIZE,
  ICON_STROKE_LINECAP,
  ICON_STROKE_LINEJOIN,
  ICON_STROKE_WIDTH,
  ICON_VIEW_BOX,
} from './constants.js';
import { ICON_REGISTRY, type IconName } from './contours.js';
import type { IconPrimitive } from './types.js';

/**
 * Доступность (`04_UI_DESIGN_SYSTEM.md` §15): иконка сама по себе
 * декоративна и по умолчанию скрыта от скринридера (`aria-hidden`).
 * Если она несёт смысл сама по себе (не рядом с подписанной кнопкой) —
 * доступное имя передаётся снаружи через `label`; пакет не хранит
 * никаких имён иконок как пользовательских строк (ТЗ §3), `label` —
 * обязанность вызывающего кода из `packages/app` и его каталога
 * `packages/i18n`.
 */
export interface RenderIconOptions {
  /** Сторона квадрата в px для `width`/`height`. По умолчанию 24. */
  readonly size?: number;
  /** Доступное имя. Задано — иконка становится `role="img"` с этим
   * именем; не задано — иконка декоративна (`aria-hidden="true"`). */
  readonly label?: string;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function serializePrimitive(el: IconPrimitive): string {
  const transform = el.transform !== undefined ? ` transform="${escapeAttr(el.transform)}"` : '';
  switch (el.tag) {
    case 'path':
      return `<path d="${escapeAttr(el.d)}"${transform}/>`;
    case 'circle':
      return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}"${transform}/>`;
    case 'line':
      return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}"${transform}/>`;
    case 'rect': {
      const rx = el.rx !== undefined ? ` rx="${el.rx}"` : '';
      return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"${rx}${transform}/>`;
    }
    case 'polyline':
      return `<polyline points="${escapeAttr(el.points)}"${transform}/>`;
    case 'polygon':
      return `<polygon points="${escapeAttr(el.points)}"${transform}/>`;
  }
}

/** Список примитивов контура — для потребителей, которые строят
 * элементы сами (например React в `packages/app`) вместо парсинга
 * markup-строки. Бросает на неизвестное имя: при строгой типизации
 * `IconName` это недостижимо, но реестр может прийти из динамического
 * источника (не проверенного компилятором значения). */
export function getIconPrimitives(name: IconName): readonly IconPrimitive[] {
  const primitives = ICON_REGISTRY[name];
  if (primitives === undefined) {
    throw new Error(`Неизвестная иконка: "${name}"`);
  }
  return primitives;
}

/**
 * Рендерит иконку в строку SVG-markup. Фреймворк-независимо: пакет не
 * зависит от React (её нет в `package.json` этого пакета, и добавлять
 * зависимости в рамках E03.0 нельзя) — строку можно вставить как есть
 * (`innerHTML`) или распарсить в любом слое выше.
 */
export function renderIconMarkup(name: IconName, options: RenderIconOptions = {}): string {
  const primitives = getIconPrimitives(name);
  const size = options.size ?? ICON_DEFAULT_SIZE;
  const a11yAttrs =
    options.label !== undefined
      ? `role="img" aria-label="${escapeAttr(options.label)}"`
      : 'aria-hidden="true"';

  const body = primitives.map(serializePrimitive).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEW_BOX}" width="${size}" height="${size}" ` +
    `fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" ` +
    `stroke-linecap="${ICON_STROKE_LINECAP}" stroke-linejoin="${ICON_STROKE_LINEJOIN}" ${a11yAttrs}>` +
    `${body}</svg>`
  );
}
