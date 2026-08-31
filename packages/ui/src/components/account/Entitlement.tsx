/**
 * `Entitlement` — карточка/баннер о статусе подписки или ограничении
 * бесплатного тарифа (§10 «Account/Data»). Presentational, без знания о
 * конкретных тарифах/ценах — заголовок, описание и текст CTA приходят
 * пропсами (ТЗ §3), компонент не хранит список тарифов и не считает
 * лимиты.
 *
 * Построена на уже принятых `Card`/`Button` (задание: «переиспользуй
 * существующие примитивы»), а не с нуля — та же карточная поверхность и
 * тень, что у любой другой карточки продукта.
 *
 * `tone="accent"` — акцентный вариант (например «доступен апгрейд») против
 * нейтрального `default` («лимит достигнут», информационный) — различие
 * не только про CTA-кнопку (у неё и так свой `variant`), а про саму
 * поверхность карточки, поэтому это отдельный проп, а не выводится из
 * variant кнопки.
 */
import type { ReactElement, ReactNode } from 'react';

import { Card, CardBody } from '../Card.js';
import { Button } from '../Button.js';
import { IconButton } from '../IconButton.js';
import './Entitlement.css';

export type EntitlementTone = 'default' | 'accent';

export interface EntitlementProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Декоративная иконка/иллюстрация. */
  readonly icon?: ReactNode;
  readonly ctaLabel: ReactNode;
  readonly onCta: () => void;
  readonly ctaLoading?: boolean;
  readonly ctaDisabled?: boolean;
  /** Показывает кнопку закрытия, если задан обработчик (тот же контракт,
   * что `Toast.onDismiss`/`Toast.dismissLabel`). */
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
  readonly tone?: EntitlementTone;
  readonly className?: string;
}

export function Entitlement({
  title,
  description,
  icon,
  ctaLabel,
  onCta,
  ctaLoading = false,
  ctaDisabled = false,
  onDismiss,
  dismissLabel,
  tone = 'default',
  className,
}: EntitlementProps): ReactElement {
  return (
    <Card
      className={['shagi-entitlement', `shagi-entitlement--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      <CardBody className="shagi-entitlement__body">
        {icon !== undefined && (
          <span className="shagi-entitlement__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="shagi-entitlement__text">
          <p className="shagi-entitlement__title">{title}</p>
          {description !== undefined && (
            <p className="shagi-entitlement__description">{description}</p>
          )}
        </div>
        <div className="shagi-entitlement__cta">
          <Button
            variant={tone === 'accent' ? 'accent' : 'primary'}
            size="sm"
            loading={ctaLoading}
            disabled={ctaDisabled}
            onClick={onCta}
          >
            {ctaLabel}
          </Button>
        </div>
        {onDismiss && dismissLabel !== undefined && (
          <IconButton
            icon="close"
            label={dismissLabel}
            size="sm"
            variant="ghost"
            className="shagi-entitlement__dismiss"
            onClick={onDismiss}
          />
        )}
      </CardBody>
    </Card>
  );
}
