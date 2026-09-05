import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createUnavailablePlatform } from '@shagi/platform';
import { LEGAL_DOCUMENTS } from '@shagi/legal';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { PrivacyPolicyScreen, UserAgreementScreen } from '../../src/screens/LegalDocument.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/**
 * `05§14`: два отдельных документа с неизменяемыми версиями и хешами.
 *
 * Главное, что здесь проверяется, — документ виден БЕЗ СЕТИ. Тест и не
 * может выйти в сеть: `createUnavailablePlatform()` не даёт ни одной
 * сетевой возможности, а текст приходит из бандла (`@shagi/legal`).
 * Если однажды кто-то заменит бандл на загрузку по ссылке, этот тест
 * покраснеет — ровно за то, ради чего написан.
 */
describe('Экраны юридических документов (05§14)', () => {
  const cases = [
    ['privacy-policy', PrivacyPolicyScreen] as const,
    ['user-agreement', UserAgreementScreen] as const,
  ];

  for (const [id, Screen] of cases) {
    const document = LEGAL_DOCUMENTS.find((entry) => entry.id === id)!;

    it(`${id}: показывает заголовок, версию и SHA-256 из бандла`, () => {
      render(
        <AppProvider host={testHost()}>
          <Screen />
        </AppProvider>,
      );

      expect(screen.getByRole('heading', { name: document.title })).toBeInTheDocument();
      expect(screen.getByText(new RegExp(document.version))).toBeInTheDocument();
      expect(screen.getByText(new RegExp(document.sha256))).toBeInTheDocument();
    });

    it(`${id}: показывает сам текст документа, а не заглушку`, () => {
      const { container } = render(
        <AppProvider host={testHost()}>
          <Screen />
        </AppProvider>,
      );

      const body = container.querySelector('.shagi-legal__body');
      expect(body?.textContent ?? '').toBe(document.body);
    });

    it(`${id}: «Назад» возвращает в «Данные и конфиденциальность»`, async () => {
      const user = userEvent.setup();
      const controller = createAppController({ screen: 'legalPrivacyPolicy' });
      render(
        <AppProvider host={testHost()} controller={controller}>
          <Screen />
        </AppProvider>,
      );

      await user.click(screen.getAllByRole('button')[0]!);
      expect(controller.getState().screen).toBe('dataPrivacy');
    });
  }
});
