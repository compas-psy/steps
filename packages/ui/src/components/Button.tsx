/**
 * `Button` — основное действие (`04_UI_DESIGN_SYSTEM.md` §10 «Primitives»).
 * Состояния §11: Default/Hover/Pressed/Focus/Disabled/Loading.
 *
 * `disabled` и `loading` — разные состояния (§11 перечисляет оба отдельно),
 * поэтому обрабатываются по-разному:
 * - `disabled` — нативный HTML-атрибут: кнопка выпадает из tab-порядка,
 *   браузер сам не пускает клик, `:disabled` в CSS работает бесплатно.
 * - `loading` — кнопка остаётся в тот же tab-порядке (пользователь
 *   скринридера не теряет фокус, пока идёт асинхронная операция),
 *   `aria-busy="true"` сообщает об этом ассистивным технологиям, а клик
 *   гасится в обработчике (нативный `disabled` здесь не подходит — он же
 *   убрал бы фокус).
 *
 * Текст кнопки — обязательный `children`, а не опциональный: кнопка без
 * подписи — это `IconButton`, а не `Button` с пропущенным текстом.
 */
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';

import { Spinner } from './Spinner.js';
import './Button.css';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Растянуть на всю ширину контейнера. */
  readonly block?: boolean;
  /** Асинхронная операция в процессе — см. заголовок файла. */
  readonly loading?: boolean;
  /** Декоративная иконка перед текстом (`<Icon />` с `label` не задан). */
  readonly leadingIcon?: ReactNode;
  /** Декоративная иконка после текста. */
  readonly trailingIcon?: ReactNode;
  readonly children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    disabled = false,
    leadingIcon,
    trailingIcon,
    children,
    className,
    type = 'button',
    onClick,
    ...rest
  },
  ref,
) {
  const classes = [
    'shagi-button',
    `shagi-button--${variant}`,
    `shagi-button--${size}`,
    block ? 'shagi-button--block' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading && (
        <span className="shagi-button__spinner-wrap" aria-hidden="true">
          <Spinner size={size === 'sm' ? 'sm' : 'md'} tone="current" />
        </span>
      )}
      {leadingIcon !== undefined && <span className="shagi-button__icon">{leadingIcon}</span>}
      <span className="shagi-button__label">{children}</span>
      {trailingIcon !== undefined && <span className="shagi-button__icon">{trailingIcon}</span>}
    </button>
  );
});
