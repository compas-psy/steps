/**
 * `Menu` — контекстное меню (§10 «Overlay»). Структурный паттерн — дословно
 * из прототипа (`docs/spec/DESIGN/source_unpacked/ШАГИ - R1 Design.dc.html`,
 * блок «[R1][D] Context menu», строки ~793–800): частые действия сверху,
 * разделитель, реже используемые действия, второй разделитель, единственный
 * destructive-пункт снизу — жирный, `var(--destructive)`. Компонент не
 * хардкодит ни один конкретный пункт (те — продуктовые строки, дело
 * `packages/app`, ТЗ §3): секции/пункты приходят через пропс `sections`,
 * группировка и порядок «частое → редкое → destructive» — соглашение
 * вызывающего кода, а не структура, зашитая в `Menu`. Единственное, что
 * компонент обязан поддерживать — `MenuItem` с `variant="destructive"` как
 * явную визуальную опцию (задание).
 *
 * Позиционирование — тот же принцип, что `Tooltip` (`position: absolute`
 * относительно ближайшего позиционированного предка + `placement`-классы),
 * без коллизионной логики с краями экрана: она осознанно вне рамок этого
 * пакета работ (задание прямо просит не изобретать её заново, раз `Tooltip`
 * её тоже не решает). Для контекстного меню, открывающегося у курсора,
 * `style`/`className` вызывающего кода может переопределить позицию поверх
 * `placement` — компонент не заслоняет доступ к этим пропсам.
 *
 * Клавиатура — паттерн WAI-ARIA APG «menu»: `ArrowDown`/`ArrowUp` двигают
 * фокус по включённым пунктам с зацикливанием, `Home`/`End` — на первый/
 * последний, `Escape` и выбор пункта закрывают меню и возвращают фокус на
 * триггер (`useOverlayFocus`, тот же хук что у `Modal`), `Tab` тоже закрывает
 * меню, но не перехватывается — меню не модальное (в отличие от `Modal`),
 * фокус должен свободно продолжить обычный порядок табуляции страницы.
 */
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useRef,
} from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import { useOverlayFocus } from './internal/focusTrap.js';
import { useOutsideDismiss } from './internal/useOutsideDismiss.js';
import './Menu.css';

export type MenuItemVariant = 'default' | 'destructive';
export type MenuPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface MenuItemData {
  readonly key: string;
  readonly label: ReactNode;
  readonly icon?: IconName;
  readonly variant?: MenuItemVariant;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
}

export interface MenuSectionData {
  readonly key: string;
  readonly items: readonly MenuItemData[];
}

export interface MenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly sections: readonly MenuSectionData[];
  readonly placement?: MenuPlacement;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly 'aria-label'?: string;
}

function focusAdjacentItem(
  buttons: readonly HTMLButtonElement[],
  fromIndex: number,
  direction: 1 | -1,
): void {
  if (buttons.length === 0) {
    return;
  }
  let index = fromIndex;
  for (let step = 0; step < buttons.length; step += 1) {
    index = (index + direction + buttons.length) % buttons.length;
    const candidate = buttons[index];
    if (candidate) {
      candidate.focus();
      return;
    }
  }
}

export function Menu({
  open,
  onClose,
  sections,
  placement = 'bottom-start',
  className,
  style,
  'aria-label': ariaLabel,
}: MenuProps): ReactElement | null {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useOverlayFocus(open, menuRef);
  useOutsideDismiss(open, menuRef, onClose);

  if (!open) {
    return null;
  }

  const getItemButtons = (): HTMLButtonElement[] =>
    menuRef.current
      ? Array.from(
          menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
        )
      : [];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      onClose();
      return;
    }
    const buttons = getItemButtons();
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusAdjacentItem(buttons, currentIndex, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusAdjacentItem(buttons, currentIndex, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  };

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      className={['shagi-menu', `shagi-menu--${placement}`, className].filter(Boolean).join(' ')}
      style={style}
      onKeyDown={handleKeyDown}
    >
      {sections.map((section, sectionIndex) => (
        <div key={section.key} className="shagi-menu__section">
          {sectionIndex > 0 && <div role="separator" className="shagi-menu__divider" />}
          {section.items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={[
                'shagi-menu__item',
                `shagi-menu__item--${item.variant ?? 'default'}`,
              ].join(' ')}
              onClick={() => {
                item.onSelect?.();
                onClose();
              }}
            >
              {item.icon !== undefined && (
                <span className="shagi-menu__item-icon">
                  <Icon name={item.icon} size={16} />
                </span>
              )}
              <span className="shagi-menu__item-label">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
