/**
 * `FirstTask` — M04 (`12_SCREEN_STATE_MATRIX.md`): «creates real processed
 * Today task». `01_PRODUCT_BEHAVIOR_R1.md`: «onboarding First Task →
 * processed + today» — единственный экран каркаса E04, который реально
 * проходит через доменный командный слой (`createTaskCommand`,
 * `@shagi/core`), а не только через навигацию.
 *
 * --- Локальная идентичность (ownerScope/deviceId) ---------------------------
 *
 * `createTaskCommand` требует `ownerScope` (`02§ownerScope`: «local profile
 * or account scope») и `deps.deviceId` (тай-брейк HLC, `hlc.ts`) — ни для
 * того, ни для другого в этом пакете работ ещё нет постоянного хранилища:
 * `packages/platform`/`packages/storage` пока не заводят порт
 * персистентности локального профиля/устройства (сам `identity/uuid-v7.ts`
 * прямо говорит про `device_id`: «создаётся один раз при первой установке и
 * затем хранится персистентно — хранение вне этого пакета»; этого «вне»
 * ещё не построено НИГДЕ в дереве пакетов). Изобретать такое хранилище
 * заранее — не территория этого пакета работ (M01–M05, presentational
 * экраны онбординга) и не то, что попросило задание.
 *
 * Поэтому здесь — намеренно узкий, задокументированный компромисс:
 * `getLocalIdentity()` генерирует `ownerScope`/`deviceId` один раз за время
 * жизни модуля (т.е. одной сессии этого экрана, не персистентно между
 * перезапусками оболочки) через уже существующие `generateUuidV7`/
 * `generateDeviceId` (`@shagi/core`). `ownerScope` и `deviceId` — две
 * отдельные генерации, не одно и то же значение с двумя именами: у
 * `deviceId` роль «это конкретное устройство» переживёт будущий вход в
 * аккаунт с несколькими устройствами на одном профиле, а `ownerScope` —
 * роль «эта задача принадлежит вот этому локальному профилю» — смешивать
 * их было бы случайным совпадением ролей, а не архитектурным решением.
 * Когда появится реальный порт персистентности локального профиля/
 * устройства (естественная территория будущего пакета работ, скорее всего
 * `@shagi/platform`), эта функция — единственное место, которое придётся
 * заменить.
 */
import { useState, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import { createTaskCommand, generateDeviceId, generateUuidV7, type Uuid } from '@shagi/core';
import { QuickAdd } from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';

interface LocalIdentity {
  readonly ownerScope: Uuid;
  readonly deviceId: Uuid;
}

let cachedLocalIdentity: LocalIdentity | null = null;

/** См. заголовок файла — ленивая генерация, закэшированная на время жизни модуля. */
function getLocalIdentity(): LocalIdentity {
  cachedLocalIdentity ??= { ownerScope: generateUuidV7(), deviceId: generateDeviceId() };
  return cachedLocalIdentity;
}

export function FirstTask(): ReactElement {
  const controller = useAppController();
  const storage = useStorage();
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(): Promise<void> {
    const trimmed = title.trim();
    if (trimmed.length === 0 || submitting) return;

    setSubmitting(true);
    setError(false);

    const { ownerScope, deviceId } = getLocalIdentity();
    // `StoragePort` (`@shagi/storage`, что реально отдаёт `useStorage()`) —
    // структурный супертип `CommandStoragePort`, которого просит команда
    // (ADR-0003 в `packages/core/src/commands/storage-port.ts`: методы
    // объявлены method-синтаксисом, поэтому бивариантны и проходят проверку
    // присваиваемости без адаптера) — передаём его напрямую, без каста.
    const result = await createTaskCommand(
      {
        ownerScope,
        title: trimmed,
        // `01§2`/`01§3`: онбординг First Task — сразу `processed` + сегодня,
        // это не голый Inbox-захват без контекста.
        captureState: 'processed',
        plannedDate: Temporal.Now.plainDateISO(),
        source: 'user',
        sourceChannel: 'text',
        // Первая задача первого локального профиля — список Today пуст по
        // определению (`rank-input.ts`: «явный признак "список пуст"»),
        // соседей запрашивать не у кого.
        rank: { placement: 'empty-list' },
      },
      {
        storage,
        now: Temporal.Now.instant(),
        deviceId,
      },
    );

    setSubmitting(false);

    if (result.status === 'rejected') {
      setError(true);
      return;
    }

    controller.goTo('nlpOnboarding');
  }

  return (
    <div>
      <h1>{t('onboarding', 'firstTask.title')}</h1>
      <p>{t('onboarding', 'firstTask.description')}</p>

      <QuickAdd
        value={title}
        onChange={(value) => {
          setTitle(value);
          setError(false);
        }}
        onSubmit={() => void handleSubmit()}
        label={t('onboarding', 'firstTask.inputLabel')}
        submitLabel={t('onboarding', 'firstTask.submitLabel')}
        placeholder={t('onboarding', 'firstTask.placeholder')}
        loading={submitting}
        error={error}
        {...(error ? { errorMessage: t('onboarding', 'firstTask.error') } : {})}
        autoFocus
      />
    </div>
  );
}
