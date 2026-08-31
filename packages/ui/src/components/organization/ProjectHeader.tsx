/**
 * `ProjectHeader` — заголовок экрана проекта (§10 «Organization»: «название,
 * счётчик, действия — меню/архив, см. TaskMenu-паттерн: тонкая обёртка над
 * Menu из overlay/, не новая реализация»).
 *
 * Компонент НЕ реализует позиционирование/клавиатуру/фокус-ловушку меню
 * заново — это уже сделано в `overlay/Menu.tsx` (WAI-ARIA APG «menu»,
 * `useOverlayFocus`, `useOutsideDismiss`). `ProjectHeader` только:
 * 1. рендерит `IconButton` (иконка `more`) как триггер, с обязательным
 *    `triggerLabel` (§15 «icon button accessible names»);
 * 2. держит позиционированный контейнер (`position: relative`) для
 *    абсолютного позиционирования `Menu`;
 * 3. пробрасывает `menuOpen`/`onMenuOpenChange` — состояние открытости
 *    контролирует вызывающий код (тот же контракт, что `Menu.open`/
 *    `Menu.onClose`), сам `ProjectHeader` не хранит его.
 *
 * `actions` — необязательный слот для доп. действий (например прямая кнопка
 * «Архивировать» без захода в меню) — вызывающий код решает, что там
 * рендерить, компонент не хардкодит конкретное действие.
 */
import type { ReactElement, ReactNode } from 'react';

import { IconButton } from '../IconButton.js';
import { Menu, type MenuSectionData } from '../overlay/Menu.js';
import './ProjectHeader.css';

export interface ProjectHeaderProps {
  readonly title: ReactNode;
  /** Счётчик задач проекта — уже отформатированный вызывающим кодом. */
  readonly count?: ReactNode;
  readonly menuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly menuSections: readonly MenuSectionData[];
  /** Доступное имя меню (`Menu.aria-label`). */
  readonly menuLabel: string;
  /** Доступное имя кнопки-триггера меню — обязателен, см. заголовок файла. */
  readonly triggerLabel: string;
  /** Слот для дополнительных действий (например прямая кнопка «Архивировать»). */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function ProjectHeader({
  title,
  count,
  menuOpen,
  onMenuOpenChange,
  menuSections,
  menuLabel,
  triggerLabel,
  actions,
  className,
}: ProjectHeaderProps): ReactElement {
  return (
    <div className={['shagi-project-header', className].filter(Boolean).join(' ')}>
      <div className="shagi-project-header__title-group">
        <span className="shagi-project-header__title">{title}</span>
        {count !== undefined && <span className="shagi-project-header__count">{count}</span>}
      </div>
      <div className="shagi-project-header__actions">
        {actions}
        <div className="shagi-project-header__menu-anchor">
          <IconButton
            icon="more"
            label={triggerLabel}
            variant="ghost"
            onClick={() => onMenuOpenChange(!menuOpen)}
          />
          <Menu
            open={menuOpen}
            onClose={() => onMenuOpenChange(false)}
            sections={menuSections}
            aria-label={menuLabel}
            placement="bottom-end"
            className="shagi-project-header__menu"
          />
        </div>
      </div>
    </div>
  );
}
