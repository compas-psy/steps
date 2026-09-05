import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { Button, Toast } from '@shagi/ui';

/**
 * 6-секундное окно «Отменить» (ST §58, UI contract; `01§8` "Undo",
 * `01§9` "Delete"). Один общий хук на все экраны — иначе каждый экран
 * заводил бы собственный таймер и собственную защиту от двойного нажатия,
 * и они разошлись бы уже на втором.
 *
 * Что хук НЕ делает — и это главное: он не хранит снимок состояния и не
 * умеет ничего восстанавливать. Восстановление целиком живёт в доменных
 * командах (`undoCompleteTasksCommand`/`undoDeleteTasksCommand`/
 * `undoCompleteOccurrenceCommand`), которые пишут обратную мутацию через
 * ту же транзакцию и outbox, что и прямое действие. Здесь — только UX:
 * что показать, сколько показывать и как не применить откат дважды
 * (ST §58: «Нажатие Undo идемпотентно, применяет инверсию максимум один
 * раз»).
 */
export const UNDO_WINDOW_MS = 6_000;

/**
 * Чем закончился откат. `conflict` — не успех и не сбой: обратная мутация
 * прошла, но часть работы сохранена, потому что её изменили независимо
 * (`01§11.9` — сгенерированный следующий occurrence). Тост в этом случае
 * не должен делать вид, что всё вернулось.
 */
export type UndoOutcome = 'ok' | 'conflict' | 'failed';

export interface UndoOffer {
  /** Что произошло: «Задача удалена», «Завершено» и т.п. */
  readonly message: string;
  /** Обратная доменная мутация. Вызывается не более одного раза. */
  readonly undo: () => Promise<UndoOutcome>;
}

export interface UndoToastController {
  /** Активное предложение отката, `null` — тоста нет. */
  readonly offer: UndoOffer | null;
  /** Откат выполняется прямо сейчас (кнопка обязана быть заблокирована). */
  readonly running: boolean;
  /** Сообщение о конфликте или сбое отката — отдельная строка, не заменяет
   * `offer` собой: показывается ПОСЛЕ того, как тост закрылся. */
  readonly notice: string | null;
  offerUndo(offer: UndoOffer): void;
  runUndo(): Promise<void>;
  dismiss(): void;
  dismissNotice(): void;
}

export interface UndoToastMessages {
  /** `01§11.9`: следующий occurrence изменён независимо — сохранён. */
  readonly conflict: string;
  /** Обратная мутация не прошла. Молчать здесь нельзя: пользователь уверен,
   * что нажатие сработало. */
  readonly failed: string;
}

export function useUndoToast(messages: UndoToastMessages): UndoToastController {
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Защита от повторного применения. Именно `ref`, не `state`: два
   * быстрых нажатия попадают в один и тот же рендер, и проверка по
   * состоянию их не разделила бы — состояние обновится только к
   * следующему рендеру, а инверсия успела бы уйти в хранилище дважды. */
  const consumed = useRef(false);

  const offerUndo = useCallback((next: UndoOffer): void => {
    consumed.current = false;
    setNotice(null);
    setOffer(next);
  }, []);

  const dismiss = useCallback((): void => {
    setOffer(null);
  }, []);

  const dismissNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  const runUndo = useCallback(async (): Promise<void> => {
    if (offer === null || consumed.current) return;
    consumed.current = true;
    setRunning(true);
    try {
      const outcome = await offer.undo();
      setOffer(null);
      if (outcome === 'conflict') setNotice(messages.conflict);
      else if (outcome === 'failed') setNotice(messages.failed);
    } catch {
      // Исключение обратной мутации — тот же случай, что честный `failed`:
      // пользователю нельзя показать закрывшийся тост как успех.
      setOffer(null);
      setNotice(messages.failed);
    } finally {
      setRunning(false);
    }
  }, [messages.conflict, messages.failed, offer]);

  useEffect(() => {
    if (offer === null) return undefined;
    const timer = setTimeout(() => {
      // Окно закрылось само — предложение снимается молча. Действие уже
      // применено, отменять его больше нечем: «Корзины» в R1 нет (`01§9`).
      setOffer(null);
    }, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [offer]);

  return { offer, running, notice, offerUndo, runUndo, dismiss, dismissNotice };
}

/**
 * Строки тоста — из каталога `common` (`packages/i18n`): текст «Отменить» и
 * уведомление о конфликте одинаковы на всех экранах, дублировать их по
 * экранным каталогам не за чем.
 */
export function useCommonUndoToast(): UndoToastController {
  const messages = useMemo(
    () => ({ conflict: t('common', 'undo.conflict'), failed: t('common', 'undo.failed') }),
    [],
  );
  return useUndoToast(messages);
}

/**
 * Готовая пара «тост с кнопкой Отменить» + «уведомление о конфликте».
 * Один компонент на все экраны: `<сообщение>  Отменить` — дословный
 * UI-контракт ST §58, и повторять его разметку по экранам значило бы
 * позволить им разойтись.
 */
export function UndoToast({
  controller,
}: {
  readonly controller: UndoToastController;
}): ReactElement | null {
  if (controller.notice !== null) {
    return (
      <Toast
        variant="warning"
        message={controller.notice}
        onDismiss={controller.dismissNotice}
        dismissLabel={t('common', 'undo.dismiss')}
      />
    );
  }
  if (controller.offer === null) return null;
  return (
    <Toast
      message={controller.offer.message}
      action={
        <Button
          variant="ghost"
          size="sm"
          disabled={controller.running}
          onClick={() => void controller.runUndo()}
        >
          {t('common', 'undo.action')}
        </Button>
      }
      onDismiss={controller.dismiss}
      dismissLabel={t('common', 'undo.dismiss')}
    />
  );
}
