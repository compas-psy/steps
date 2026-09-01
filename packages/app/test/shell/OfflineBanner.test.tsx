import { render, screen } from '@testing-library/react';
import { act } from 'react';
import type { PlatformCapabilitiesRegistry } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { describe, expect, it } from 'vitest';

import { OfflineBanner } from '../../src/shell/OfflineBanner.js';

/** Управляемый фейк `networkStatus` (M39) — `isOnline()` читает текущее
 * состояние, `setOnline` меняет его и уведомляет подписчиков, тот же
 * контракт, что настоящие реализации в `apps/web/src/platform.ts` (и
 * аналогичных файлах `apps/desktop`/`apps/mobile`). */
function fakeNetworkStatus(initial: boolean): {
  readonly port: PlatformCapabilitiesRegistry['networkStatus'];
  readonly setOnline: (online: boolean) => void;
} {
  let online = initial;
  const handlers = new Set<(isOnline: boolean) => void>();
  return {
    port: {
      isOnline: () => online,
      onChange(handler) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    },
    setOnline(next) {
      online = next;
      for (const handler of handlers) handler(next);
    },
  };
}

describe('OfflineBanner (M39)', () => {
  it('онлайн — баннер не рендерится вообще', () => {
    const { port } = fakeNetworkStatus(true);
    render(<OfflineBanner networkStatus={port} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('офлайн — баннер виден с честным текстом «нет соединения»', () => {
    const { port } = fakeNetworkStatus(false);
    render(<OfflineBanner networkStatus={port} />);
    expect(screen.getByRole('status')).toHaveAccessibleName(t('common', 'sync.offline'));
  });

  it('живая смена сети (offline→online→offline) обновляет баннер без перемонтирования', () => {
    const { port, setOnline } = fakeNetworkStatus(true);
    render(<OfflineBanner networkStatus={port} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => setOnline(false));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => setOnline(true));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('`Unavailable` (платформа не даёт networkStatus) — баннер не показывается, не падает', () => {
    render(<OfflineBanner networkStatus={{ kind: 'unavailable', reason: 'test' }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
