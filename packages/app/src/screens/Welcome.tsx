/**
 * `Welcome` — M02 (`12_SCREEN_STATE_MATRIX.md`): «"Начать" local + "Войти",
 * no mandatory registration». ТЗ §1.3/§11.1: продукт обязан работать
 * полностью без сети и аккаунта, поэтому «Войти» — равноправная, а не
 * единственная дорога дальше.
 *
 * Presentational: оба действия делегированы `AppController`
 * (`continueLocally`/`goTo`), сам экран не хранит состояния.
 */
import type { ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { Button, ServiceMark } from '@shagi/ui';

import { useAppController } from '../state/context.js';

export function Welcome(): ReactElement {
  const controller = useAppController();

  return (
    <div>
      <ServiceMark />
      <h1>{t('onboarding', 'welcome.title')}</h1>
      <p>{t('onboarding', 'welcome.subtitle')}</p>

      <Button type="button" variant="primary" block onClick={() => controller.continueLocally()}>
        {t('onboarding', 'welcome.startLocal')}
      </Button>

      <Button type="button" variant="secondary" block onClick={() => controller.goTo('signIn')}>
        {t('onboarding', 'welcome.signIn')}
      </Button>
    </div>
  );
}
