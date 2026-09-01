/**
 * `OfflineBanner` — M39 (`12_SCREEN_STATE_MATRIX.md`: "Offline — explicitly
 * local work continues"). Подписывается на `PlatformCapabilitiesRegistry.
 * networkStatus` — порт уже полностью реализован во всех трёх оболочках
 * (`apps/web/src/platform.ts`, `apps/desktop/...`, `apps/mobile/...`, все
 * три через `navigator.onLine`/события `online`/`offline`) — здесь только
 * подписка и рендер, без дублирования платформенной логики определения
 * сети. `isAvailable`-заслон — тот же приём, что `useBootstrapLocalDb`
 * (`App.tsx`): `Unavailable` — честный ответ "этой возможности здесь нет",
 * баннер просто не показывается, не падает и не изображает мнимую
 * уверенность в состоянии сети, которого не знает.
 *
 * Текст — уже существующий (до этой правки неиспользуемый) ключ каталога
 * `common.sync.offline` (`01§23` "Sync UX": "Offline copy explicitly says
 * local work continues") — не выдумывается заново под эту задачу.
 *
 * Монтируется в `Bootstrap` (`App.tsx`), не в `AppShell`: виден на ЛЮБОМ
 * экране (онбординг/Task Detail/Quick Add — не только «главные» вкладки).
 * "Explicitly" в тексте правила означает "не пропадает, стоит открыть
 * что-то кроме Today/Projects/Plan/Search" — `AppShell` этого не даёт,
 * он оборачивает только `MAIN_TAB_SCREENS`.
 *
 * Иконка `Offline` (`@shagi/ui`) уже несёт `role="status"`+`aria-label` —
 * второй, видимый span с тем же текстом помечен `aria-hidden`, чтобы
 * скринридер не озвучивал одну и ту же строку дважды (через иконку и
 * через текст).
 */
import { useEffect, useState, type ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { isAvailable, type PlatformCapabilitiesRegistry } from '@shagi/platform';
import { Offline } from '@shagi/ui';

export interface OfflineBannerProps {
  readonly networkStatus: PlatformCapabilitiesRegistry['networkStatus'];
}

export function OfflineBanner({ networkStatus }: OfflineBannerProps): ReactElement | null {
  const [isOnline, setIsOnline] = useState(() =>
    isAvailable(networkStatus) ? networkStatus.isOnline() : true,
  );

  useEffect(() => {
    if (!isAvailable(networkStatus)) return;
    setIsOnline(networkStatus.isOnline());
    return networkStatus.onChange(setIsOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `networkStatus` — стабильный объект от вызывающей оболочки (тот же приём, что `useBootstrapLocalDb`)
  }, []);

  if (!isAvailable(networkStatus) || isOnline) return null;

  const label = t('common', 'sync.offline');
  return (
    <div>
      <Offline label={label} />
      <span aria-hidden="true">{label}</span>
    </div>
  );
}
