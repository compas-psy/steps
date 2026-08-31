/**
 * `QuickAdd` — компактная строка быстрого добавления задачи (§10
 * «Capture», V01 Global Quick Add — D12; задание E03.7): иконка + поле +
 * кнопка отправки. Presentational — разбор текста делает `@shagi/nlp`,
 * не здесь (см. `test/components/capture/forbidden-imports.test.ts`):
 * компонент только держит контролируемое `value`/`onChange` и сообщает
 * `onSubmit`, когда пользователь просит добавить.
 *
 * Обёрнуто в `<form>`, а не в ручной `onKeyDown` на Enter — так Enter в
 * `<input>` отправляет форму нативным поведением браузера без
 * дублирования логики клавиатуры, а `IconButton` с `type="submit"`
 * получает ту же семантику, что и клик.
 *
 * Кнопка недоступна, пока `value.trim()` пуст — это общий UI-паттерн
 * «нечего отправлять» (как в любой строке поиска/чата), а не бизнес-
 * правило NLP: компонент не решает, ЧТО считается валидной задачей,
 * только что пустая строка не отправляется.
 *
 * `label` — доступное имя текстового поля (аналог `IconButton.label`):
 * строка компактная, видимого `<label>` нет, поэтому это обязательный
 * пропс, а не опция.
 */
import { type FormEvent, type ReactElement, type ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';
import { Input } from '../Input.js';
import './QuickAdd.css';

export interface QuickAddProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  /** Доступное имя текстового поля — обязателен, см. заголовок файла. */
  readonly label: string;
  /** Доступное имя icon-only кнопки отправки (паттерн `IconButton.label`). */
  readonly submitLabel: string;
  readonly placeholder?: string;
  /** Декоративная иконка перед полем. */
  readonly icon?: IconName;
  readonly submitIcon?: IconName;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: ReactNode;
  readonly autoFocus?: boolean;
  readonly id?: string;
  readonly className?: string;
}

export function QuickAdd({
  value,
  onChange,
  onSubmit,
  label,
  submitLabel,
  placeholder,
  icon,
  submitIcon = 'add',
  loading = false,
  disabled = false,
  error = false,
  errorMessage,
  autoFocus = false,
  id,
  className,
}: QuickAddProps): ReactElement {
  const canSubmit = !disabled && !loading && value.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (canSubmit) {
      onSubmit();
    }
  }

  return (
    <form
      className={['shagi-quick-add', className].filter(Boolean).join(' ')}
      onSubmit={handleSubmit}
    >
      <div className="shagi-quick-add__field">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          leading={icon !== undefined ? <Icon name={icon} size={18} /> : undefined}
          disabled={disabled}
          error={error}
          errorMessage={errorMessage}
          autoFocus={autoFocus}
        />
      </div>
      <IconButton
        type="submit"
        icon={submitIcon}
        label={submitLabel}
        loading={loading}
        disabled={!canSubmit}
        variant="primary"
        className="shagi-quick-add__submit"
      />
    </form>
  );
}
