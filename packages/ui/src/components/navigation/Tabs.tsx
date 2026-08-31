/**
 * `Tabs` — переключение между видами (§10 «Navigation»). ARIA APG «Tabs»
 * буквально: `tablist`/`tab`/`tabpanel` с roving `tabIndex` (тот же паттерн,
 * что уже использует `SegmentedControl` для `radiogroup`/`radio` — здесь
 * повторён один в один, потому что оба виджета составные и требуют
 * стрелочной навигации, но роли разные: `radiogroup` — «выбор одного из
 * значений», `tablist` — «какая панель контента сейчас видна», их нельзя
 * смешивать даже при похожей вёрстке).
 *
 * Панель — часть самого компонента (`item.panel`), а не отдельный кусок,
 * который вызывающий код обязан связывать `aria-labelledby` вручную:
 * связка `tab` → `tabpanel` через `id`/`aria-controls`/`aria-labelledby`
 * задаётся один раз здесь.
 */
import { type KeyboardEvent, type ReactElement, type ReactNode, useId, useRef } from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import './Tabs.css';

export interface TabItem<V extends string = string> {
  readonly value: V;
  readonly label: ReactNode;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly panel: ReactNode;
}

export interface TabsProps<V extends string = string> {
  readonly items: readonly TabItem<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  /** Доступное имя `tablist`. */
  readonly label: string;
  readonly className?: string;
}

export function Tabs<V extends string = string>({
  items,
  value,
  onChange,
  label,
  className,
}: TabsProps<V>): ReactElement {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const activeItem = items.find((item) => item.value === value);

  function tabId(itemValue: V): string {
    return `${baseId}-tab-${itemValue}`;
  }
  function panelId(itemValue: V): string {
    return `${baseId}-panel-${itemValue}`;
  }

  function focusTabAt(index: number): void {
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.item(index)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const count = items.length;
    if (count === 0) return;

    // Отключённые вкладки пропускаются при стрелочной навигации (ARIA APG
    // «Tabs» — disabled tab остаётся видимым, но не участвует в roving
    // tabIndex): нативный `disabled` на `<button>` и так не даёт браузеру
    // сфокусировать такой элемент программным `.focus()`, цикл ниже находит
    // ближайший доступный вместо того, чтобы навигация «застревала».
    function nextEnabledIndex(from: number, direction: 1 | -1): number {
      let next = from;
      for (let step = 0; step < count; step += 1) {
        next = (next + direction + count) % count;
        if (!(items[next]?.disabled ?? false)) return next;
      }
      return from;
    }

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = nextEnabledIndex(index, 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = nextEnabledIndex(index, -1);
    } else if (event.key === 'Home') {
      nextIndex = (items[0]?.disabled ?? false) ? nextEnabledIndex(0, 1) : 0;
    } else if (event.key === 'End') {
      const last = count - 1;
      nextIndex = (items[last]?.disabled ?? false) ? nextEnabledIndex(last, -1) : last;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextItem = items[nextIndex]!;
      onChange(nextItem.value);
      focusTabAt(nextIndex);
    }
  }

  return (
    <div className={['shagi-tabs', className].filter(Boolean).join(' ')}>
      <div ref={listRef} role="tablist" aria-label={label} className="shagi-tabs__list">
        {items.map((item, index) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={tabId(item.value)}
              aria-selected={active}
              aria-controls={panelId(item.value)}
              tabIndex={active ? 0 : -1}
              disabled={item.disabled ?? false}
              className={['shagi-tabs__tab', active ? 'shagi-tabs__tab--active' : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.icon !== undefined && <Icon name={item.icon} size={16} />}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {activeItem !== undefined && (
        <div
          role="tabpanel"
          id={panelId(activeItem.value)}
          aria-labelledby={tabId(activeItem.value)}
          tabIndex={0}
          className="shagi-tabs__panel"
        >
          {activeItem.panel}
        </div>
      )}
    </div>
  );
}
