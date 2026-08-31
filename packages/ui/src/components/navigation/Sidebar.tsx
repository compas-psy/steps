/**
 * `Sidebar` — десктопная навигация (`04_UI_DESIGN_SYSTEM.md` §9, ширина
 * 240–280 — `--sidebar-width`/`--sidebar-width-max`, `.ultraplan/research/02-ui.md`
 * §4). Состав пунктов (Сегодня/План/Входящие/Проекты/Фильтры/Метки/
 * Завершённые, §9) — продуктовое решение `packages/app` следующих эпиков:
 * этот компонент принимает произвольные `sections`/`items` через пропсы и
 * ничего не хардкодит, в отличие от `BottomNav`, чья форма зафиксирована
 * самим ТЗ.
 *
 * Токены `--sidebar*` (`tokens/colors.css`) описывают постоянно тёмную
 * форест-поверхность, инвариантную к теме приложения (см. комментарий там)
 * — сайдбар не светлеет в светлой теме и не пересчитывается в тёмной,
 * поэтому все цвета здесь читаются из этой отдельной группы токенов, а не
 * из общих `--card`/`--border`/`--muted`.
 *
 * Доступность: `nav` с обязательным `aria-label`, активный пункт —
 * `aria-current="page"` плюс структурная разница (не только цвет, §11):
 * заливка `--sidebar-active` формирует видимый блок, а не просто смену
 * цвета текста. Разделы разделяются `Divider` (готовый примитив, не новый
 * паттерн), обычный tab-порядок — сайдбар это список пунктов навигации
 * (ARIA APG «navigation», не составной виджет), а не `radiogroup`, поэтому
 * roving tabIndex здесь неуместен: каждый пункт — независимая ссылка на
 * маршрут, все они должны быть по очереди достижимы табом, как обычные
 * кнопки.
 */
import type { ReactElement, ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Divider } from '../Divider.js';
import { Icon } from '../Icon.js';
import './Sidebar.css';

export interface SidebarItem<V extends string = string> {
  readonly value: V;
  readonly label: ReactNode;
  readonly icon?: IconName;
  /** Например счётчик Входящих. */
  readonly badge?: ReactNode;
  /** Приглушённый пункт (например «Завершённые», §9). */
  readonly muted?: boolean;
  readonly disabled?: boolean;
}

export interface SidebarSection<V extends string = string> {
  /** Ключ для React `key` — не показывается пользователю. */
  readonly key: string;
  readonly title?: ReactNode;
  readonly items: readonly SidebarItem<V>[];
}

export interface SidebarProps<V extends string = string> {
  readonly sections: readonly SidebarSection<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  /** Доступное имя лендмарка `nav`. */
  readonly label: string;
  /** Слот над списком секций — например `ServiceMark` + название продукта. */
  readonly header?: ReactNode;
  /** Слот под списком секций. */
  readonly footer?: ReactNode;
  readonly className?: string;
}

export function Sidebar<V extends string = string>({
  sections,
  value,
  onChange,
  label,
  header,
  footer,
  className,
}: SidebarProps<V>): ReactElement {
  return (
    <nav aria-label={label} className={['shagi-sidebar', className].filter(Boolean).join(' ')}>
      {header !== undefined && <div className="shagi-sidebar__header">{header}</div>}
      <div className="shagi-sidebar__sections">
        {sections.map((section, index) => (
          <div key={section.key} className="shagi-sidebar__section">
            {index > 0 && <Divider className="shagi-sidebar__divider" />}
            {section.title !== undefined && (
              <div className="shagi-sidebar__section-title">{section.title}</div>
            )}
            <ul className="shagi-sidebar__list">
              {section.items.map((item) => {
                const active = item.value === value;
                return (
                  <li key={item.value}>
                    <button
                      type="button"
                      className={[
                        'shagi-sidebar__item',
                        active ? 'shagi-sidebar__item--active' : null,
                        item.muted === true ? 'shagi-sidebar__item--muted' : null,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-current={active ? 'page' : undefined}
                      disabled={item.disabled ?? false}
                      onClick={() => onChange(item.value)}
                    >
                      {item.icon !== undefined && (
                        <span className="shagi-sidebar__item-icon">
                          <Icon name={item.icon} size={18} />
                        </span>
                      )}
                      <span className="shagi-sidebar__item-label">{item.label}</span>
                      {item.badge !== undefined && (
                        <span className="shagi-sidebar__item-badge">{item.badge}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer !== undefined && <div className="shagi-sidebar__footer">{footer}</div>}
    </nav>
  );
}
