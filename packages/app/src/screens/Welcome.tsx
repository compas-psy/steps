/**
 * `Welcome` — M02 (`12_SCREEN_STATE_MATRIX.md`): «"Начать" local + "Войти",
 * no mandatory registration». ТЗ §1.3/§11.1: продукт обязан работать
 * полностью без сети и аккаунта, поэтому «Войти» — равноправная, а не
 * единственная дорога дальше.
 *
 * Композиция — по хендоффу дизайна, не «компоненты друг под другом»: тёмная
 * hero-секция (знак сервиса + ворднейм + тег «часть экосистемы СИМПАС»)
 * сверху, светлая панель действий снизу. Разбор вёрстки, токенов и почему
 * именно `--sidebar*` — заголовок `Welcome.css`.
 *
 * `variant="ghost"` у «Войти» (не `secondary`) — так в макете: единственное
 * первичное действие на экране — «Начать», «Войти» визуально вторично тому
 * же способом, каким `ghost` вторичен `primary` во всём остальном продукте.
 *
 * Presentational: оба действия делегированы `AppController`
 * (`continueLocally`/`goTo`), сам экран не хранит состояния.
 */
import type { ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { Button, ServiceMark } from '@shagi/ui';

import { useAppController } from '../state/context.js';
import './Welcome.css';

export function Welcome(): ReactElement {
  const controller = useAppController();

  return (
    <div className="shagi-welcome">
      <div className="shagi-welcome__hero">
        <ServiceMark size={88} shape="rounded" />
        <div className="shagi-welcome__wordmark">
          <h1 className="shagi-welcome__wordmark-title">{t('onboarding', 'welcome.title')}</h1>
          <p className="shagi-welcome__tagline">{t('onboarding', 'welcome.tagline')}</p>
        </div>
      </div>

      <div className="shagi-welcome__panel">
        <div className="shagi-welcome__pitch">
          <h2 className="shagi-welcome__heading">{t('onboarding', 'welcome.heading')}</h2>
          <p className="shagi-welcome__description">{t('onboarding', 'welcome.subtitle')}</p>
        </div>

        <Button
          type="button"
          variant="primary"
          size="lg"
          block
          onClick={() => controller.continueLocally()}
        >
          {t('onboarding', 'welcome.startLocal')}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="lg"
          block
          onClick={() => controller.goTo('signIn')}
        >
          {t('onboarding', 'welcome.signIn')}
        </Button>

        <p className="shagi-welcome__footnote">{t('onboarding', 'welcome.footnote')}</p>
      </div>
    </div>
  );
}
