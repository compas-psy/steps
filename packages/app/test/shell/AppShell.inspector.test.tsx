/**
 * Inspector — карточка задачи справа на десктопе (SPEC/04 §8 «Desktop:
 * inspector 360–440», §9 «Task opens right Inspector desktop; mobile
 * compact sheet → full detail»).
 *
 * Что здесь проверяется и почему именно это: до Inspector'а клик по задаче
 * на десктопе уводил на полноэкранный `taskDetail`, то есть список
 * исчезал — ровно тот «full-page mobile TaskDetail», который владелец
 * забраковал. Поэтому тест смотрит не на классы, а на два факта разом:
 * карточка открыта И список никуда не делся. Проверка одной только карточки
 * прошла бы и на полноэкранном варианте.
 *
 * Мобильная раскладка обязана остаться прежней: там карточка занимает весь
 * экран, и Inspector'а нет.
 */
import { render, screen } from '@testing-library/react';
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

function setViewportWidth(width: number): void {
  const happy = (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } })
    .happyDOM;
  act(() => {
    happy.setViewport({ width });
  });
}

/** Дерево ровно то же, что рисует `App.tsx`: оболочка получает КОМПОНЕНТ
 * текущего экрана. Здесь вместо настоящего `TaskDetail` — маркер: тест про
 * раскладку оболочки, а не про содержимое карточки, и настоящий экран
 * потребовал бы хранилища с задачей. */
function renderTaskDetail(returnScreen: ScreenId | null): void {
  const controller = createAppController({
    screen: 'taskDetail',
    selectedTaskId: null,
    returnScreen,
  });
  render(
    <AppProvider host={testHost()} controller={controller}>
      <AppShell>
        <div data-testid="task-detail">карточка задачи</div>
      </AppShell>
    </AppProvider>,
  );
}

describe('Inspector на десктопе (>=1024)', () => {
  it.each([1280, 1440, 1920])(
    'на ширине %s карточка открыта справа, а экран, с которого пришли, остался',
    (width) => {
      setViewportWidth(width);
      renderTaskDetail('todayEmpty');

      const inspector = screen.getByRole('complementary', {
        name: t('shell', 'inspector.label'),
      });
      // Карточка живёт ВНУТРИ панели, а не вместо списка.
      expect(inspector).toContainElement(screen.getByTestId('task-detail'));

      // И главное: список никуда не делся. `Today` рисует свой заголовок —
      // если бы карточка заняла рабочую колонку, его бы не было.
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('main').textContent).not.toBe('карточка задачи');
    },
  );

  it('сайдбар остаётся на месте, пока открыта карточка', () => {
    setViewportWidth(1440);
    renderTaskDetail('todayEmpty');

    expect(screen.getByRole('button', { name: t('shell', 'nav.projects') })).toBeInTheDocument();
  });

  it('без экрана возврата панель не открывается — пустой колонке взяться неоткуда', () => {
    setViewportWidth(1440);
    renderTaskDetail(null);

    expect(screen.queryByRole('complementary', { name: t('shell', 'inspector.label') })).toBeNull();
    // Карточка при этом на экране есть — просто во всю рабочую колонку.
    expect(screen.getByTestId('task-detail')).toBeInTheDocument();
  });
});

describe('мобильная раскладка (<1024) карточку в панель НЕ уводит', () => {
  it.each([360, 390, 412])('на ширине %s панели нет, карточка на весь экран', (width) => {
    setViewportWidth(width);
    renderTaskDetail('todayEmpty');

    expect(screen.queryByRole('complementary', { name: t('shell', 'inspector.label') })).toBeNull();
    expect(screen.getByTestId('task-detail')).toBeInTheDocument();
    // И экрана, с которого пришли, на мобильном быть не должно: он был бы
    // вторым списком под карточкой.
    expect(screen.queryByRole('main')).toBeNull();
  });
});
