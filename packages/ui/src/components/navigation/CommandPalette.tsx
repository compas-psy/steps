/**
 * `CommandPalette` — презентационный Cmd/Ctrl+K оверлей (§10 «Navigation»,
 * задание пакета работ E03.2). Реестр команд — задача `packages/app` (E13,
 * будущий эпик): этот компонент только показывает уже отфильтрованный
 * список `items` и текущий `query`, отдаёт события `onQueryChange`/
 * `onSelect`/`onClose` наружу, ничего не хранит и не фильтрует сам.
 *
 * ARIA-паттерн — «Editable combobox with list autocomplete» (WAI-ARIA APG),
 * а не список отдельно фокусируемых кнопок: единственный элемент, что
 * получает настоящий DOM-фокус во время работы со списком — поле ввода
 * (`role="combobox"`); пункты — `role="option"` внутри `role="listbox"`,
 * подсвечиваются `aria-selected`/`aria-activedescendant`, двигаются
 * стрелками, выбираются `Enter`, но НЕ входят в Tab-порядок — это
 * стандартный паттерн именно для командной палитры/автокомплита (стрелки
 * листают варианты, а не Tab), в отличие от `Tabs`/`SegmentedControl`, где
 * сам виджет и есть контент, а не фильтр над списком.
 *
 * Доступное имя поля `role="combobox"` — отдельный `aria-label={label}` на
 * самом `<input>` (тот же текст, что и `aria-label` диалога/`aria-label`
 * списка): input не окружён `<label>` и не имеет видимого текста внутри
 * себя, значит без `aria-label`/`aria-labelledby` у него вообще нет
 * доступного имени (axe: `label`) — назначение всего диалога и есть
 * назначение единственного интерактивного поля в нём, так что одна и та же
 * строка `label` уместна на всех трёх ролях (`dialog`/`combobox`/`listbox`).
 *
 * `aria-controls` на `<input>` указывает на `<ul id="{baseId}-listbox">` —
 * при пустом `items` список раньше не рендерился вовсе (вместо него
 * `emptyState`), и `aria-controls` целил в несуществующий id (axe:
 * `aria-valid-attr-value`). Первая попытка чинить это — не проставлять
 * `aria-controls`, пока список пуст — сама оказалась нарушением: `input`
 * несёт `aria-expanded="true"` постоянно (палитра открыта — открыт и
 * попап), а по ARIA `aria-expanded="true"` на `combobox` ТРЕБУЕТ
 * `aria-controls`, указывающий на реально существующий элемент (axe:
 * `aria-required-attr`) — «пусто, поэтому нет атрибута» чинит одно
 * нарушение и тут же ловит другое. Рабочее решение — `<ul>` рендерится
 * ВСЕГДА (id всегда адресуем), при пустом `items` скрыт нативным `hidden`
 * (не в рендере, не в accessibility tree — не просто «visibility»), а
 * `emptyState` рендерится отдельным соседним блоком.
 *
 * Фокус-ловушка диалога (готового паттерна для этого в пакете не было —
 * ни `Tooltip`, ни другой компонент модальный фокус не ловит, реализовано
 * с нуля): при открытии запоминается `document.activeElement` (кнопка,
 * которая открыла палитру) и фокус переходит в поле ввода; `Tab`/
 * `Shift+Tab` циклически ходят по фокусируемым элементам диалога — здесь
 * их ровно два (поле ввода и кнопка закрытия), список пунктов сознательно
 * вне этого набора по причине из абзаца выше; при закрытии (`open` →
 * `false`) фокус возвращается на элемент, который диалог открыл.
 */
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import './CommandPalette.css';

export interface CommandPaletteItem<V extends string = string> {
  readonly value: V;
  readonly label: ReactNode;
  readonly icon?: IconName;
  /** Например подсказка сочетания клавиш справа. */
  readonly hint?: ReactNode;
  readonly disabled?: boolean;
}

export interface CommandPaletteProps<V extends string = string> {
  readonly open: boolean;
  readonly items: readonly CommandPaletteItem<V>[];
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (value: V) => void;
  readonly onClose: () => void;
  /** Доступное имя диалога. */
  readonly label: string;
  /** Плейсхолдер поля ввода — продуктовый текст приносит вызывающий код. */
  readonly placeholder?: string;
  /** Доступное имя кнопки закрытия — обязательно, как `IconButton.label`. */
  readonly closeLabel: string;
  /** Показывается вместо списка, когда `items` пуст. */
  readonly emptyState?: ReactNode;
  readonly className?: string;
}

function firstEnabledIndex(items: readonly { readonly disabled?: boolean }[]): number {
  return items.findIndex((item) => !(item.disabled ?? false));
}

export function CommandPalette<V extends string = string>({
  open,
  items,
  query,
  onQueryChange,
  onSelect,
  onClose,
  label,
  placeholder,
  closeLabel,
  emptyState,
  className,
}: CommandPaletteProps<V>): ReactElement | null {
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(() => firstEnabledIndex(items));

  // Фокус внутрь при открытии, возврат на триггер при закрытии — см.
  // заголовок файла.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      inputRef.current?.focus();
    } else {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  // Активный пункт сбрасывается на первый доступный при новом открытии или
  // изменении фильтра — Enter без движения стрелками обязан выбрать «первое
  // совпадение».
  useEffect(() => {
    setActiveIndex(firstEnabledIndex(items));
    // Зависимости — `query`/`items.length`/`open`, а не сам массив `items`:
    // вызывающий код обычно пересоздаёт его каждый рендер (новый фильтр),
    // сброс активного индекса должен реагировать на смену состава/видимости,
    // а не на смену ссылки при том же содержимом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, items.length, open]);

  if (!open) {
    return null;
  }

  function moveActive(direction: 1 | -1): void {
    if (items.length === 0) return;
    let next = activeIndex;
    for (let step = 0; step < items.length; step += 1) {
      next = (next + direction + items.length) % items.length;
      if (!(items[next]?.disabled ?? false)) break;
    }
    setActiveIndex(next);
  }

  function getFocusable(): HTMLElement[] {
    const root = dialogRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('input, button:not(:disabled)'));
  }

  function handleContainerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') return;
    const focusables = getFocusable();
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item !== undefined && !(item.disabled ?? false)) {
        onSelect(item.value);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function optionId(value: V): string {
    return `${baseId}-option-${value}`;
  }

  const activeItem = items[activeIndex];

  return (
    <div className="shagi-command-palette__backdrop" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={['shagi-command-palette', className].filter(Boolean).join(' ')}
        onKeyDown={handleContainerKeyDown}
      >
        <div className="shagi-command-palette__input-row">
          <span className="shagi-command-palette__search-icon" aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-label={label}
            aria-controls={`${baseId}-listbox`}
            aria-activedescendant={
              activeItem !== undefined ? optionId(activeItem.value) : undefined
            }
            aria-autocomplete="list"
            className="shagi-command-palette__input"
            placeholder={placeholder}
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button
            type="button"
            className="shagi-command-palette__close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {items.length === 0 && <div className="shagi-command-palette__empty">{emptyState}</div>}
        {/* Всегда в DOM (не только когда `items` не пуст) — `aria-controls`
            на `<input>` выше указывает на этот id, ПОКА `aria-expanded="true"`
            (он у нас статичен, палитра открыта — открыт и попап), а
            `role="combobox"` с `aria-expanded="true"` без указывающего на
            реальный элемент `aria-controls` — отдельное ARIA-нарушение
            (axe: `aria-required-attr`), не то, что чинили здесь изначально
            (`aria-valid-attr-value`, dangling id). `hidden` при пустом
            `items` держит список вне видимого рендера и вне accessibility
            tree (не просто `display:none` руками — нативный атрибут даёт
            оба эффекта бесплатно), но id остаётся адресуемым. */}
        <ul
          id={`${baseId}-listbox`}
          role="listbox"
          aria-label={label}
          hidden={items.length === 0}
          className="shagi-command-palette__list"
        >
          {items.map((item, index) => {
            const active = index === activeIndex;
            return (
              <li
                key={item.value}
                id={optionId(item.value)}
                role="option"
                aria-selected={active}
                aria-disabled={item.disabled === true || undefined}
                className={[
                  'shagi-command-palette__option',
                  active ? 'shagi-command-palette__option--active' : null,
                  item.disabled === true ? 'shagi-command-palette__option--disabled' : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  if (!(item.disabled ?? false)) {
                    onSelect(item.value);
                  }
                }}
              >
                {item.icon !== undefined && (
                  <span className="shagi-command-palette__option-icon">
                    <Icon name={item.icon} size={16} />
                  </span>
                )}
                <span className="shagi-command-palette__option-label">{item.label}</span>
                {item.hint !== undefined && (
                  <span className="shagi-command-palette__option-hint">{item.hint}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
