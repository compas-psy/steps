/**
 * `DataPrivacy` — M51 «Data & Privacy» (`docs/spec/SPEC/
 * 12_SCREEN_STATE_MATRIX.md`: "storage state/export/consents/legal/delete
 * navigation"), макет — `docs/spec/DESIGN/source_unpacked/ШАГИ - R1
 * Design.dc.html`, `id="sec-settings"`, артборд `[R1][M][51] Data &
 * Privacy`.
 *
 * --- Что этот экран говорит и почему именно это ----------------------------
 *
 * Макет показывает шесть строк: хранение, экспорт, тумблер аналитики, два
 * юридических документа и два удаления. Здесь их две группы и ни одного
 * действия — и это НЕ упрощение макета, а единственный честный вариант для
 * R1:
 *
 *   * `Экспорт данных` — пакеты работ M46–M49 (импорт/экспорт) не сделаны;
 *     строка вела бы в никуда.
 *   * Тумблер `Аналитика и диагностика` — собирать НЕЧЕМ: `@shagi/telemetry`
 *     содержит только типы событий, кода сбора и отправки не существует
 *     (прочитан целиком). Тумблер, который ничего не включает, — не
 *     «задел на будущее», а обещание сбора, которого нет; §7/§8
 *     `05_SECURITY_PRIVACY_LEGAL.md` требуют отдельного opt-in, ВЫКЛЮЧЕННОГО
 *     по умолчанию, — «сбора нет вовсе» этому не противоречит, а является
 *     его предельным случаем, и сказать это прямым текстом честнее, чем
 *     нарисовать выключенный переключатель.
 *   * Юридические документы — ЕСТЬ с шага 4 критического пути
 *     (`docs/legal/`, пакет `@shagi/legal`): две строки ниже открывают их
 *     из бандла, офлайн. До этого шага их не было ни одного, и строки не
 *     существовало — ссылаться было не на что.
 *   * `Удалить аккаунт` — аккаунтов в R1 нет вовсе (сервера нет).
 *
 * Тот же принцип, по которому `Settings.tsx` держит ровно одну строку:
 * никогда не изображать нерабочую функциональность. Каждый следующий пакет
 * работ допишет сюда свою строку сам.
 *
 * --- M52 «Удалить локальные данные» (локальная половина) --------------------
 *
 * Единственное ДЕЙСТВИЕ на экране — и оно настоящее: `storage.eraseAllLocalData()`
 * (`@shagi/storage`, покрыт общим контрактом на всех трёх адаптерах). §13
 * `05_SECURITY_PRIVACY_LEGAL.md` требует двух вещей, обе выполнены буквально:
 *
 *   1. подтверждение — диалог, а не мгновенное срабатывание строки;
 *   2. предупреждение, ПРЯМО говорящее, что восстановления из облака нет
 *      (`dataPrivacy.erase.warning`) — не «действие необратимо» вообще, а
 *      именно «копии в облаке нет».
 *
 * «Удалить аккаунт» рядом НЕ появляется: та же §13 запрещает смешивать
 * локальное удаление с удалением аккаунта, а аккаунтов в R1 нет вовсе —
 * строка была бы и обманом, и нарушением требования разделять эти два
 * действия.
 *
 * После стирания — `controller.goTo('welcome')`: экраны читают хранилище
 * при монтировании, и оставаться на настройках поверх пустого хранилища
 * значило бы показывать состояние, которого больше нет. Человек попадает
 * туда же, куда попал бы на новом устройстве.
 *
 * **Реконсиляция напоминаний ПОСЛЕ стирания (Task B5, путь #6).**
 * `storage.eraseAllLocalData()` чистит ТОЛЬКО SQLite/IndexedDB — платформенный
 * `NotificationSchedulerPort` (Android `TimedNotificationPublisher`) хранит
 * запланированные alarm'ы в ОТДЕЛЬНОЙ памяти, о которой `storage` ничего не
 * знает и которую сама команда стирания не трогает. До этого фикса alarm'ы,
 * реально осевшие на платформе на момент стирания, оставались бы висеть
 * НАВСЕГДА (следующего полного скана могло не быть — `App.tsx` вызывает его
 * ровно один раз при монтировании `<App>`, а этот экран не размонтирует и не
 * перемонтирует его) и сработали бы с содержимым уже стёртых задач — ровно
 * тот класс "stale native alarm", который весь пакет работ Task B5 обязан
 * закрыть, а не задокументировать как принятый риск. Полный скан
 * (`reconcileReminderSchedule`, не точечный путь по одной задаче — стёрт
 * ВЕСЬ workspace, не одна задача) после `eraseAllLocalData()` видит пустое
 * хранилище (`desired` пуст) и поэтому безусловно отменяет каждый снимок,
 * который `scheduler.listScheduled()` ещё помнит.
 *
 * --- Строка «Хранение» отвечает по факту, а не по намерению ----------------
 *
 * Статус читается из `host.storageBackend` (`state/storage-backend.ts`), а
 * не написан константой: у оболочек он РАЗНЫЙ, и разница видна человеку.
 * `apps/web`/`apps/desktop` — `indexeddb`, данные переживают перезапуск;
 * `apps/mobile` — `memory`, то есть на Android данных после закрытия
 * приложения не остаётся. Человек, который щупает сборку и не понимает,
 * куда делись задачи, обязан прочитать ответ здесь, а не решить, что
 * продукт их теряет по ошибке. Backend называется настоящий: на Android
 * это нативная SQLite (ADR-0005), в вебе — IndexedDB, в сборках без
 * персистентности — память.
 *
 * Кнопка возврата — `IconButton icon="close"` и `goTo('settings')`, ровно
 * как `Appearance.tsx`: единственный вход сюда — строка в `Settings.tsx`,
 * заводить память об источнике под одно значение не за чем (см. заголовок
 * `state/store.ts`).
 */
import { useState, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { isAvailable } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { Button, Card, CardBody, DataPrivacyRow, IconButton, Modal } from '@shagi/ui';

import { useAppController, useHost, useStorage } from '../state/context.js';
import { clearOnboardingDone } from '../state/onboarding.js';
import { reconcileReminderSchedule } from '../state/reminder-reconciliation.js';
import './DataPrivacy.css';

/**
 * Backend → пара строк каталога. Ключи выписаны ЦЕЛИКОМ, а не собираются
 * шаблоном: `check-i18n-catalog.mjs` сверяет литерал буквально, и склеенный
 * ключ он не увидит — каталог выглядел бы так, будто эти строки не
 * используются, и гейт перестал бы защищать именно их.
 */
function storageStrings(kind: 'memory' | 'indexeddb' | 'sqlite'): {
  readonly badge: string;
  readonly description: string;
} {
  switch (kind) {
    case 'memory':
      return {
        badge: t('settings', 'dataPrivacy.storage.memory.badge'),
        description: t('settings', 'dataPrivacy.storage.memory.description'),
      };
    case 'sqlite':
      return {
        badge: t('settings', 'dataPrivacy.storage.sqlite.badge'),
        description: t('settings', 'dataPrivacy.storage.sqlite.description'),
      };
    case 'indexeddb':
      return {
        badge: t('settings', 'dataPrivacy.storage.local.badge'),
        description: t('settings', 'dataPrivacy.storage.local.description'),
      };
  }
}

export function DataPrivacy(): ReactElement {
  const controller = useAppController();
  const host = useHost();
  const storage = useStorage();
  // Строка «Хранение» обязана называть НАСТОЯЩИЙ backend: у трёх оболочек
  // он разный (нативная SQLite на Android — ADR-0005, IndexedDB в вебе,
  // память в сборках без персистентности), и человек, который щупает
  // сборку, должен прочитать ответ здесь, а не гадать.
  const storageText = storageStrings(host.storageBackend.kind);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [erasing, setErasing] = useState(false);

  async function erase(): Promise<void> {
    setErasing(true);
    await storage.eraseAllLocalData();
    // Флаг «онбординг пройден» — тоже локальные данные. Без его снятия
    // человек после стирания попал бы при следующем запуске в пустой
    // продукт вместо приветствия, то есть НЕ туда, куда попал бы на новом
    // устройстве (см. `../state/onboarding.ts`).
    clearOnboardingDone(host.platform);
    // Полный скан реконсиляции ПОСЛЕ стирания (см. заголовок файла, блок
    // «Реконсиляция напоминаний ПОСЛЕ стирания», Task B5 путь #6) —
    // `eraseAllLocalData()` не трогает платформенный scheduler вовсе, без
    // этого прохода его alarm'ы пережили бы стёртые задачи. `Unavailable`
    // молча пропускается — тот же приём, что `App.tsx`
    // `useBootstrapReminderReconciliation`.
    const scheduler = host.platform.notificationScheduler;
    if (isAvailable(scheduler)) {
      await reconcileReminderSchedule(
        storage,
        scheduler,
        Temporal.Now.plainDateTimeISO(),
        Temporal.Now.timeZoneId(),
      );
    }
    setConfirmOpen(false);
    setErasing(false);
    controller.goTo('welcome');
  }

  return (
    <div className="shagi-data-privacy">
      <div className="shagi-data-privacy__header">
        <IconButton
          icon="close"
          label={t('settings', 'dataPrivacy.back.label')}
          onClick={() => controller.goTo('settings')}
        />
        <h1 className="shagi-data-privacy__title">{t('settings', 'dataPrivacy.pageTitle')}</h1>
      </div>

      <div className="shagi-data-privacy__groups">
        <Card>
          <CardBody padding="none" className="shagi-data-privacy__rows">
            <DataPrivacyRow
              title={t('settings', 'dataPrivacy.storage.title')}
              description={storageText.description}
              action={{ kind: 'status', label: storageText.badge }}
            />
          </CardBody>
        </Card>

        {/* Перенос данных (M46–M49). В макете на этом экране есть строка
         * «Экспорт данных ›»; импорт своей строки в макете не имеет, но
         * без точки входа он был бы недостижим — матрица экранов
         * перечисляет M46 отдельным экраном, а не частью чего-то. */}
        <Card>
          <CardBody padding="none" className="shagi-data-privacy__rows">
            <DataPrivacyRow
              title={t('settings', 'dataPrivacy.import.title')}
              description={t('settings', 'dataPrivacy.import.description')}
              action={{
                kind: 'button',
                label: t('settings', 'dataPrivacy.import.action'),
                variant: 'secondary',
                onClick: () => controller.goTo('importData'),
              }}
            />
            <DataPrivacyRow
              title={t('settings', 'dataPrivacy.export.title')}
              description={t('settings', 'dataPrivacy.export.description')}
              action={{
                kind: 'button',
                label: t('settings', 'dataPrivacy.export.action'),
                variant: 'secondary',
                onClick: () => controller.goTo('exportData'),
              }}
            />
          </CardBody>
        </Card>

        {/* Юридические документы (`05§14`). Открываются ИЗ БАНДЛА
         * (`@shagi/legal`), а не по ссылке в браузер: приложение
         * local-first, и «нет соединения» вместо политики
         * конфиденциальности — не тот ответ. Веб-версии тех же текстов
         * порождаются из одного исходника генератором
         * `scripts/build-legal.mjs` и лежат в `apps/web/public/legal/`
         * для карточки магазина. */}
        <Card>
          <CardBody padding="none" className="shagi-data-privacy__rows">
            <DataPrivacyRow
              title={t('settings', 'dataPrivacy.legal.privacy')}
              description={t('settings', 'dataPrivacy.legal.description')}
              action={{
                kind: 'button',
                label: t('settings', 'dataPrivacy.legal.title'),
                variant: 'secondary',
                onClick: () => controller.goTo('legalPrivacyPolicy'),
              }}
            />
            <DataPrivacyRow
              title={t('settings', 'dataPrivacy.legal.agreement')}
              description={t('settings', 'dataPrivacy.legal.description')}
              action={{
                kind: 'button',
                label: t('settings', 'dataPrivacy.legal.title'),
                variant: 'secondary',
                onClick: () => controller.goTo('legalUserAgreement'),
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody padding="none" className="shagi-data-privacy__rows">
            <DataPrivacyRow
              title={t('settings', 'dataPrivacy.analytics.title')}
              description={t('settings', 'dataPrivacy.analytics.description')}
              action={{ kind: 'status', label: t('settings', 'dataPrivacy.analytics.badge') }}
            />
            <DataPrivacyRow
              title={t('settings', 'dataPrivacy.crashes.title')}
              description={t('settings', 'dataPrivacy.crashes.description')}
              action={{ kind: 'status', label: t('settings', 'dataPrivacy.crashes.badge') }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody padding="none" className="shagi-data-privacy__rows">
            <DataPrivacyRow
              title={
                <span className="shagi-data-privacy__destructive">
                  {t('settings', 'dataPrivacy.erase.title')}
                </span>
              }
              description={t('settings', 'dataPrivacy.erase.description')}
              action={{
                kind: 'button',
                label: t('settings', 'dataPrivacy.erase.action'),
                variant: 'destructive',
                onClick: () => setConfirmOpen(true),
              }}
            />
          </CardBody>
        </Card>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('settings', 'dataPrivacy.erase.dialogTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={erasing}>
              {t('settings', 'dataPrivacy.erase.cancel')}
            </Button>
            <Button variant="destructive" loading={erasing} onClick={() => void erase()}>
              {t('settings', 'dataPrivacy.erase.confirm')}
            </Button>
          </>
        }
      >
        <p className="shagi-data-privacy__warning">{t('settings', 'dataPrivacy.erase.warning')}</p>
      </Modal>
    </div>
  );
}
