/**
 * `SignIn` — M03 (`12_SCREEN_STATE_MATRIX.md`).
 *
 * --- Почему здесь больше нет формы входа ------------------------------------
 *
 * Раньше экран показывал полную форму: поле почты, кнопку «Получить код» и
 * «Войти через Яндекс». Ни одна из них не была подключена ни к какому
 * бэкенду — его не существует, — и человек узнавал об этом только ПОСЛЕ
 * того, как вводил почту и нажимал кнопку: тогда появлялась ошибка «функция
 * появится позже».
 *
 * Формально это не был фальшивый вход (запроса не изображалось), но по
 * ощущению — тупик, выданный за рабочую авторизацию: продукт предлагал
 * действие, заведомо зная, что оно не сработает. Владелец продукта
 * потребовал прямо: «не делать фальшивый login; SignIn не должен быть
 * dead-end, выдаваемым за рабочую авторизацию».
 *
 * Поэтому экран говорит правду сразу и целиком: аккаунта и синхронизации в
 * этой версии нет, данные лежат локально, перенести их можно экспортом.
 * Настоящий контур аккаунта — следующий эпик; когда он появится, форма
 * вернётся сюда вместе с бэкендом, который её обслуживает, а не раньше.
 *
 * Компонент `@shagi/ui` `SignIn` со всеми состояниями (`loading`,
 * `rateLimited`, `error`) остаётся в дизайн-системе нетронутым — он
 * понадобится в том эпике целиком.
 */
import type { ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { Button } from '@shagi/ui';

import { useAppController } from '../state/context.js';
import './SignIn.css';

export function SignIn(): ReactElement {
  const controller = useAppController();

  return (
    <div className="shagi-sign-in">
      <h1 className="shagi-sign-in__heading">{t('onboarding', 'signIn.title')}</h1>
      <p className="shagi-sign-in__description">{t('onboarding', 'signIn.description')}</p>
      <p className="shagi-sign-in__note">{t('onboarding', 'signIn.whatWorks')}</p>

      <div className="shagi-sign-in__footer">
        <Button
          type="button"
          variant="primary"
          size="lg"
          block
          onClick={() => controller.continueLocally()}
        >
          {t('onboarding', 'signIn.backLabel')}
        </Button>
      </div>
    </div>
  );
}
