/**
 * `DataPrivacyRow` — строка настроек про данные/приватность (§10
 * «Account/Data»): заголовок, описание, действие. Presentational-контейнер
 * той же структуры, что `organization/Section` — переиспользует уже
 * принятые примитивы (`Switch`, `IconButton`), не изобретает новый
 * визуальный язык (задание).
 *
 * `action` — закрытая дискриминированная уния вместо трёх параллельных
 * опциональных пропсов: `switch`/`button`/`navigate`/`none` взаимно
 * исключают друг друга по смыслу (одна строка не может одновременно быть
 * тумблером и вести на детальный экран), явный `kind` делает это
 * инвариантом типов, а не соглашением «не задавай оба одновременно».
 *
 * `navigate` — тот же duality-приём, что `Section.onToggleCollapse`: вся
 * строка становится доступной кнопкой (`aria-label` — обязательный `label`
 * действия), а не только шеврон в её конце — доступное имя должно
 * совпадать с кликабельной областью.
 */
import type { ReactElement, ReactNode } from 'react';

import { Button } from '../Button.js';
import { Icon } from '../Icon.js';
import { Switch } from '../Switch.js';
import './DataPrivacyRow.css';

export type DataPrivacyRowAction =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'switch';
      readonly checked: boolean;
      readonly onChange: (checked: boolean) => void;
      /** Доступное имя переключателя — обязателен, когда рядом нет
       * видимого `<label>`, связанного с ним программно (тот же контракт,
       * что `IconButton.label`). */
      readonly label?: string;
      readonly disabled?: boolean;
    }
  | {
      readonly kind: 'button';
      readonly label: ReactNode;
      readonly onClick: () => void;
      readonly disabled?: boolean;
    }
  | {
      readonly kind: 'navigate';
      /** Доступное имя всей строки-кнопки — см. заголовок файла. */
      readonly label: string;
      readonly onClick: () => void;
    };

export interface DataPrivacyRowProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Декоративная иконка перед текстом. */
  readonly icon?: ReactNode;
  readonly action: DataPrivacyRowAction;
  readonly className?: string;
}

function ActionSlot({ action }: { readonly action: DataPrivacyRowAction }): ReactElement | null {
  switch (action.kind) {
    case 'none':
      return null;
    case 'switch':
      return (
        <Switch
          checked={action.checked}
          disabled={action.disabled}
          aria-label={action.label}
          onChange={(event) => action.onChange(event.target.checked)}
        />
      );
    case 'button':
      return (
        <Button variant="ghost" size="sm" disabled={action.disabled} onClick={action.onClick}>
          {action.label}
        </Button>
      );
    case 'navigate':
      return (
        <span className="shagi-data-privacy-row__chevron" aria-hidden="true">
          <Icon name="chevron" size={16} />
        </span>
      );
  }
}

export function DataPrivacyRow({
  title,
  description,
  icon,
  action,
  className,
}: DataPrivacyRowProps): ReactElement {
  const classes = ['shagi-data-privacy-row', className].filter(Boolean).join(' ');

  const content = (
    <>
      {icon !== undefined && (
        <span className="shagi-data-privacy-row__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="shagi-data-privacy-row__text">
        <span className="shagi-data-privacy-row__title">{title}</span>
        {description !== undefined && (
          <span className="shagi-data-privacy-row__description">{description}</span>
        )}
      </span>
    </>
  );

  if (action.kind === 'navigate') {
    return (
      <button type="button" className={classes} aria-label={action.label} onClick={action.onClick}>
        {content}
        <ActionSlot action={action} />
      </button>
    );
  }

  return (
    <div className={classes}>
      {content}
      {action.kind !== 'none' && (
        <span className="shagi-data-privacy-row__action">
          <ActionSlot action={action} />
        </span>
      )}
    </div>
  );
}
