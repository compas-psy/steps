/**
 * `Settings` — M41 Settings Root (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`),
 * пакет работ «Настройки: экран-хаб и тема оформления». Хаб-список,
 * карточка со строками (§10 «Account/Data») — тот же паттерн, что
 * Planning/Organization в `TaskDetail.tsx` (коммит `868abb3`, прочитан
 * целиком как образец: `Card`/`CardBody padding="none"`/`DataPrivacyRow`,
 * без ручного `Divider` между строками, когда строка ровно одна).
 *
 * ЧЕСТНО: список несёт РОВНО ОДНУ строку — «Оформление» → `'appearance'`
 * (M42). Notifications/Account/Import-Export/Data & Privacy — из мокапа
 * M51 «Data & Privacy» (`docs/spec/DESIGN/source_unpacked/ШАГИ - R1 Design.dc.html`,
 * `id="sec-settings"`) и других разделов ТЗ, но ни один из этих экранов ещё
 * не реализован ни одним пакетом работ. Дописывать сюда строки, ведущие в
 * никуда («скоро», заглушка, недостижимый переход) — прямое нарушение
 * принципа «честный UI, никогда не изображай нерабочую функциональность»
 * (`.ultraplan/plan.md`, повторяется по всей истории пакетов работ). Каждый
 * следующий экран настроек допишет свою строку сюда сам, в своём пакете
 * работ — не заранее.
 *
 * `action.kind: 'navigate'` — вся строка становится доступной кнопкой
 * (`DataPrivacyRow`, `@shagi/ui`), `label` совпадает с видимым заголовком
 * строки (тот же приём, что `packages/ui/test/components/account/
 * DataPrivacyRow.test.tsx`: доступное имя = видимый текст).
 *
 * Кнопка «Назад» — `IconButton icon="close"` (тот же выбор иконки, что уже
 * закреплён за не-`AppShell` карточными экранами: `Inbox.tsx`/`Completed.tsx`,
 * не `icon="back"` — консистентность уже устоявшегося стиля файлов, а не
 * новый выбор здесь) → `controller.closeSettings()` (`state/store.ts`) —
 * возвращает туда, откуда открыли Settings (`settingsReturnScreen`), а не
 * жёстко на `'todayEmpty'`: единственный источник сегодня — значок-
 * шестерёнка в `Today.tsx`, но метод остаётся честным для будущих входов.
 */
import type { ReactElement } from 'react';

import { t } from '@shagi/i18n';
import { Card, CardBody, DataPrivacyRow, IconButton } from '@shagi/ui';

import { useAppController } from '../state/context.js';

export function Settings(): ReactElement {
  const controller = useAppController();

  return (
    <div>
      <div>
        <IconButton
          icon="close"
          label={t('settings', 'root.back.label')}
          onClick={controller.closeSettings}
        />
        <h1>{t('settings', 'root.pageTitle')}</h1>
      </div>

      <Card>
        <CardBody padding="none">
          <DataPrivacyRow
            title={t('settings', 'root.appearance.title')}
            action={{
              kind: 'navigate',
              label: t('settings', 'root.appearance.title'),
              onClick: () => controller.goTo('appearance'),
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
