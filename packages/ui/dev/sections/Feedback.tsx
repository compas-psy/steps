/**
 * Секция «Feedback» харнесса (E03.3) — EmptyState/ErrorState/Loading/
 * Offline/SyncState/Toast/UndoToast.
 */
import type { ReactElement } from 'react';

import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Loading,
  Offline,
  SyncState,
  Toast,
  UndoToast,
} from '../../src/components/index.js';
import { Example, HarnessSection } from './Example.js';

export function FeedbackSection(): ReactElement {
  return (
    <HarnessSection testId="section-feedback" title="Feedback">
      <Example testId="example-empty-state" label="С иконкой, описанием и действием">
        <EmptyState
          icon={<Icon name="inbox" size={32} />}
          title="На сегодня всё."
          description="Новые задачи появятся здесь по мере поступления."
          action={<Button variant="secondary">Добавить задачу</Button>}
        />
      </Example>

      <Example testId="example-error-state" label="С действием повтора">
        <ErrorState
          icon={<Icon name="warning" size={32} />}
          title="Не удалось загрузить список"
          description="Проверьте соединение и попробуйте снова."
          action={<Button variant="secondary">Повторить</Button>}
        />
      </Example>

      <Example testId="example-loading-text" label="С видимым текстом">
        <Loading size="md">Загрузка…</Loading>
      </Example>
      <Example testId="example-loading-label-only" label="Только доступное имя">
        <Loading size="md" label="Загрузка" />
      </Example>

      <Example testId="example-offline" label="Индикатор офлайн">
        <Offline label="Нет соединения" />
      </Example>

      <Example testId="example-sync-state" label="idle / syncing / error">
        <div className="dev-row">
          <SyncState status="idle" label="Синхронизировано" />
          <SyncState status="syncing" label="Синхронизация…" />
          <SyncState status="error" label="Ошибка синхронизации" />
        </div>
      </Example>

      <Example testId="example-toast-variants" label="default / success / error / warning">
        <div className="dev-stack">
          <Toast message="Задача добавлена" />
          <Toast message="Изменения сохранены" variant="success" icon="check" />
          <Toast
            message="Не удалось сохранить"
            variant="error"
            icon="warning"
            onDismiss={() => {}}
            dismissLabel="Закрыть уведомление"
          />
          <Toast message="Соединение нестабильно" variant="warning" icon="sync" />
        </div>
      </Example>

      <Example testId="example-undo-toast" label="Завершение + отмена">
        <UndoToast message="Задача выполнена" actionLabel="Отменить" onAction={() => {}} />
      </Example>
    </HarnessSection>
  );
}
