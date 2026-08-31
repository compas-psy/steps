/**
 * `Loading` — индикатор загрузки состояния экрана (§10 «Feedback»). Не
 * дублирует анимацию `Spinner` (E03.1) — компонует её с текстовым слотом
 * (см. заголовок задания). Доступное имя устроено так же, как у самого
 * `Spinner`/`Icon`: видимый `children` уже несёт смысл — тогда сам `Spinner`
 * внутри декоративен, а контейнер получает `role="status"` для вежливого
 * анонса текста; без видимого `children` неозвученным его не оставляем —
 * `label` уходит в `Spinner`, который сам понимает этот контракт
 * (`role="status"`, `aria-label`). Два `aria-live`-региона одновременно не
 * заводится — ровно один в любой ветке (либо на обёртке, либо внутри
 * `Spinner`), иначе одно и то же состояние объявлялось бы дважды.
 */
import type { ReactElement, ReactNode } from 'react';

import { Spinner, type SpinnerSize } from '../Spinner.js';
import './Loading.css';

export interface LoadingProps {
  /** Видимый текст под спиннером. Не задан → используется `label` как
   * доступное имя без видимого текста. */
  readonly children?: ReactNode;
  /** Доступное имя для варианта без видимого `children` (перевод приносит
   * вызывающий код). */
  readonly label?: string;
  readonly size?: SpinnerSize;
  readonly className?: string;
}

export function Loading({ children, label, size = 'md', className }: LoadingProps): ReactElement {
  const hasVisibleText = children !== undefined;
  const spinnerLabelProps = !hasVisibleText && label !== undefined ? { label } : {};

  return (
    <div
      className={['shagi-loading', className].filter(Boolean).join(' ')}
      role={hasVisibleText ? 'status' : undefined}
      aria-live={hasVisibleText ? 'polite' : undefined}
    >
      <Spinner size={size} {...spinnerLabelProps} />
      {hasVisibleText && <p className="shagi-loading__text">{children}</p>}
    </div>
  );
}
