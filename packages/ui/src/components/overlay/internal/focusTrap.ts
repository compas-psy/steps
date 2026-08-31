/**
 * Общая механика фокус-trap для модальных оверлеев (`Modal`, `BottomSheet`)
 * и «управляемого, но не запертого» фокуса `SideInspector` (SPEC §15 —
 * «modal focus trap/restore» блокирует релиз, не опция).
 *
 * Не публичный API пакета — не реэкспортируется из `overlay/index.ts`
 * (единая точка входа компонентов, `packages/ui/src/index.ts` §…), это
 * внутренняя утилита трёх компонентов подкаталога.
 *
 * `useOverlayFocus` держит две обязанности вместе, потому что они шарят
 * состояние «кто был активен до открытия»: (1) при открытии — фокус на
 * первый фокусируемый элемент диалога (на сам диалог, если фокусируемых
 * нет); (2) при закрытии/размонтировании — фокус обратно на элемент,
 * который открыл оверлей. `trapTabKey` — отдельная функция, а не часть
 * хука: `SideInspector` использует только (1)+(2), без Tab-цикла (задание
 * прямо разводит «настоящий модальный trap» Modal/BottomSheet и
 * «управляемый, но не запертый» фокус инспектора).
 */
import { type KeyboardEvent, type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function focusFirst(container: HTMLElement): void {
  const [first] = getFocusableElements(container);
  (first ?? container).focus();
}

/**
 * При переходе `open: false → true` запоминает `document.activeElement` и
 * переносит фокус внутрь `containerRef`. При обратном переходе (в том
 * числе размонтированием — `open` уходит из дерева) возвращает фокус на
 * запомненный элемент через cleanup-функцию эффекта.
 */
export function useOverlayFocus(open: boolean, containerRef: RefObject<HTMLElement | null>): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    if (container) {
      focusFirst(container);
    }
    return () => {
      previouslyFocused.current?.focus();
    };
    // `containerRef` — `useRef`, идентичность стабильна между рендерами;
    // `open` единственная зависимость, реально меняющая поведение эффекта.
  }, [open]);
}

/**
 * `Tab`/`Shift+Tab` внутри `container` — на границе списка фокусируемых
 * элементов зацикливает вместо ухода в фон. Вызывающий компонент решает,
 * что делать с `Escape` (обычно `onClose`) — здесь только Tab-цикл, чтобы
 * не завязывать одну функцию на два разных повода вызвать `preventDefault`.
 */
export function trapTabKey(event: KeyboardEvent<HTMLElement>, container: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}
