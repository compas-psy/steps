/**
 * `Radio` — выбор одного варианта (§10 «Primitives», §11: Default/
 * Selected/Disabled). Группировка (`name`) и одиночность выбора — забота
 * нативного `<input type="radio">`, компонент не хранит группового
 * состояния сам. См. `Checkbox.tsx` — та же техника оверлея и та же логика
 * `label`.
 */
import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';

import './Radio.css';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  readonly label?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, disabled = false, ...rest },
  ref,
) {
  const classes = ['shagi-radio', disabled ? 'shagi-radio--disabled' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes}>
      <span className="shagi-radio__control">
        <input
          {...rest}
          ref={ref}
          type="radio"
          disabled={disabled}
          className="shagi-radio__input"
        />
        <span className="shagi-radio__ring" aria-hidden="true">
          <span className="shagi-radio__dot" />
        </span>
      </span>
      {label !== undefined && <span className="shagi-radio__label">{label}</span>}
    </label>
  );
});
