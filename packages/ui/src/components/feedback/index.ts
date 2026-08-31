/**
 * Барель подкаталога `feedback/` (E03.3 «оверлейные и feedback-компоненты»,
 * §10 «Feedback»: Toast, UndoToast, EmptyState, Loading, Error, Offline,
 * SyncState — «Error» здесь называется `ErrorState`, см. заголовок файла
 * `ErrorState.tsx`).
 *
 * Публичный API пакета остаётся единой точкой `packages/ui/src/index.ts` —
 * этот файл реэкспортируется оттуда через `components/index.ts` (сведение
 * барелей — на приёмке пакета работ, не здесь).
 */

export { EmptyState, type EmptyStateProps } from './EmptyState.js';
export { ErrorState, type ErrorStateProps } from './ErrorState.js';
export { Loading, type LoadingProps } from './Loading.js';
export { Offline, type OfflineProps } from './Offline.js';
export { SyncState, type SyncStateProps, type SyncStateStatus } from './SyncState.js';
export { Toast, type ToastProps, type ToastVariant } from './Toast.js';
export { UndoToast, type UndoToastProps } from './UndoToast.js';
