/**
 * `ParsingPreview` — область предпросмотра результата NLP-разбора (§10
 * «Capture», задание E03.7): очищенный заголовок + набор `NLPToken`, до
 * сабмита. Чисто презентационный — принимает уже готовые `title` и
 * `tokens` через пропсы, сам ничего не парсит (парсинг — `@shagi/nlp`,
 * сборка результата под конкретный экран — `@shagi/app`).
 *
 * `tokens` — те же данные, что несёт `NLPToken`, плюс `id` для React-ключа
 * и та же дискриминация `removable`, что у `Chip`/`NLPToken` — каждый
 * токен превью может независимо предложить снять себя, не завязываясь на
 * порядок в массиве.
 */
import type { ReactElement, ReactNode } from 'react';

import { NLPToken, type NLPTokenKind } from './NLPToken.js';
import './ParsingPreview.css';

interface ParsingPreviewTokenBase {
  readonly id: string;
  readonly kind: NLPTokenKind;
  readonly label: ReactNode;
}

type ParsingPreviewTokenRemovable =
  | { readonly removable?: false; readonly removeLabel?: undefined; readonly onRemove?: undefined }
  | { readonly removable: true; readonly removeLabel: string; readonly onRemove: () => void };

export type ParsingPreviewToken = ParsingPreviewTokenBase & ParsingPreviewTokenRemovable;

export interface ParsingPreviewProps {
  readonly title: ReactNode;
  readonly tokens: readonly ParsingPreviewToken[];
  /** Доступное имя области предпросмотра (`role="region"`). */
  readonly label: string;
  /** Слот на случай, если распознавать пока нечего (пустой ввод). */
  readonly emptyState?: ReactNode;
  readonly className?: string;
}

export function ParsingPreview({
  title,
  tokens,
  label,
  emptyState,
  className,
}: ParsingPreviewProps): ReactElement {
  return (
    <div
      className={['shagi-parsing-preview', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={label}
    >
      <p className="shagi-parsing-preview__title">{title}</p>
      {tokens.length > 0 ? (
        <div className="shagi-parsing-preview__tokens">
          {tokens.map((token) =>
            token.removable === true ? (
              <NLPToken
                key={token.id}
                kind={token.kind}
                removable
                removeLabel={token.removeLabel}
                onRemove={token.onRemove}
              >
                {token.label}
              </NLPToken>
            ) : (
              <NLPToken key={token.id} kind={token.kind}>
                {token.label}
              </NLPToken>
            ),
          )}
        </div>
      ) : (
        emptyState !== undefined && <div className="shagi-parsing-preview__empty">{emptyState}</div>
      )}
    </div>
  );
}
