/**
 * `FocusMarker` — визуальный маркер задачи «Главное» (пакет работ E03.4,
 * `.ultraplan/research/02-ui.md` §2 «Task»: «focus: золотой контур + точка-
 * маркер»). Чисто декоративный (`aria-hidden`) — доступный сигнал состояния
 * Focus несёт сама строка (`TaskRow` ставит `aria-current` на себя), этот
 * компонент только рисует точку с золотым нимбом рядом с заголовком. Не
 * хранит текста «Главное» — это продуктовая подпись, дело `packages/app`
 * + `@shagi/i18n` (ТЗ §3).
 */
import type { ReactElement } from 'react';

import './FocusMarker.css';

export interface FocusMarkerProps {
  readonly className?: string;
}

export function FocusMarker({ className }: FocusMarkerProps): ReactElement {
  return (
    <span
      className={['shagi-focus-marker', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}
