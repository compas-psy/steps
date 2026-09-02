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
 *   * Юридические документы — в репозитории их нет ни одного (ни текста, ни
 *     адреса), ссылаться не на что.
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
 * --- Строка «Хранение» отвечает по факту, а не по намерению ----------------
 *
 * Статус читается из `host.storageBackend` (`state/storage-backend.ts`), а
 * не написан константой: у оболочек он РАЗНЫЙ, и разница видна человеку.
 * `apps/web`/`apps/desktop` — `indexeddb`, данные переживают перезапуск;
 * `apps/mobile` — `memory`, то есть на Android данных после закрытия
 * приложения не остаётся (см. комментарий в `apps/mobile/src/main.tsx`:
 * персистентности там пока не существует, ждёт Tauri SQL-плагина). Человек,
 * который щупает Android-сборку и не понимает, куда делись задачи, обязан
 * прочитать ответ здесь, а не решить, что продукт их теряет по ошибке.
 *
 * Кнопка возврата — `IconButton icon="close"` и `goTo('settings')`, ровно
 * как `Appearance.tsx`: единственный вход сюда — строка в `Settings.tsx`,
 * заводить память об источнике под одно значение не за чем (см. заголовок
 * `state/store.ts`).
 */
import { useState, type ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { Button, Card, CardBody, DataPrivacyRow, IconButton, Modal } from '@shagi/ui';

import { useAppController, useHost, useStorage } from '../state/context.js';
import './DataPrivacy.css';

export function DataPrivacy(): ReactElement {
  const controller = useAppController();
  const host = useHost();
  const storage = useStorage();
  const isMemory = host.storageBackend.kind === 'memory';

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [erasing, setErasing] = useState(false);

  async function erase(): Promise<void> {
    setErasing(true);
    await storage.eraseAllLocalData();
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
              description={
                isMemory
                  ? t('settings', 'dataPrivacy.storage.memory.description')
                  : t('settings', 'dataPrivacy.storage.local.description')
              }
              action={{
                kind: 'status',
                label: isMemory
                  ? t('settings', 'dataPrivacy.storage.memory.badge')
                  : t('settings', 'dataPrivacy.storage.local.badge'),
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
