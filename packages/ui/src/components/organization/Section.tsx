/**
 * `Section` — заголовок секции внутри проекта (§10 «Organization»:
 * «название, свернуть/развернуть, счётчик задач в секции»; прототип D09
 * «ИДЕИ · 1», «СДЕЛАТЬ · 2» — заглавные мелкие заголовки колонок/секций).
 *
 * Duality-паттерн, как у `Chip`: без `onToggleCollapse` — статичный
 * заголовок (`<div>`), например когда список не сворачиваемый или секция
 * единственная («Без раздела», §10.2 упоминание в `02-ui.md`); с
 * `onToggleCollapse` — доступная кнопка `aria-expanded`, вся строка
 * (иконка+название+счётчик) — один accessible name, тот же приём, что
 * `Sidebar.item` совмещает label+badge в имени кнопки.
 *
 * `collapsed` — управляется вызывающим кодом (нет внутреннего состояния):
 * сама фактическая фильтрация/скрытие списка задач под секцией — не дело
 * этого компонента, он только показывает текущее состояние и сообщает о
 * намерении переключить его.
 */
import type { ReactElement, ReactNode } from 'react';

import { Icon } from '../Icon.js';
import './Section.css';

export interface SectionProps {
  readonly title: ReactNode;
  /** Счётчик задач в секции — уже отформатированный вызывающим кодом. */
  readonly count?: ReactNode;
  readonly collapsed?: boolean;
  /** Заданный проп делает заголовок интерактивным (см. заголовок файла). */
  readonly onToggleCollapse?: () => void;
  readonly className?: string;
}

export function Section({
  title,
  count,
  collapsed = false,
  onToggleCollapse,
  className,
}: SectionProps): ReactElement {
  const content = (
    <>
      {onToggleCollapse !== undefined && (
        <span
          aria-hidden="true"
          className={[
            'shagi-section__chevron',
            collapsed ? 'shagi-section__chevron--collapsed' : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Icon name="chevron" size={14} />
        </span>
      )}
      <span className="shagi-section__title">{title}</span>
      {count !== undefined && <span className="shagi-section__count">{count}</span>}
    </>
  );

  const classes = ['shagi-section', className].filter(Boolean).join(' ');

  if (onToggleCollapse !== undefined) {
    return (
      <button
        type="button"
        className={classes}
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
      >
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
