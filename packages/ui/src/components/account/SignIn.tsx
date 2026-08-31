/**
 * `SignIn` — форма входа (§10 «Account/Data», M03 «Sign in — email OTP +
 * Yandex; loading/error/rate-limit; continue local»). Presentational: не
 * делает сетевых запросов и не знает про auth-протокол, только email +
 * переход к OTP (`onContinue`), вход через Yandex (`onYandexSignIn`) и
 * состояния loading/error/rate-limit приходят пропсами вызывающего кода.
 *
 * «Продолжить локально» — отдельное, ВСЕГДА доступное действие
 * (`onContinueLocal`): по спеке ШАГИ работает полностью офлайн без
 * аккаунта, экран входа никогда не блокирует локальный режим — поэтому
 * эта кнопка единственная в форме, которую не выключают ни `loading`, ни
 * `rateLimited`, ни `disabled` (проверяется тестом
 * «"продолжить локально" никогда не отключается блокировкой формы»).
 *
 * `rateLimited` — отдельный от `error` проп, а не ещё одно значение того
 * же перечня: rate-limit относится конкретно к каналу email/OTP (блокирует
 * `onContinue`), тогда как `error`/`errorMessage` — общее сообщение формы
 * (например «некорректный email»), два состояния могут понадобиться
 * одновременно вызывающему коду (сообщение об ошибке ПРО то, что сейчас
 * действует ограничение по частоте).
 */
import { type FormEvent, type ReactElement, type ReactNode } from 'react';

import { Button } from '../Button.js';
import { Divider } from '../Divider.js';
import { Input } from '../Input.js';
import './SignIn.css';

export interface SignInProps {
  /** Управляемое значение поля email. */
  readonly email: string;
  readonly onEmailChange: (email: string) => void;
  /** Пользователь просит перейти к следующему шагу (обычно — отправке OTP-кода). */
  readonly onContinue: () => void;
  readonly onYandexSignIn: () => void;
  /** См. заголовок файла — работает всегда, вне зависимости от остальных состояний. */
  readonly onContinueLocal: () => void;

  /** Доступное имя поля email (видимого `<label>` нет). */
  readonly emailLabel: string;
  readonly emailPlaceholder?: string;
  readonly continueLabel: ReactNode;
  readonly yandexLabel: ReactNode;
  readonly continueLocalLabel: ReactNode;
  readonly title?: ReactNode;
  readonly description?: ReactNode;

  readonly loading?: boolean;
  /** Форма ограничена по частоте попыток (M03 «rate-limit») — блокирует
   * только вход по email/OTP, см. заголовок файла. */
  readonly rateLimited?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: ReactNode;

  /** Декоративная иконка/логотип перед текстом кнопки Yandex — в реестре
   * иконок пакета нет фирменных знаков сторонних сервисов, поэтому это
   * произвольный слот вызывающего кода, а не `IconName`. */
  readonly yandexIcon?: ReactNode;

  readonly className?: string;
}

export function SignIn({
  email,
  onEmailChange,
  onContinue,
  onYandexSignIn,
  onContinueLocal,
  emailLabel,
  emailPlaceholder,
  continueLabel,
  yandexLabel,
  continueLocalLabel,
  title,
  description,
  loading = false,
  rateLimited = false,
  error = false,
  errorMessage,
  yandexIcon,
  className,
}: SignInProps): ReactElement {
  const formBlocked = loading || rateLimited;
  const canContinue = !formBlocked && email.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (canContinue) {
      onContinue();
    }
  }

  return (
    <div className={['shagi-sign-in', className].filter(Boolean).join(' ')}>
      {title !== undefined && <p className="shagi-sign-in__title">{title}</p>}
      {description !== undefined && <p className="shagi-sign-in__description">{description}</p>}

      <form className="shagi-sign-in__form" onSubmit={handleSubmit}>
        <Input
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-label={emailLabel}
          placeholder={emailPlaceholder}
          error={error}
          errorMessage={errorMessage}
          disabled={loading}
          autoComplete="email"
        />
        <Button type="submit" variant="primary" block loading={loading} disabled={!canContinue}>
          {continueLabel}
        </Button>
      </form>

      <div className="shagi-sign-in__divider">
        <Divider />
      </div>

      <Button
        type="button"
        variant="secondary"
        block
        leadingIcon={yandexIcon}
        disabled={loading}
        onClick={onYandexSignIn}
      >
        {yandexLabel}
      </Button>

      <Button
        type="button"
        variant="ghost"
        block
        className="shagi-sign-in__continue-local"
        onClick={onContinueLocal}
      >
        {continueLocalLabel}
      </Button>
    </div>
  );
}
