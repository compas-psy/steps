/**
 * `ChecklistRow` — пункт чек-листа (пакет работ E03.4): чекбокс + текст,
 * компактнее `TaskRow` — у чек-листа нет ни Focus/Deadline/Recurring, ни
 * multi-select, только Checked/Unchecked (+Disabled), поэтому переиспользует
 * не `TaskRow`, а базовый `../Checkbox.tsx` (E03.1) — текст пункта здесь и
 * есть видимая подпись чекбокса, клик по тексту переключает поле через
 * нативный `<label>`, ровно как задуман `Checkbox`.
 */
import type { ReactElement, ReactNode } from 'react';

import { Checkbox } from '../Checkbox.js';
import './ChecklistRow.css';

export interface ChecklistRowProps {
  /** Текст пункта — видимая подпись чекбокса (продуктовый текст приносит
   * вызывающий код, ТЗ §3). */
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
  /** Действие в конце строки — например `IconButton` для удаления пункта. */
  readonly trailing?: ReactNode;
  readonly className?: string;
}

export function ChecklistRow({
  label,
  checked,
  onCheckedChange,
  disabled = false,
  trailing,
  className,
}: ChecklistRowProps): ReactElement {
  const classes = [
    'shagi-checklist-row',
    checked ? 'shagi-checklist-row--checked' : null,
    disabled ? 'shagi-checklist-row--disabled' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <Checkbox
        className="shagi-checklist-row__checkbox"
        label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {trailing !== undefined && <div className="shagi-checklist-row__trailing">{trailing}</div>}
    </div>
  );
}
