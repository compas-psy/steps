import { describe, expect, it } from 'vitest';

import { ICON_NAMES } from '../../src/icons/contours.js';
import { renderIconMarkup } from '../../src/icons/render.js';

/**
 * `04_UI_DESIGN_SYSTEM.md` §15 (accessibility, release blocker): «icon
 * button accessible names». Принцип из задания E03.0: иконка сама по
 * себе декоративна и обязана быть скрыта от скринридера; если она
 * несёт смысл — доступное имя приходит снаружи, не из пакета (`packages
 * /ui` не хранит пользовательских строк, ТЗ §3 — имя иконки остаётся
 * английским идентификатором реестра, не переводом).
 */
describe('доступность — decorative by default', () => {
  it('без label иконка aria-hidden и не претендует на роль img', () => {
    for (const name of ICON_NAMES) {
      const markup = renderIconMarkup(name);
      expect(markup, name).toContain('aria-hidden="true"');
      expect(markup, name).not.toContain('role="img"');
      expect(markup, name).not.toContain('aria-label');
    }
  });

  it('с label иконка становится role="img" с этим именем, не декоративна', () => {
    const markup = renderIconMarkup('delete', { label: 'Удалить задачу' });
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Удалить задачу"');
    expect(markup).not.toContain('aria-hidden');
  });

  it('label экранируется — не ломает markup спецсимволами', () => {
    const markup = renderIconMarkup('close', { label: 'Закрыть "черновик" & выйти' });
    expect(markup).toContain('aria-label="Закрыть &quot;черновик&quot; &amp; выйти"');
    // markup остаётся одним корректным <svg>...</svg> без утёкших кавычек.
    expect(markup.match(/<svg /g)?.length).toBe(1);
  });

  it('пакет не хранит переводов имён иконок — label это ответственность вызывающего кода', () => {
    // Сам реестр не содержит поля вроде `label`/`title` — имя иконки
    // это только английский идентификатор `IconName`.
    const markup = renderIconMarkup('star');
    expect(markup).not.toMatch(/[а-яё]/i);
  });
});
