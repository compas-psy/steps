/**
 * `NLPToken` — chip распознанного NLP-фрагмента (§10 «Capture», задание
 * E03.7). Тонкая обёртка над `Chip` (`../Chip.tsx`) — не новая реализация:
 * весь интерактивный/removable-контракт (кнопка vs `<span>`, крестик с
 * обязательным доступным именем) уже решён там, здесь только добавляется
 * словарь `kind` → `tone`/`icon`.
 *
 * `kind` — закрытый enum, а не свободная строка (задание: «сам компонент
 * не знает, что означает конкретный kind семантически»). Значения
 * дословно повторяют `ChipCategory` из `packages/nlp/src/types.ts`
 * (`date | weekday | time | deadline | duration | recurrence | project |
 * label | priority`, комментарий там же — «§4 категорий грамматики») —
 * НЕ импортированы оттуда (презентационный пакет не видит `@shagi/nlp`,
 * см. `test/components/capture/forbidden-imports.test.ts`), а переписаны
 * локально ради общего словаря терминов между пакетами. Компонент не
 * знает, что означает, например, `deadline` содержательно — только красит
 * и подписывает иконкой это конкретное значение enum иначе, чем `date`.
 *
 * `deadline` дополнительно получает жирный label (`NLPToken.css`) — не
 * единственный носитель смысла остаётся тон+иконка (§11 «state never
 * color-only»), вес текста — третий независимый канал для самого срочного
 * из перечисленных видов фрагмента.
 */
import type { ReactElement, ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Chip, type ChipTone } from '../Chip.js';

export type NLPTokenKind =
  | 'date'
  | 'weekday'
  | 'time'
  | 'deadline'
  | 'duration'
  | 'recurrence'
  | 'project'
  | 'label'
  | 'priority';

const KIND_ICON: Record<NLPTokenKind, IconName> = {
  date: 'calendar',
  weekday: 'calendar',
  time: 'clock',
  deadline: 'deadline',
  duration: 'duration',
  recurrence: 'repeat',
  project: 'folder',
  label: 'tags',
  priority: 'priority',
};

const KIND_TONE: Record<NLPTokenKind, ChipTone> = {
  date: 'blue',
  weekday: 'blue',
  time: 'violet',
  deadline: 'red',
  duration: 'violet',
  recurrence: 'gold',
  project: 'forest',
  label: 'neutral',
  priority: 'orange',
};

interface NLPTokenBaseProps {
  readonly kind: NLPTokenKind;
  readonly children: ReactNode;
  /** Заданное значение переключает токен в кнопку — клик открывает
   * редактирование распознанного значения (само редактирование — не
   * зона этого компонента, только событие). */
  readonly onEdit?: () => void;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

type NLPTokenRemovableProps =
  | { readonly removable?: false; readonly removeLabel?: undefined; readonly onRemove?: undefined }
  | { readonly removable: true; readonly removeLabel: string; readonly onRemove: () => void };

export type NLPTokenProps = NLPTokenBaseProps & NLPTokenRemovableProps;

export function NLPToken(props: NLPTokenProps): ReactElement {
  const { kind, children, onEdit, selected, disabled = false, className } = props;
  const classes = ['shagi-nlp-token', `shagi-nlp-token--${kind}`, className]
    .filter(Boolean)
    .join(' ');
  const tone = KIND_TONE[kind];
  const icon = KIND_ICON[kind];

  // Прокидываем `selected`/`onClick` только когда заданы: `exactOptionalPropertyTypes`
  // (`tsconfig.base.json`) различает «пропс не задан» и «пропс явно равен
  // undefined» — Chip.selected?: boolean не принимает `boolean | undefined`
  // напрямую, только реальное отсутствие ключа.
  const optionalChipProps = {
    ...(selected !== undefined ? { selected } : {}),
    ...(onEdit !== undefined ? { onClick: onEdit } : {}),
  };

  if (props.removable === true) {
    return (
      <Chip
        tone={tone}
        icon={icon}
        disabled={disabled}
        removable
        removeLabel={props.removeLabel}
        onRemove={props.onRemove}
        className={classes}
        {...optionalChipProps}
      >
        {children}
      </Chip>
    );
  }

  return (
    <Chip tone={tone} icon={icon} disabled={disabled} className={classes} {...optionalChipProps}>
      {children}
    </Chip>
  );
}
