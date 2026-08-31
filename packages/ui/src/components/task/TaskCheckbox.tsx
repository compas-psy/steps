/**
 * `TaskCheckbox` — переключатель завершения задачи (пакет работ E03.4,
 * `.ultraplan/research/02-ui.md` §2 «Task»). Отличие от `../Checkbox.tsx`:
 * там подпись — видимый текст рядом с полем (клик по тексту переключает
 * поле через нативный `<label>`); здесь заголовок задачи рендерится
 * отдельным элементом в `TaskRow`, не рядом с самим переключателем, поэтому
 * доступное имя приходит только через `aria-label` — компонент физически не
 * рендерит `label` как текст. Тот же приём типовой защиты, что у
 * `IconButton.label` (E03.1): `label` — обязательный `string`, не
 * `string?`, компонент не компилируется без него (см.
 * `test/components/task/TaskCheckbox.types.test.tsx`).
 *
 * `focus` — чисто визуальная связь с состоянием задачи «Главное» (§11,
 * `.ultraplan/research/02-ui.md` §2: «focus: золотой контур + точка-
 * маркер») — сам компонент не решает, фокусная ли задача, только красит
 * контур, когда вызывающий код (`TaskRow`) говорит, что да.
 */
import { type InputHTMLAttributes, forwardRef } from 'react';

import { Icon } from '../Icon.js';
import './TaskCheckbox.css';

export interface TaskCheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size' | 'aria-label'
> {
  /** Обязательное доступное имя — обычно заголовок задачи. Продуктовый
   * текст приносит вызывающий код (ТЗ §3). */
  readonly label: string;
  /** Задача помечена «Главное» — золотой контур вокруг поля. */
  readonly focus?: boolean;
}

export const TaskCheckbox = forwardRef<HTMLInputElement, TaskCheckboxProps>(function TaskCheckbox(
  { label, focus = false, className, disabled = false, ...rest },
  ref,
) {
  const classes = [
    'shagi-task-checkbox',
    focus ? 'shagi-task-checkbox--focus' : null,
    disabled ? 'shagi-task-checkbox--disabled' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      <input
        {...rest}
        ref={ref}
        type="checkbox"
        disabled={disabled}
        aria-label={label}
        className="shagi-task-checkbox__input"
      />
      <span className="shagi-task-checkbox__box" aria-hidden="true">
        <Icon name="check" size={14} className="shagi-task-checkbox__check" />
      </span>
    </span>
  );
});
