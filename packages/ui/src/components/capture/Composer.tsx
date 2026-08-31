/**
 * `Composer` — расширенная форма ввода (§10 «Capture», V01 «Composer/
 * Multimodal», задание E03.7): эволюция Quick Add в три вкладки «Текст /
 * Голос / Файл» (голос — не отдельное приложение, файл — будущий
 * адаптер изображение/PDF/текст, `.ultraplan/research/02-ui.md` §2).
 *
 * Реализован как тонкий контейнер над `../navigation/Tabs.tsx` — задание
 * прямо запрещает изобретать новую табную реализацию. Три вкладки —
 * фиксированный набор (`ComposerMode`), а не произвольный список: это
 * тройка режимов из ТЗ, не обобщённые табы. Содержимое каждой вкладки —
 * слот (`textSlot`/`voiceSlot`/`fileSlot`), сам `Composer` не знает, что
 * внутри — распознавание голоса/файлов не его зона, только контейнер.
 *
 * `voiceDisabled`/`fileDisabled` — отключают, но не прячут вкладки
 * будущих адаптеров: пользователь видит, что режим существует, раньше,
 * чем он станет доступен (тот же смысл, что `disabled` у `TabItem` в
 * `Tabs.tsx`, здесь просто прокинут по имени режима, а не индексу).
 */
import type { ReactElement, ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Tabs, type TabItem } from '../navigation/Tabs.js';
import './Composer.css';

export type ComposerMode = 'text' | 'voice' | 'file';

export interface ComposerProps {
  readonly mode: ComposerMode;
  readonly onModeChange: (mode: ComposerMode) => void;
  /** Доступное имя `tablist` (см. `Tabs.label`). */
  readonly label: string;
  readonly textLabel: ReactNode;
  readonly voiceLabel: ReactNode;
  readonly fileLabel: ReactNode;
  readonly textSlot: ReactNode;
  readonly voiceSlot: ReactNode;
  readonly fileSlot: ReactNode;
  readonly textIcon?: IconName;
  readonly voiceIcon?: IconName;
  readonly fileIcon?: IconName;
  readonly voiceDisabled?: boolean;
  readonly fileDisabled?: boolean;
  readonly className?: string;
}

export function Composer({
  mode,
  onModeChange,
  label,
  textLabel,
  voiceLabel,
  fileLabel,
  textSlot,
  voiceSlot,
  fileSlot,
  textIcon,
  voiceIcon,
  fileIcon,
  voiceDisabled = false,
  fileDisabled = false,
  className,
}: ComposerProps): ReactElement {
  // `exactOptionalPropertyTypes` (`tsconfig.base.json`) — `TabItem.icon?: IconName`
  // не принимает `IconName | undefined` напрямую, только реальное отсутствие
  // ключа, см. тот же приём в `NLPToken.tsx`.
  const items: readonly TabItem<ComposerMode>[] = [
    {
      value: 'text',
      label: textLabel,
      panel: textSlot,
      ...(textIcon !== undefined ? { icon: textIcon } : {}),
    },
    {
      value: 'voice',
      label: voiceLabel,
      panel: voiceSlot,
      disabled: voiceDisabled,
      ...(voiceIcon !== undefined ? { icon: voiceIcon } : {}),
    },
    {
      value: 'file',
      label: fileLabel,
      panel: fileSlot,
      disabled: fileDisabled,
      ...(fileIcon !== undefined ? { icon: fileIcon } : {}),
    },
  ];

  return (
    <div className={['shagi-composer', className].filter(Boolean).join(' ')}>
      <Tabs items={items} value={mode} onChange={onModeChange} label={label} />
    </div>
  );
}
