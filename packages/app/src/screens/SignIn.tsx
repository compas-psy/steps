/**
 * `SignIn` — M03 (`12_SCREEN_STATE_MATRIX.md`): «email OTP + Yandex;
 * loading/error/rate-limit; continue local». Матрица привязывает этот кадр
 * к эпикам E04/E15 — реального бэкенда аутентификации в R1a нет
 * (`.ultraplan/plan.md`: «аккаунта и сервера в R1a нет вовсе»).
 *
 * Экран визуально полный: переиспользует уже принятый `@shagi/ui`
 * `account/SignIn` целиком, со всеми его состояниями (`loading`,
 * `rateLimited`, `error`/`errorMessage`) — просто ни один реальный триггер
 * этого пакета работ их не запускает по-настоящему, кроме `error`.
 *
 * Решение по попыткам входа (задокументировано, как просило задание):
 * ни email/OTP, ни Yandex здесь не подключены ни к какому бэкенду — вместо
 * того чтобы изображать асинхронный запрос фальшивым `setTimeout`-лоадером
 * (тот же принцип «no fake loader», что и M01 Launch), попытка входа сразу
 * и честно показывает `error` с текстом «функция появится позже»
 * (`signIn.unavailableError`). `rateLimited` остаётся реальным пропом
 * `SignIn`, подключённым к локальному состоянию экрана (не захардкожен
 * в `false` намертво) — просто здесь нет источника, который мог бы его
 * включить: настоящий rate-limit придёт вместе с настоящим бэкендом
 * (E04/E15), тогда экран будет готов его показать без переделки.
 *
 * «Продолжить локально» — единственное реально работающее действие этого
 * экрана: `controller.continueLocally()`, та же семантика, что у «Начать»
 * на M02 Welcome (обе ведут в `firstTask` и включают `localMode`).
 */
import { useState, type ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { SignIn as SignInForm } from '@shagi/ui';

import { useAppController } from '../state/context.js';

export function SignIn(): ReactElement {
  const controller = useAppController();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [rateLimited] = useState(false);

  function showUnavailable(): void {
    setError(true);
  }

  // `errorMessage?: ReactNode` под `exactOptionalPropertyTypes` не принимает
  // `undefined` явным значением пропа — тот же приём, что уже задан
  // `NLPToken` (`packages/ui/src/components/capture/NLPToken.tsx`):
  // условный spread добавляет ключ, только когда сообщение реально есть.
  const errorMessageProp = error
    ? { errorMessage: t('onboarding', 'signIn.unavailableError') }
    : {};

  return (
    <div>
      <SignInForm
        email={email}
        onEmailChange={(value) => {
          setEmail(value);
          setError(false);
        }}
        onContinue={showUnavailable}
        onYandexSignIn={showUnavailable}
        onContinueLocal={() => controller.continueLocally()}
        emailLabel={t('onboarding', 'signIn.emailLabel')}
        emailPlaceholder={t('onboarding', 'signIn.emailPlaceholder')}
        continueLabel={t('onboarding', 'signIn.continueLabel')}
        yandexLabel={t('onboarding', 'signIn.yandexLabel')}
        continueLocalLabel={t('onboarding', 'signIn.continueLocalLabel')}
        title={t('onboarding', 'signIn.title')}
        description={t('onboarding', 'signIn.description')}
        rateLimited={rateLimited}
        error={error}
        {...errorMessageProp}
      />
    </div>
  );
}
