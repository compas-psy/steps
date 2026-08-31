/**
 * `Input` — текстовое поле (§10 «Primitives», §11: Default/Focus/Error/
 * Disabled). Ошибка связана с полем программно (§15 «field errors
 * associated programmatically» — блокер релиза): `errorMessage` рендерится
 * рядом и подключается через `aria-describedby`, `aria-invalid` ставится
 * автоматически. Текст ошибки — `ReactNode`, а не строка пакета: перевод
 * приносит вызывающий код (ТЗ §3).
 */
import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from 'react';

import './Input.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Декоративный узел перед полем (обычно `<Icon />`). */
  readonly leading?: ReactNode;
  /** Декоративный узел после поля. */
  readonly trailing?: ReactNode;
  /** Явно пометить поле ошибочным без текста (когда сообщение показано
   * отдельно, например одно на группу полей). */
  readonly error?: boolean;
  /** Текст ошибки — связывается с полем через `aria-describedby` и включает
   * `aria-invalid`. */
  readonly errorMessage?: ReactNode;
  readonly wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    leading,
    trailing,
    error = false,
    errorMessage,
    className,
    wrapperClassName,
    id,
    disabled = false,
    'aria-describedby': describedByProp,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hasError = error || errorMessage !== undefined;
  const describedBy = [describedByProp, errorMessage !== undefined ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  const wrapperClasses = [
    'shagi-input',
    hasError ? 'shagi-input--error' : null,
    disabled ? 'shagi-input--disabled' : null,
    wrapperClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <div className={wrapperClasses}>
        {leading !== undefined && (
          <span className="shagi-input__adornment" aria-hidden="true">
            {leading}
          </span>
        )}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy.length > 0 ? describedBy : undefined}
          className={['shagi-input__field', className].filter(Boolean).join(' ')}
        />
        {trailing !== undefined && (
          <span className="shagi-input__adornment" aria-hidden="true">
            {trailing}
          </span>
        )}
      </div>
      {errorMessage !== undefined && (
        <p id={errorId} className="shagi-input__error">
          {errorMessage}
        </p>
      )}
    </div>
  );
});
