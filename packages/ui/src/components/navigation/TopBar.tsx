/**
 * `TopBar` — верхняя панель (§10 «Navigation»). Презентационная обвязка:
 * три слота (`leading`/`children`/`actions`), ни заголовка, ни действий не
 * подставляет сама — заголовок экрана и кнопки приносит вызывающий код
 * (ТЗ §3). `<header>` без вложенности в `article`/`section` — landmark
 * `banner` браузер выставляет сам, ничего дополнительно не требуется.
 */
import { type HTMLAttributes, type ReactElement, type ReactNode, forwardRef } from 'react';

import './TopBar.css';

export interface TopBarProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Слот перед заголовком — например кнопка «Назад» или переключатель
   * сайдбара. */
  readonly leading?: ReactNode;
  /** Заголовок/основное содержимое панели. */
  readonly children?: ReactNode;
  /** Действия справа — например `IconButton`/`Button`. */
  readonly actions?: ReactNode;
}

export const TopBar = forwardRef<HTMLElement, TopBarProps>(function TopBar(
  { leading, children, actions, className, ...rest },
  ref,
): ReactElement {
  return (
    <header {...rest} ref={ref} className={['shagi-topbar', className].filter(Boolean).join(' ')}>
      {leading !== undefined && <div className="shagi-topbar__leading">{leading}</div>}
      <div className="shagi-topbar__content">{children}</div>
      {actions !== undefined && <div className="shagi-topbar__actions">{actions}</div>}
    </header>
  );
});
