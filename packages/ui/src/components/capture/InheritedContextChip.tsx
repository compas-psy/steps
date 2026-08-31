/**
 * `InheritedContextChip` — chip унаследованного контекста (§10 «Capture»,
 * задание E03.7), например проект по умолчанию при добавлении из экрана
 * проекта. Presentational-обёртка над `Chip`, тот же приём, что и
 * `NLPToken.tsx` — значение и решение, что именно унаследовано,
 * приносит вызывающий код (`@shagi/app`).
 *
 * Смысловой ориентир — `ChipOrigin = 'inherited' | 'implied'` в
 * `packages/nlp/src/types.ts` («не имеют исходного текста... правило
 * "никогда не угадывать молча"»): унаследованное значение визуально
 * мягче явного (`InheritedContextChip.css` — пунктирная рамка вместо
 * заливки тона), чтобы отличаться от `NLPToken` с `kind="project"`,
 * который показывает явно распознанный из текста фрагмент. Компонент не
 * импортирует `@shagi/nlp` — это только словесная параллель в
 * комментарии, а не зависимость.
 */
import type { ReactElement, ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Chip, type ChipTone } from '../Chip.js';

interface InheritedContextChipBaseProps {
  readonly children: ReactNode;
  readonly icon?: IconName;
  readonly tone?: ChipTone;
  readonly disabled?: boolean;
  readonly className?: string;
}

type InheritedContextChipRemovableProps =
  | { readonly removable?: false; readonly removeLabel?: undefined; readonly onRemove?: undefined }
  | { readonly removable: true; readonly removeLabel: string; readonly onRemove: () => void };

export type InheritedContextChipProps = InheritedContextChipBaseProps &
  InheritedContextChipRemovableProps;

export function InheritedContextChip(props: InheritedContextChipProps): ReactElement {
  const { children, icon, tone = 'neutral', disabled = false, className } = props;
  const classes = ['shagi-inherited-context-chip', className].filter(Boolean).join(' ');
  // `exactOptionalPropertyTypes` (`tsconfig.base.json`) — см. комментарий с тем
  // же приёмом в `NLPToken.tsx`.
  const optionalChipProps = icon !== undefined ? { icon } : {};

  if (props.removable === true) {
    return (
      <Chip
        tone={tone}
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
    <Chip tone={tone} disabled={disabled} className={classes} {...optionalChipProps}>
      {children}
    </Chip>
  );
}
