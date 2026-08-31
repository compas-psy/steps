/**
 * `Label` — метка задачи (§10 «Organization»: «название + опциональный
 * маркер цвета», ссылается на §4.1 «R1 Project marker palette»: «Labels
 * have no arbitrary color picker in R1»). В отличие от `ProjectRow`, у
 * `Label` маркер по-настоящему опционален — если `color` не задан, точка
 * не рендерится вовсе (не дефолт на нейтральный цвет): «опциональный
 * маркер» в тексте §10 means может не быть маркера у метки в принципе, а
 * не «маркер всегда есть, просто серый».
 *
 * Три формы — дословно тот же контракт, что `Chip` (`../Chip.tsx`,
 * читай его заголовок): статичный `<span>`, переключаемый
 * `<button aria-pressed>` (пикер меток, M33 «Labels: найти/создать/
 * выбрать»), удаляемый (снять метку с задачи, крестик с обязательным
 * `removeLabel`). Не повторное использование самого `Chip` — `Label`
 * держит собственный, более узкий enum цвета (`MarkerColor`, 7 значений)
 * вместо широкого `ChipTone` (`success` и т.п., не относящихся к палитре
 * меток/проектов).
 */
import type { MouseEventHandler, ReactElement, ReactNode } from 'react';

import type { MarkerColor } from './internal/markerColor.js';
import { Icon } from '../Icon.js';
import './Label.css';

interface LabelBaseProps {
  readonly children: ReactNode;
  /** Маркер цвета метки — опционален (см. заголовок файла). */
  readonly color?: MarkerColor;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly className?: string;
}

type LabelRemovableProps =
  | { readonly removable?: false; readonly removeLabel?: undefined; readonly onRemove?: undefined }
  | { readonly removable: true; readonly removeLabel: string; readonly onRemove: () => void };

export type LabelProps = LabelBaseProps & LabelRemovableProps;

export function Label(props: LabelProps): ReactElement {
  const { children, color, selected, disabled = false, onClick, className } = props;
  const classes = ['shagi-label', className].filter(Boolean).join(' ');

  const content = (
    <>
      {color !== undefined && (
        <span
          data-testid="label-marker"
          aria-hidden="true"
          className={`shagi-label__marker shagi-label__marker--${color}`}
        />
      )}
      <span className="shagi-label__name">{children}</span>
      {props.removable === true && (
        <button
          type="button"
          className="shagi-label__remove"
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
