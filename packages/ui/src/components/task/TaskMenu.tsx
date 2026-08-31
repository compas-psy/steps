/**
 * `TaskMenu` — контекстное меню над задачей (пакет работ E03.4). Тонкая
 * типизированная обёртка над `../overlay/Menu.tsx` (E03.3) — весь рендер,
 * позиционирование, клавиатурная навигация (WAI-ARIA APG «menu») и
 * фокус-менеджмент уже реализованы там, здесь ничего не переопределяется
 * и не рендерится заново. Единственное, что добавляет `TaskMenu` — сама
 * форма API, гарантирующая паттерн задания «частые действия сверху,
 * разделитель, редкие, второй разделитель, единственный destructive
 * снизу»: три отдельных пропса (`frequentActions`/`rareActions`/
 * `destructiveAction`) вместо одного `sections`, так что порядок и
 * группировка встроены в типы, а не в соглашение вызывающего кода. Список
 * конкретных пунктов («Выполнить», «Удалить» и т.п.) сюда не зашит — это
 * продуктовое решение `packages/app` с текстом из `@shagi/i18n` (ТЗ §3),
 * `TaskMenu` знает только форму данных (`TaskMenuItemData`).
 */
import type { CSSProperties, ReactElement } from 'react';

import type { IconName } from '../../icons/index.js';
import {
  Menu,
  type MenuItemData,
  type MenuPlacement,
  type MenuSectionData,
} from '../overlay/Menu.js';

export interface TaskMenuItemData {
  readonly key: string;
  readonly label: MenuItemData['label'];
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
}

export interface TaskMenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Частые действия — верхняя секция, без разделителя перед ней. */
  readonly frequentActions?: readonly TaskMenuItemData[];
  /** Редкие действия — вторая секция, отделена разделителем. */
  readonly rareActions?: readonly TaskMenuItemData[];
  /** Единственное деструктивное действие — всегда снизу, всегда отделено
   * своим разделителем и всегда `variant="destructive"` — вызывающему коду
   * не нужно указывать вариант самому. */
  readonly destructiveAction?: TaskMenuItemData;
  readonly placement?: MenuPlacement;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly 'aria-label'?: string;
}

function toMenuItem(item: TaskMenuItemData): MenuItemData {
  return {
    key: item.key,
    label: item.label,
    ...(item.icon !== undefined ? { icon: item.icon } : {}),
    ...(item.disabled !== undefined ? { disabled: item.disabled } : {}),
    ...(item.onSelect !== undefined ? { onSelect: item.onSelect } : {}),
  };
}

export function TaskMenu({
  open,
  onClose,
  frequentActions = [],
  rareActions = [],
  destructiveAction,
  placement = 'bottom-start',
  className,
  style,
  'aria-label': ariaLabel,
}: TaskMenuProps): ReactElement | null {
  const sections: MenuSectionData[] = [];
  if (frequentActions.length > 0) {
    sections.push({ key: 'frequent', items: frequentActions.map(toMenuItem) });
  }
  if (rareActions.length > 0) {
    sections.push({ key: 'rare', items: rareActions.map(toMenuItem) });
  }
  if (destructiveAction !== undefined) {
    sections.push({
      key: 'destructive',
      items: [{ ...toMenuItem(destructiveAction), variant: 'destructive' }],
    });
  }

  return (
    <Menu
      open={open}
      onClose={onClose}
      sections={sections}
      placement={placement}
      {...(className !== undefined ? { className } : {})}
      {...(style !== undefined ? { style } : {})}
      {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
    />
  );
}
