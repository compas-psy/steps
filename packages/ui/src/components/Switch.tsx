/**
 * `Switch` — тумблер (§10 «Primitives», §11: On/Off/Disabled). Реализован
 * как `<input type="checkbox" role="switch">` — валидный паттерн ARIA
 * поверх нативной чекбокс-семантики (клавиатура/форма/скринридеры работают
 * бесплатно), а не как `<button role="switch">` с ручным состоянием.
 */
import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';

import './Switch.css';

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size' | 'role'
> {
  readonly label?: ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className, disabled = false, ...rest },
  ref,
) {
  const classes = ['shagi-switch', disabled ? 'shagi-switch--disabled' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes}>
      <span className="shagi-switch__control">
        <input
          {...rest}
          ref={ref}
          type="checkbox"
          role="switch"
          disabled={disabled}
          className="shagi-switch__input"
        />
        <span className="shagi-switch__track" aria-hidden="true">
          <span className="shagi-switch__thumb" />
        </span>
      </span>
      {label !== undefined && <span className="shagi-switch__label">{label}</span>}
    </label>
  );
});
