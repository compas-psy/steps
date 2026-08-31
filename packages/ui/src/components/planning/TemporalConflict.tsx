/**
 * `TemporalConflict` — отображение уже обнаруженного temporal-конфликта
 * («planned > deadline» и т.п.). Обнаружение — предикаты `@shagi/core`
 * (`isPlannedAfterDeadline` и подобные, другой эпик); этот компонент их не
 * знает и не импортирует `@shagi/core` (пакет работ, «Критическая
 * архитектурная граница») — принимает уже вычисленный тип конфликта и уже
 * сформулированное сообщение (`message` — слот, не строковый литерал,
 * составляет вызывающий код через `@shagi/i18n`), просто показывает их.
 *
 * `type` — размеченный тип (`TemporalConflictType`), не свободная строка:
 * набор возможных конфликтов конечен и известен на этапе компиляции,
 * произвольное значение не должно проходить проверку типов. Используется
 * как CSS-модификатор (`data-conflict-type`) для точечной кастомизации
 * вызывающим кодом, сам компонент визуально не различает подтипы —
 * тревожный акцент (иконка `warning` + `destructive`-тон, §11 «state never
 * color-only» — состояние несёт не только цвет, но и форма иконки) общий
 * для всех.
 *
 * `role="alert"` — конфликт мешает сохранить/подтвердить текущее действие
 * планирования, его стоит анонсировать сразу, тот же принцип что и у
 * `ErrorState` (см. её заголовок).
 */
import type { ReactElement } from 'react';

import { Icon } from '../Icon.js';
import './TemporalConflict.css';

export type TemporalConflictType =
  'plannedAfterDeadline' | 'durationCrossesDeadline' | 'reminderAfterDeadline';

export interface TemporalConflictProps {
  readonly type: TemporalConflictType;
  /** Уже сформулированное сообщение — этот пакет его не составляет. */
  readonly message: string;
  readonly className?: string;
}

export function TemporalConflict({
  type,
  message,
  className,
}: TemporalConflictProps): ReactElement {
  const classes = ['shagi-temporal-conflict', className].filter(Boolean).join(' ');

  return (
    <div className={classes} data-conflict-type={type} role="alert">
      <span className="shagi-temporal-conflict__icon" aria-hidden="true">
        <Icon name="warning" size={16} />
      </span>
      <span className="shagi-temporal-conflict__message">{message}</span>
    </div>
  );
}
