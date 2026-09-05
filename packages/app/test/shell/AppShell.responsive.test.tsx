/**
 * Раскладка оболочки на РАЗНЫХ вьюпортах — отдельный файл от
 * `AppShell.test.tsx` (там проверяется поведение мобильной навигации, здесь
 * — сам факт, что десктоп это другой продукт, а не растянутый телефон).
 *
 * Почему проверяется не «есть ли класс», а состав достижимых действий:
 * владелец установил Windows-сборку, увидел мобильную нижнюю полосу на
 * 1920px и сказал, что зелёный CI перестал быть доказательством. Тест,
 * который смотрит на `className`, прошёл бы и на растянутом мобильном
 * вьюпорте — он проверяет разметку, а не то, ЧТО пользователь может
 * сделать. Поэтому здесь: на широком экране пользователь может уйти в
 * «Настройки»/«Входящие»/«Завершённые» из постоянного сайдбара, а
 * центральной кнопки нижней навигации не существует вовсе; на узком —
 * ровно наоборот.
 *
 * `happyDOM.setViewport` — настоящее изменение ширины окна (пересчитывается
 * и `window.innerWidth`, и `matchMedia(...).matches`), поэтому последний
 * блок проверяет ЖИВОЕ переключение раскладки на одном и том же
 * смонтированном дереве, а не два независимых рендера. Про то, почему
 * подписка в `use-desktop-viewport.ts` слушает ещё и `resize`, — см. её
 * заголовок: событие `change` медиазапроса happy-dom шлёт только при
 * расширении окна.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController, type ScreenId } from '../../src/state/store.js';
import { AppShell } from '../../src/shell/AppShell.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/** Ширины из критериев приёмки: 1280/1440/1920 — десктоп, 360/390/412 —
 * Android (мобильная раскладка обязана остаться мобильной). */
function setViewportWidth(width: number): void {
  const happy = (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } })
    .happyDOM;
  act(() => {
    happy.setViewport({ width });
  });
}

function renderShell(screenId: ScreenId = 'todayEmpty'): ReturnType<typeof createAppController> {
  const controller = createAppController({ screen: screenId });
  render(
    <AppProvider host={testHost()} controller={controller}>
      <AppShell>
        <div data-testid="content">контент</div>
      </AppShell>
    </AppProvider>,
  );
  return controller;
}

describe('AppShell — десктопная раскладка (>=1024)', () => {
  it.each([1280, 1440, 1920])('на ширине %i нижней навигации нет вовсе', (width) => {
    setViewportWidth(width);
    renderShell();

    // Центральная кнопка — единственный элемент, который есть ТОЛЬКО у
    // нижней навигации: её отсутствие означает, что `BottomNav` не
    // отрендерен, а не что он спрятан стилями.
    expect(screen.queryByRole('button', { name: t('shell', 'nav.quickAdd') })).toBeNull();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it.each([1280, 1440, 1920])(
    'на ширине %i постоянный сайдбар даёт разделы, которых нижняя навигация не даёт',
    (width) => {
      setViewportWidth(width);
      renderShell();

      expect(screen.getByRole('navigation', { name: t('shell', 'nav.label') })).toBeInTheDocument();
      for (const key of [
        'nav.today',
        'nav.plan',
        'nav.inbox',
        'nav.projects',
        'nav.search',
      ] as const) {
        expect(screen.getByRole('button', { name: t('shell', key) })).toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: t('shell', 'nav.completed') })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: t('shell', 'nav.settings') })).toBeInTheDocument();
    },
  );

  it('клик по «Входящие» в сайдбаре реально уводит на экран inbox', async () => {
    setViewportWidth(1440);
    const user = userEvent.setup();
    const controller = renderShell();

    await user.click(screen.getByRole('button', { name: t('shell', 'nav.inbox') }));

    expect(controller.getState().screen).toBe('inbox');
  });

  it('кнопка «Новая задача» в сайдбаре открывает Quick Add с происхождением текущего экрана', async () => {
    setViewportWidth(1440);
    const user = userEvent.setup();
    const controller = renderShell('todayEmpty');

    await user.click(screen.getByRole('button', { name: t('shell', 'sidebar.quickAdd') }));

    expect(controller.getState().quickAdd).toEqual({ origin: 'today' });
  });

  it('сайдбар остаётся и на экране, который на мобильном идёт без навигации (Настройки)', () => {
    setViewportWidth(1440);
    renderShell('settings');

    expect(screen.getByRole('navigation', { name: t('shell', 'nav.label') })).toBeInTheDocument();
  });
});

describe('AppShell — мобильная раскладка (<1024) остаётся мобильной', () => {
  it.each([360, 390, 412])('на ширине %i нижняя навигация на месте, сайдбара нет', (width) => {
    setViewportWidth(width);
    renderShell();

    expect(screen.getByRole('button', { name: t('shell', 'nav.quickAdd') })).toBeInTheDocument();
    // Разделы, которые есть только в сайдбаре, на мобильном недостижимы —
    // значит отрендерена именно нижняя навигация, а не сайдбар.
    expect(screen.queryByRole('button', { name: t('shell', 'nav.settings') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('shell', 'sidebar.quickAdd') })).toBeNull();
  });

  it('на мобильном экран без нижней навигации (Настройки) не получает и сайдбара', () => {
    setViewportWidth(390);
    renderShell('settings');

    expect(screen.queryByRole('navigation', { name: t('shell', 'nav.label') })).toBeNull();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});

describe('AppShell — переключение раскладки при изменении ширины окна', () => {
  it('окно растянули с 390 до 1440: нижняя навигация исчезает, сайдбар появляется', () => {
    setViewportWidth(390);
    renderShell();

    expect(screen.getByRole('button', { name: t('shell', 'nav.quickAdd') })).toBeInTheDocument();

    setViewportWidth(1440);

    expect(screen.queryByRole('button', { name: t('shell', 'nav.quickAdd') })).toBeNull();
    expect(screen.getByRole('button', { name: t('shell', 'nav.settings') })).toBeInTheDocument();
  });

  it('окно сузили с 1440 до 390: сайдбар исчезает, нижняя навигация возвращается', () => {
    setViewportWidth(1440);
    renderShell();

    expect(screen.getByRole('button', { name: t('shell', 'nav.settings') })).toBeInTheDocument();

    setViewportWidth(390);

    expect(screen.queryByRole('button', { name: t('shell', 'nav.settings') })).toBeNull();
    expect(screen.getByRole('button', { name: t('shell', 'nav.quickAdd') })).toBeInTheDocument();
  });
});
