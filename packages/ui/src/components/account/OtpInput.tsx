/**
 * `OtpInput` — ввод одноразового кода отдельными ячейками-цифрами (§10
 * «Account/Data», M03 «Sign in — email OTP»). Presentational: `value` —
 * управляемая строка длиной до `length`, компонент не знает про протокол
 * OTP/сеть — только раскладывает строку по ячейкам и сообщает об изменении
 * через `onChange`.
 *
 * Одна логическая строка `value`, а не массив ячеек в состоянии компонента:
 * так вставка (paste) целого кода и посимвольный ввод обновляют один и тот
 * же источник истины без рассинхронизации между `value`/DOM-фокусом —
 * фокус выводится из длины `value` при каждом изменении, а не хранится
 * отдельно.
 *
 * Автопереход фокуса (ввод → следующая ячейка, `Backspace` на пустой →
 * предыдущая) — тот же принцип «клавиатура остаётся предсказуемой без
 * отдельного стейт-машины», что и roving tabIndex в `planning/DatePicker`,
 * упрощённый до линейной последовательности (здесь нет двух измерений).
 *
 * Каждая ячейка — `role="textbox"` через `inputMode="numeric"` (не
 * `type="tel"`, чтобы не тащить браузерные подсказки телефонных номеров) —
 * `aria-label` собирается из обязательного `label` вызывающего кода плюс
 * порядковый номер (число, не хардкоженное слово) — так у каждой ячейки
 * есть различимое доступное имя без завязки на конкретный язык внутри
 * пакета (ТЗ §3: продуктовый текст только пропсами).
 */
import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useRef,
} from 'react';

import './OtpInput.css';

export interface OtpInputProps {
  /** Количество ячеек. */
  readonly length?: number;
  /** Управляемое значение — строка цифр длиной 0..`length`. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Вызывается один раз, когда `value` после изменения достигает `length`. */
  readonly onComplete?: (value: string) => void;
  /** Доступное имя группы ячеек (аналог `IconButton.label`). */
  readonly label: string;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: ReactNode;
  readonly autoFocus?: boolean;
  readonly className?: string;
}

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  label,
  loading = false,
  disabled = false,
  error = false,
  errorMessage,
  autoFocus = false,
  className,
}: OtpInputProps): ReactElement {
  const generatedId = useId();
  const errorId = `${generatedId}-error`;
  const isDisabled = disabled || loading;
  const cellRefs = useRef<Array<HTMLInputElement | null>>([]);

  function focusCell(index: number): void {
    cellRefs.current[index]?.focus();
  }

  function commit(nextValue: string, focusIndex: number): void {
    const trimmed = nextValue.slice(0, length);
    onChange(trimmed);
    if (trimmed.length === length) {
      onComplete?.(trimmed);
    }
    focusCell(Math.min(focusIndex, length - 1));
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>): void {
    const digits = onlyDigits(event.target.value);
    if (digits.length === 0) {
      // Значение стёрто (например выделением и Delete) — очищаем только эту
      // позицию, не сдвигая фокус.
      const chars = value.split('');
      chars[index] = '';
      onChange(chars.join('').replace(/\s+$/, ''));
      return;
    }
    // Берём последний введённый символ — так автозаполнение браузера или
    // повторное нажатие поверх уже занятой ячейки не оставляет "хвост".
    const digit = digits.slice(-1);
    const chars = value.padEnd(length, ' ').split('');
    chars[index] = digit;
    const nextValue = chars.join('').replace(/\s+$/, '');
    commit(nextValue, index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace' && (value[index] === undefined || value[index] === '')) {
      if (index > 0) {
        event.preventDefault();
        const chars = value.split('');
        chars[index - 1] = '';
        onChange(chars.join('').replace(/\s+$/, ''));
        focusCell(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusCell(index - 1);
      return;
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      focusCell(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>): void {
    const digits = onlyDigits(event.clipboardData.getData('text'));
    if (digits.length === 0) {
      return;
    }
    event.preventDefault();
    commit(digits, index + digits.length);
  }

  const cells = Array.from({ length }, (_, index) => value[index] ?? '');

  return (
    <div className={['shagi-otp-input', className].filter(Boolean).join(' ')}>
      <div
        role="group"
        aria-label={label}
        aria-describedby={errorMessage !== undefined ? errorId : undefined}
        className={['shagi-otp-input__cells', error ? 'shagi-otp-input__cells--error' : null]
          .filter(Boolean)
          .join(' ')}
      >
        {cells.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              cellRefs.current[index] = node;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            aria-label={`${label} ${index + 1}`}
            aria-invalid={error || undefined}
            disabled={isDisabled}
            autoFocus={autoFocus && index === 0}
            className="shagi-otp-input__cell"
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
          />
        ))}
      </div>
      {errorMessage !== undefined && (
        <p id={errorId} className="shagi-otp-input__error">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
