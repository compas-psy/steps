/**
 * Экран юридического документа (`05§14`) — Политика конфиденциальности и
 * Пользовательское соглашение.
 *
 * Один компонент на оба документа, но ДВА маршрута
 * (`legalPrivacyPolicy`/`legalUserAgreement`, см. `state/store.ts`):
 * документы независимы, у каждого своя версия и свой хеш, и адрес каждого
 * должен быть самостоятельным.
 *
 * Текст берётся из `@shagi/legal` — то есть из бандла, а не из сети.
 * Требование прямое: приложение local-first, и показать «нет соединения»
 * вместо политики конфиденциальности недопустимо. Веб-страницы для
 * магазина порождаются тем же генератором из того же исходника
 * (`scripts/build-legal.mjs`), поэтому разойтись они не могут.
 *
 * Версия и SHA-256 показаны человеку намеренно: `05§14` требует
 * неизменяемых версий и хешей, а документ, у которого версия видна только
 * в репозитории, этого требования не выполняет — сверить показанное с
 * опубликованным должно быть возможно, не открывая исходники.
 *
 * Markdown НЕ рендерится в HTML: тело показывается как есть,
 * моноширинным блоком с переносами. Тащить сюда парсер и его поверхность
 * атаки ради двух документов, которые мы же и пишем, — плохой размен;
 * читаемость даёт типографика блока, а не разметка.
 */
import { type ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@shagi/legal';
import { IconButton } from '@shagi/ui';

import { useAppController } from '../state/context.js';
import './LegalDocument.css';

export function LegalDocumentScreen({ id }: { readonly id: LegalDocumentId }): ReactElement {
  const controller = useAppController();
  const document = LEGAL_DOCUMENTS.find((entry) => entry.id === id);

  if (document === undefined) {
    // Недостижимо при собранном пакете: список порождается из реестра, а
    // маршрутов ровно столько же. Молча показывать пустой экран нельзя —
    // это юридический документ, а не украшение.
    throw new Error(`LegalDocumentScreen: документ "${id}" отсутствует в @shagi/legal`);
  }

  return (
    <div className="shagi-legal">
      <div className="shagi-legal__header">
        <IconButton
          icon="close"
          label={t('settings', 'legal.back.label')}
          onClick={() => controller.goTo('dataPrivacy')}
        />
        <h1 className="shagi-legal__title">{document.title}</h1>
      </div>

      <p className="shagi-legal__meta">
        {t('settings', 'legal.meta', {
          version: document.version,
          date: document.effectiveDate,
        })}
      </p>
      <p className="shagi-legal__hash">{t('settings', 'legal.hash', { hash: document.sha256 })}</p>

      <pre className="shagi-legal__body">{document.body}</pre>
    </div>
  );
}

export function PrivacyPolicyScreen(): ReactElement {
  return <LegalDocumentScreen id="privacy-policy" />;
}

export function UserAgreementScreen(): ReactElement {
  return <LegalDocumentScreen id="user-agreement" />;
}
