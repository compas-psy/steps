import { describe, expect, it } from 'vitest';

import { ICON_NAMES, ICON_REGISTRY } from '../../src/icons/contours.js';
import { getIconPrimitives, renderIconMarkup } from '../../src/icons/render.js';

describe('renderIconMarkup — общее поведение рендера', () => {
  it('по умолчанию width/height 24', () => {
    const markup = renderIconMarkup('add');
    expect(markup).toContain('width="24"');
    expect(markup).toContain('height="24"');
  });

  it('size меняет только width/height, не viewBox/stroke-width', () => {
    const markup = renderIconMarkup('add', { size: 32 });
    expect(markup).toContain('width="32"');
    expect(markup).toContain('height="32"');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('stroke-width="1.75"');
  });

  it('для каждой иконки реестра рендер не бросает и возвращает непустой markup', () => {
    for (const name of ICON_NAMES) {
      expect(() => renderIconMarkup(name)).not.toThrow();
      expect(renderIconMarkup(name).length).toBeGreaterThan(0);
    }
  });

  it('на неизвестное имя — понятная ошибка, а не тихий null/undefined-контур', () => {
    // Реестр типобезопасен (`IconName` — литеральный union из
    // `ICON_DEFINITIONS`), но потребитель может прийти с именем из
    // непроверенного компилятором источника (строка из конфига,
    // динамический маршрут) — рендер обязан упасть явно.
    expect(() => renderIconMarkup('nonexistent-icon' as never)).toThrow(/nonexistent-icon/);
  });
});

describe('getIconPrimitives — доступ к сырому контуру', () => {
  it('возвращает тот же массив примитивов, что хранит реестр', () => {
    for (const name of ICON_NAMES) {
      expect(getIconPrimitives(name)).toBe(ICON_REGISTRY[name]);
    }
  });

  it('на неизвестное имя бросает — не отдаёт undefined как валидный контур', () => {
    expect(() => getIconPrimitives('nonexistent-icon' as never)).toThrow();
  });
});
