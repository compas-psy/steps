import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { NlpOnboarding } from '../../src/screens/NlpOnboarding.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

describe('NlpOnboarding (M05)', () => {
  it('на предзаполненном примере (золотой корпус combined-01) показывает все шесть распознанных категорий', () => {
    const { container } = render(
      <AppProvider host={testHost()}>
        <NlpOnboarding />
      </AppProvider>,
    );

    expect(
      screen.getByText(t('onboarding', 'nlp.chip.project', { name: 'семья' })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('onboarding', 'nlp.chip.label', { name: 'важное' })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('onboarding', 'nlp.chip.priority', { level: 2 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('onboarding', 'nlp.chip.duration', { minutes: 20 })),
    ).toBeInTheDocument();

    // date + time + duration + project + label + priority — 6 категорий, как в
    // золотом кейсе `combined-01`.
    expect(container.querySelectorAll('.shagi-nlp-token')).toHaveLength(6);
  });

  it('не содержит маркетингового «ИИ»/AI-языка (M05: демонстрация, не AI-маркетинг)', () => {
    render(
      <AppProvider host={testHost()}>
        <NlpOnboarding />
      </AppProvider>,
    );

    const text = document.body.textContent ?? '';
    expect(text.toLowerCase()).not.toMatch(/\bai\b|искусственн\w*\s+интеллект|умн(ый|ая|ое)/i);
  });

  it('живой разбор реагирует на ввод — пустое поле показывает пустое состояние', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider host={testHost()}>
        <NlpOnboarding />
      </AppProvider>,
    );

    const input = screen.getByLabelText(t('onboarding', 'nlpOnboarding.inputLabel'));
    await user.clear(input);

    expect(screen.getByText(t('onboarding', 'nlpOnboarding.emptyState'))).toBeInTheDocument();
  });

  it('«Понятно» не падает и не требует несуществующего экрана M06 (эпик E06, не E04)', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider host={testHost()}>
        <NlpOnboarding />
      </AppProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: t('onboarding', 'nlpOnboarding.continueLabel') }),
    );
    // Экран остаётся смонтированным — клик не бросает и не требует маршрута,
    // которого ещё нет.
    expect(
      screen.getByRole('button', { name: t('onboarding', 'nlpOnboarding.continueLabel') }),
    ).toBeInTheDocument();
  });
});
