/**
 * `TaskRow` — строка списка задачи (пакет работ E03.4,
 * `.ultraplan/research/02-ui.md` §2 «Task»). Чисто презентационный: не
 * вычисляет, в каком состоянии задача (это `classifyTaskForToday` в
 * `@shagi/core`, другой пакет/эпик) — только отображает уже посчитанное
 * состояние, переданное пропсом `state` (задание, раздел «Критическая
 * архитектурная граница»). Даты/время приходят отформатированными строками
 * через слоты (`statusLabel`, `metadata`), не через `Temporal` — этого
 * пакета нет и не будет в `packages/ui`.
 *
 * Девять состояний (§11) — union, буквально из задания, не отдельные
 * булевы пропсы: одна задача не может одновременно быть и Focus, и
 * Selected с точки зрения этого компонента (сочетание состояний, если оно
 * понадобится продукту, — решение `packages/app`, здесь только один слот).
 *
 * «Никогда не только цветом» (§11) — для каждого состояния, где только
 * цвета было бы недостаточно, добавлен структурный или иконочный сигнал,
 * не требующий продуктового текста:
 * - focus — точка-маркер `FocusMarker` (не только золотой контур строки);
 * - missedPlan/deadlineSoon/deadlineMissed — своя декоративная иконка
 *   рядом с заголовком (часы / дедлайн / «!»-бейдж `overdue`, ровно
 *   пример из конспекта) плюс слот `statusLabel` под подпись вида
 *   «до 27 авг», которую форматирует вызывающий код;
 * - recurring — иконка повтора;
 * - completed — зачёркивание заголовка (структура текста, не только
 *   приглушённый цвет) плюс сам чекбокс уже отмечен через `checked`;
 * - selected — заливка чекбокса форсируется через CSS от класса строки
 *   (`.shagi-task-row--selected .shagi-task-checkbox__box`, см. .css),
 *   независимо от фактического `checked` — это выбор для массового
 *   действия, не завершение, плюс фон `sage-100`, ровно пример конспекта;
 * - dragging — иконка `dragHandle` плюс приподнятая тень (`--shadow-floating`),
 *   не только сниженная непрозрачность.
 *
 * ARIA (§15, задание «Требования» п.3): Focus — `aria-current="true"` на
 * строке (задача, которую пользователь выделил как текущий приоритет —
 * семантика `aria-current` подходит лучше, чем `aria-selected`, который
 * ARIA резервирует за списками с выбором). Selected — `aria-selected` на
 * строке (это и есть выбор для массового действия). Completed выражен
 * нативно через `checked` вложенного `<input type="checkbox">` —
 * отдельный `aria-checked` не нужен, нативный чекбокс уже даёт его
 * ассистивным технологиям бесплатно.
 */
import { type HTMLAttributes, type ReactElement, type ReactNode, forwardRef } from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import { FocusMarker } from './FocusMarker.js';
import { TaskCheckbox } from './TaskCheckbox.js';
import './TaskRow.css';

export type TaskRowState =
  | 'normal'
  | 'focus'
  | 'missedPlan'
  | 'deadlineSoon'
  | 'deadlineMissed'
  | 'recurring'
  | 'completed'
  | 'selected'
  | 'dragging';

const TASK_ROW_STATE_ICON: Partial<Record<TaskRowState, IconName>> = {
  missedPlan: 'clock',
  deadlineSoon: 'deadline',
  deadlineMissed: 'overdue',
  recurring: 'repeat',
};

export interface TaskRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Заголовок задачи. `ReactNode`, не `string` — вызывающий код волен
   * выделить в нём распознанные NLP-токены и т.п. */
  readonly title: ReactNode;
  readonly state?: TaskRowState;
  readonly checked: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  /** Обязательное доступное имя чекбокса (см. `TaskCheckbox.label`) —
   * обычно заголовок задачи в виде обычной строки. */
  readonly checkboxLabel: string;
  /** Слот `TaskMetadata` — дата/проект/метки. */
  readonly metadata?: ReactNode;
  /** Подпись состояния (например «до 27 авг» для missedPlan/deadline*) —
   * форматирует вызывающий код через `@shagi/i18n`, компонент не трогает
   * даты сам. */
  readonly statusLabel?: ReactNode;
  /** Действия/меню в конце строки — например `TaskMenu`. */
  readonly trailing?: ReactNode;
  readonly disabled?: boolean;
}

export const TaskRow = forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
  {
    title,
    state = 'normal',
    checked,
    onCheckedChange,
    checkboxLabel,
    metadata,
    statusLabel,
    trailing,
    disabled = false,
    className,
    ...rest
  },
  ref,
): ReactElement {
  const classes = [
    'shagi-task-row',
    `shagi-task-row--${state}`,
    disabled ? 'shagi-task-row--disabled' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const stateIcon = TASK_ROW_STATE_ICON[state];
  const hasMetaLine = statusLabel !== undefined || metadata !== undefined;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes}
      aria-current={state === 'focus' ? 'true' : undefined}
      aria-selected={state === 'selected' ? true : undefined}
    >
      {state === 'dragging' && (
        <span className="shagi-task-row__drag-handle" aria-hidden="true">
          <Icon name="dragHandle" size={16} />
        </span>
      )}
      {state === 'focus' && <FocusMarker className="shagi-task-row__focus-marker" />}
      <TaskCheckbox
        className="shagi-task-row__checkbox"
        label={checkboxLabel}
        checked={checked}
        disabled={disabled}
        focus={state === 'focus'}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      <div className="shagi-task-row__content">
        <div className="shagi-task-row__title-line">
          {stateIcon !== undefined && (
            <span className="shagi-task-row__state-icon" aria-hidden="true">
              <Icon name={stateIcon} size={14} />
            </span>
          )}
          <span className="shagi-task-row__title">{title}</span>
        </div>
        {hasMetaLine && (
          <div className="shagi-task-row__meta-line">
            {statusLabel !== undefined && (
              <span className="shagi-task-row__status-label">{statusLabel}</span>
            )}
            {metadata}
          </div>
        )}
      </div>
      {trailing !== undefined && <div className="shagi-task-row__trailing">{trailing}</div>}
    </div>
  );
});
