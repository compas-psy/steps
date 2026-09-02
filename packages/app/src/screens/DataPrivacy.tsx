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
 *   * `Удалить локальные данные` — у `StoragePort` (`@shagi/storage`) нет
 *     операции полного стирания; она заводится вместе с адаптерами и
 *     контрактными тестами, это отдельный пакет работ, а не строка в
 *     разметке.
 *   * `Удалить аккаунт` — аккаунтов в R1 нет вовсе (сервера нет).
 *
 * Тот же принцип, по которому `Settings.tsx` держит ровно одну строку:
 * никогда не изображать нерабочую функциональность. Каждый следующий пакет
 * работ допишет сюда свою строку сам.
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
import type { ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { Card, CardBody, DataPrivacyRow, IconButton } from '@shagi/ui';

import { useAppController, useHost } from '../state/context.js';
import './DataPrivacy.css';

export function DataPrivacy(): ReactElement {
  const controller = useAppController();
  const host = useHost();
  const isMemory = host.storageBackend.kind === 'memory';

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
      </div>
    </div>
  );
}
