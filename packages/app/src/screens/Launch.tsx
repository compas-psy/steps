/**
 * `Launch` — M01 (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`): «local/offline
 * startup; no auth wall; no fake loader after local DB ready».
 *
 * Ничего не рендерит и ничего не ждёт асинхронно: `useStorage()` в
 * `state/context.tsx` уже мемоизирован в `AppProvider` и построен ДО того,
 * как этот компонент вообще успевает смонтироваться (`AppProvider` вызывает
 * `resolveStorageBackend` синхронно в теле рендера, ещё выше по дереву, чем
 * `<Bootstrap>`/`<Screens>`) — сам факт, что `Launch` смонтирован, уже
 * означает «локальное хранилище готово». Поэтому здесь нет ни спиннера, ни
 * условного рендера по какому-то `ready`-флагу — переход на `welcome`
 * происходит немедленно в эффекте после первого коммита, без ожидания.
 */
import { useEffect, type ReactElement } from 'react';

import { useAppController } from '../state/context.js';

export function Launch(): ReactElement | null {
  const controller = useAppController();

  useEffect(() => {
    controller.goTo('welcome');
  }, [controller]);

  return null;
}
