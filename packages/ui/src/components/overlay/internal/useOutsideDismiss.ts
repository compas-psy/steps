/**
 * Закрытие немодального плавающего элемента (`Menu`, `Popover`) кликом
 * снаружи и/или `Escape`. Не модальные оверлеи (в отличие от `Modal`/
 * `BottomSheet`) не запирают фокус — им нужен только «выйти при клике
 * мимо», а не полный focus-trap из `internal/focusTrap.ts`.
 */
import { type RefObject, useEffect } from 'react';

export function useOutsideDismiss(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) {
        onDismiss();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
    // `onDismiss` — в зависимостях: без этого при смене идентичности
    // колбэка (частый случай, если вызывающий код передаёт инлайн-стрелку,
    // замыкающую внешнее состояние) обработчик держал бы устаревшее
    // замыкание до следующего `open`-триггера.
  }, [open, onDismiss, containerRef]);
}
