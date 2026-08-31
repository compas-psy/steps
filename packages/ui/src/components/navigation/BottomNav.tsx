/**
 * `BottomNav` — мобильная нижняя навигация (`04_UI_DESIGN_SYSTEM.md` §9,
 * `.ultraplan/research/02-ui.md` §4 «5 позиций из прототипа M07»: Сегодня ·
 * План · центральная кнопка `+` · Проекты · Поиск).
 *
 * Структура из 4 пунктов вокруг приподнятой центральной кнопки — это уже
 * принятое продуктовое решение самого ТЗ (§9 перечисляет ровно эти
 * позиции), поэтому компонент фиксирует форму (боковые пункты + отдельная
 * центральная кнопка), в отличие от `Sidebar`, где состав пунктов остаётся
 * решением `packages/app`. Подписи и обработчики всё равно приходят
 * снаружи — ни одной русской буквы здесь нет (ТЗ §3).
 *
 * Вход во Входящие сюда не включён — задание пакета работ явно выносит его
 * в отдельную сущность (бейдж-счётчик на Today-header), не часть этого
 * компонента.
 *
 * Доступность: `nav` с обязательным `aria-label` (лендмарк без имени
 * неразличим, когда на странице больше одного `nav`, тот же принцип, что у
 * `SegmentedControl.label`), активный пункт — `aria-current="page"` плюс
 * визуальный маркер, который не сводится к одному цвету (§11 «state never
 * color-only»): жирная подпись и точка-индикатор под иконкой. Кнопки —
 * нативные `<button>`, обычный tab-порядок и `Enter`/`Space` работают
 * бесплатно, без роли `tablist`, потому что это не переключение панелей
 * контента на одной странице, а переход между маршрутами (та же семантика,
 * что у `nav` с обычными кнопками-ссылками в паттернах ARIA APG).
 */
import type { ReactElement, ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import './BottomNav.css';

export interface BottomNavItem<V extends string = string> {
  readonly value: V;
  readonly label: ReactNode;
  readonly icon: IconName;
}

export interface BottomNavCenterAction {
  readonly icon: IconName;
  /** Обязательное доступное имя центральной кнопки (без видимой подписи) —
   * тот же контракт, что `IconButton.label`. */
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export interface BottomNavProps<V extends string = string> {
  /** Боковые пункты вокруг центральной кнопки, поровну слева/справа. */
  readonly items: readonly BottomNavItem<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly centerAction: BottomNavCenterAction;
  /** Доступное имя лендмарка `nav`. */
  readonly label: string;
  readonly className?: string;
}

export function BottomNav<V extends string = string>({
  items,
  value,
  onChange,
  centerAction,
  label,
  className,
}: BottomNavProps<V>): ReactElement {
  const mid = Math.ceil(items.length / 2);
  const leading = items.slice(0, mid);
  const trailing = items.slice(mid);

  function renderItem(item: BottomNavItem<V>): ReactElement {
    const active = item.value === value;
    return (
      <button
        key={item.value}
        type="button"
        className={['shagi-bottom-nav__item', active ? 'shagi-bottom-nav__item--active' : null]
          .filter(Boolean)
          .join(' ')}
        aria-current={active ? 'page' : undefined}
        onClick={() => onChange(item.value)}
      >
        <span className="shagi-bottom-nav__icon">
          <Icon name={item.icon} size={22} />
        </span>
        <span className="shagi-bottom-nav__label">{item.label}</span>
      </button>
    );
  }

  return (
    <nav aria-label={label} className={['shagi-bottom-nav', className].filter(Boolean).join(' ')}>
      {leading.map(renderItem)}
      <button
        type="button"
        className="shagi-bottom-nav__center"
        aria-label={centerAction.label}
        disabled={centerAction.disabled ?? false}
        onClick={centerAction.onClick}
      >
        <Icon name={centerAction.icon} size={24} />
      </button>
      {trailing.map(renderItem)}
    </nav>
  );
}
