/**
 * `IconButton` — кнопка без видимого текста (§10 «Primitives»). §15
 * («icon button accessible names» — блокер релиза) требует, чтобы у такой
 * кнопки ВСЕГДА было доступное имя. Здесь это выражено типами, не
 * рантайм-проверкой: `label` — обязательный пропс (`string`, не `string?`),
 * компонент физически не компилируется без него — см.
 * `test/components/IconButton.test.tsx`, где `@ts-expect-error` показывает
 * это на уровне `tsc`, а не только в рантайм-тесте.
 *
 * Иконка внутри остаётся декоративной (`Icon` без `label`, `aria-hidden`) —
 * доступное имя несёт сама кнопка через `aria-label`, а не иконка: одно
 * место истины для accessible name, а не два синхронизируемых вручную.
 */
import { type ButtonHTMLAttributes, forwardRef } from 'react';

import type { IconName } from '../icons/index.js';
import { Icon } from './Icon.js';
import { Spinner } from './Spinner.js';
import './IconButton.css';

export type IconButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Имя иконки из реестра `src/icons/`. */
  readonly icon: IconName;
  /** Обязательное доступное имя — см. заголовок файла. Продуктовый текст
   * (перевод) приносит вызывающий код, `packages/i18n`. */
  readonly label: string;
  readonly variant?: IconButtonVariant;
  readonly size?: IconButtonSize;
  readonly loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    variant = 'ghost',
    size = 'md',
    loading = false,
    disabled = false,
    className,
    type = 'button',
    onClick,
    ...rest
  },
  ref,
) {
  const classes = [
    'shagi-icon-button',
    `shagi-icon-button--${variant}`,
    `shagi-icon-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 24 : 20;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes}
      aria-label={label}
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
        <span className="shagi-icon-button__spinner-wrap" aria-hidden="true">
          <Spinner size={size === 'lg' ? 'md' : 'sm'} tone="current" />
        </span>
      )}
      <span className="shagi-icon-button__icon">
        <Icon name={icon} size={iconSize} />
      </span>
    </button>
  );
});
