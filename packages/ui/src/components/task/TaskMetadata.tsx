/**
 * `TaskMetadata` — строка вспомогательной информации под заголовком задачи
 * (пакет работ E03.4). Дата/проект/метки — слоты, которые собирает
 * вызывающий код (`TaskMetadataItem` ниже — необязательный помощник для
 * пары «иконка + значение», сам компонент не хранит ни одной строки —
 * `children` целиком приходит снаружи, ТЗ §3). Порядок и состав элементов —
 * решение вызывающего кода, не структура, зашитая здесь (тот же принцип,
 * что `Menu.sections` в E03.3).
 */
import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import './TaskMetadata.css';

export interface TaskMetadataProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
}

export function TaskMetadata({ children, className, ...rest }: TaskMetadataProps): ReactElement {
  return (
    <div {...rest} className={['shagi-task-metadata', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export interface TaskMetadataItemProps {
  /** Декоративная иконка перед значением — смысл несёт `children`. */
  readonly icon?: IconName;
  readonly children: ReactNode;
  readonly className?: string;
}

export function TaskMetadataItem({
  icon,
  children,
  className,
}: TaskMetadataItemProps): ReactElement {
  return (
    <span className={['shagi-task-metadata__item', className].filter(Boolean).join(' ')}>
      {icon !== undefined && (
        <span className="shagi-task-metadata__item-icon" aria-hidden="true">
          <Icon name={icon} size={12} />
        </span>
      )}
      {children}
    </span>
  );
}
