import { render } from '@testing-library/react';
import { createUnavailablePlatform } from '@shagi/platform';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Launch } from '../../src/screens/Launch.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

describe('Launch (M01)', () => {
  it('не рендерит видимый контент — никакого фейкового лоадера', () => {
    const { container } = render(
      <AppProvider host={testHost()}>
        <Launch />
      </AppProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('переходит на welcome немедленно после монтирования — storage уже готов к этому моменту', () => {
    const controller = createAppController();
    render(
      <AppProvider host={testHost()} controller={controller}>
        <Launch />
      </AppProvider>,
    );

    expect(controller.getState().screen).toBe('welcome');
  });
});
