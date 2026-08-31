/**
 * `Textarea` — многострочный ввод (§10, §11: Default/Focus/Error/Disabled).
 * Ошибка связана программно так же, как у `Input` — см. комментарий там.
 */
import { type ReactNode, type TextareaHTMLAttributes, forwardRef, useId } from 'react';

import './Textarea.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly error?: boolean;
  readonly errorMessage?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    error = false,
    errorMessage,
    className,
    id,
    disabled = false,
    'aria-describedby': describedByProp,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;
  const hasError = error || errorMessage !== undefined;
  const describedBy = [describedByProp, errorMessage !== undefined ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  const classes = ['shagi-textarea', hasError ? 'shagi-textarea--error' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <textarea
        {...rest}
        ref={ref}
        id={textareaId}
        disabled={disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        className={classes}
      />
      {errorMessage !== undefined && (
        <p id={errorId} className="shagi-textarea__error">
          {errorMessage}
        </p>
      )}
    </div>
  );
});
