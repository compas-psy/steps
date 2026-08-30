import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { App, type AppHost } from '../src/index.js';
import { createUnavailablePlatform } from '@shagi/platform';

describe('App', () => {
  it('рендерит ровно один корневой узел с крючком для smoke-теста оболочки, без текста', () => {
    const host: AppHost = { platform: createUnavailablePlatform() };
    // Компонент — чистая функция без хуков, вызвать напрямую и посмотреть
    // на возвращённый React-элемент дешевле, чем поднимать DOM-рендерер
    // ради одного div (в этом пакете работ его и не поднять — окружение
    // vitest здесь `node`, без DOM).
    const rendered = App({ host }) as ReactElement<Record<string, unknown>, string>;

    expect(rendered.type).toBe('div');
    expect(rendered.props['data-shagi-app-root']).toBe('');
    // Ни детей, ни текста — экранов нет до E04 (SPEC §3).
    expect(rendered.props['children']).toBeUndefined();
  });
});
