/**
 * `Chip` — тег даты/приоритета/метки и т.п. (§10 «Primitives», §11: Default/
 * Selected/Removable). Требование задания: заложить в `Chip` поддержку
 * иконки/текста рядом с цветом уже сейчас, чтобы задачные состояния (§4.1,
 * §11 — «state never color-only») в следующем пакете работ не потребовали
 * переделки примитива — отсюда `icon` как отдельный пропс, не только `tone`.
 *
 * Три формы:
 * - статичный (`<span>`) — ни `onClick`, ни `selected` не заданы: просто
 *   отображает значение (например дата в TaskRow);
 * - переключаемый (`<button aria-pressed>`) — `onClick` и/или `selected`
 *   заданы (фильтр-чип, тег с возможностью снять выбор);
 * - удаляемый — `removable: true` требует типами и `removeLabel`, и
 *   `onRemove` разом (нельзя дать чипу крестик без доступного имени для
 *   него — тот же приём, что у `IconButton.label`, просто выражен через
 *   дискриминирующее объединение, а не единственный обязательный пропс).
 */
import type { MouseEventHandler, ReactElement, ReactNode } from 'react';

import type { IconName } from '../icons/index.js';
import { Icon } from './Icon.js';
import './Chip.css';

export type ChipTone =
  'neutral' | 'forest' | 'gold' | 'blue' | 'violet' | 'orange' | 'red' | 'success';

interface ChipBaseProps {
  readonly children: ReactNode;
  readonly tone?: ChipTone;
  /** Декоративная иконка перед текстом — смысл несёт `children`, иконка его
   * усиливает, а не заменяет. */
  readonly icon?: IconName;
  /** Заданное значение переключает чип в `<button aria-pressed>`. */
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly className?: string;
}

type ChipRemovableProps =
  | { readonly removable?: false; readonly removeLabel?: undefined; readonly onRemove?: undefined }
  | { readonly removable: true; readonly removeLabel: string; readonly onRemove: () => void };

export type ChipProps = ChipBaseProps & ChipRemovableProps;

export function Chip(props: ChipProps): ReactElement {
  const {
    children,
    tone = 'neutral',
    icon,
    selected,
    disabled = false,
    onClick,
    className,
  } = props;
  const classes = ['shagi-chip', `shagi-chip--${tone}`, className].filter(Boolean).join(' ');

  const content = (
    <>
      {icon !== undefined && (
        <span className="shagi-chip__icon">
          <Icon name={icon} size={14} />
        </span>
      )}
      <span className="shagi-chip__label">{children}</span>
      {props.removable === true && (
        <button
          type="button"
          className="shagi-chip__remove"
          aria-label={props.removeLabel}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            props.onRemove();
          }}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </>
  );

  const isInteractive = onClick !== undefined || selected !== undefined;
  if (isInteractive) {
    return (
      <button
        type="button"
        className={classes}
        disabled={disabled}
        aria-pressed={selected}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <span className={classes}>{content}</span>;
}
