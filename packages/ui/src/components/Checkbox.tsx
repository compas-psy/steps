/**
 * `Checkbox` — булев выбор (§10 «Primitives», §11: Default/Checked/
 * Disabled). Нативный `<input type="checkbox">`, обёрнутый в `<label>` —
 * связь label↔control идёт через саму разметку (клик по подписи переключает
 * поле), не через `aria-labelledby`. `label` необязателен: строка есть в
 * пакете, только когда её передаёт вызывающий код (ТЗ §3) — для случаев без
 * видимой подписи (например, чекбокс в ячейке таблицы) имя приносит
 * `aria-label`/`aria-labelledby` через `...rest`.
 */
import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';

import { Icon } from './Icon.js';
import './Checkbox.css';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  readonly label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, disabled = false, ...rest },
  ref,
) {
  const classes = ['shagi-checkbox', disabled ? 'shagi-checkbox--disabled' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes}>
      <span className="shagi-checkbox__control">
        <input
          {...rest}
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className="shagi-checkbox__input"
        />
        <span className="shagi-checkbox__box" aria-hidden="true">
          <Icon name="check" size={14} className="shagi-checkbox__check" />
        </span>
      </span>
      {label !== undefined && <span className="shagi-checkbox__label">{label}</span>}
    </label>
  );
});
