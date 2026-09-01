/**
 * `Appearance` — M42 Appearance (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`:
 * "System/Light/Dark; no Zapiski production theme"), пакет работ
 * «Настройки: экран-хаб и тема оформления». Ровно три варианта — никакой
 * четвёртой темы (спека буквально это исключает).
 *
 * --- Что уже сделано за этот экран (см. задание) ---------------------------
 *
 * CSS-токены (`packages/ui/src/tokens/colors.css`) уже полностью реализуют
 * все три состояния через `<html data-theme>`: без атрибута — системная тема
 * (`prefers-color-scheme`), `data-theme="dark"`/`"light"` — явный выбор. Этот
 * экран НЕ добавляет никакой новой темизации — только (а) ставит/снимает
 * атрибут на `document.documentElement`, (б) запоминает выбор через новый
 * порт `LocalPreferencesPort` (`@shagi/platform`), (в) применяет сохранённое
 * значение при следующем монтировании. Сами примитивы (`ThemePreference`/
 * `THEME_PREFERENCE_KEY`/`applyTheme`/`isThemePreference`) — в `../theme/
 * preference.js`, общем с `App.tsx` (см. его заголовок, блок «Boot-
 * применение темы»): применение здесь при монтировании этого экрана —
 * НЕ единственное место, где тема применяется «при следующем запуске» —
 * это делает `App.tsx` ДО того, как пользователь вообще откроет Settings
 * (без boot-применения тема сбрасывалась бы к дефолту при каждом перезапуске
 * до первого визита на этот экран — реальный баг, найден и исправлен при
 * ручной проверке в браузере этим же пакетом работ). Этот экран применяет
 * тему повторно только чтобы его СОБСТВЕННЫЙ рендер (радиокнопки) не ждал
 * лишнего тика после `App.tsx`, если тот уже отработал.
 *
 * --- Радиокнопки, не Switch/Select ------------------------------------------
 *
 * Тот же приём, что M26 в `TaskDetail.tsx` (коммит `bd0af6a`): `Card`
 * (`padding="sm"`) + `Radio` + `Divider` между строками — взаимоисключающий
 * выбор одного из трёх, `Radio` семантически точнее `Button`/списка. В
 * отличие от M26 (диалог, коммитит и закрывается) `Radio` здесь ПОДКОНТРОЛЬНЫЙ
 * (`checked` от состояния экрана, не «выстрелил и забыл») — экран постоянный,
 * должен визуально показывать текущий выбор при каждом открытии, а не только
 * в момент клика.
 *
 * --- Применение выбора: сразу и переживает перезапуск -----------------------
 *
 * Выбор варианта делает ДВЕ вещи одним и тем же вызовом (`choose`):
 * применяет тему немедленно (`applyTheme`, единственное место файла, которое
 * трогает `data-theme`) И сохраняет через `host.platform.localPreferences`
 * (`isAvailable`-заслон, SPEC §4 — недоступность порта не должна ронять
 * выбор в рамках сессии, только его переживаемость перезапуска). Ключ —
 * `'shagi.preferences.theme'` (префикс `shagi.` задан заданием — на случай
 * будущих настроек в том же `localStorage`, не сталкивается с чужими
 * ключами).
 *
 * При монтировании — `useEffect` читает сохранённое значение и, если оно
 * есть и валидно (`isThemePreference` — защита от постороннего значения под
 * тем же ключом, честная деградация к `'system'`, а не падение), применяет
 * его тем же `applyTheme`. Ничего не сохранено (`null`) или `Unavailable` —
 * остаётся дефолт `'system'`, атрибут не ставится вовсе (то же поведение,
 * что и без этого экрана в принципе).
 *
 * Кнопка «Назад» — `controller.goTo('settings')`, обычный `goTo`, не
 * `closeSettings`: Appearance всегда открывается ТОЛЬКО из `Settings`
 * (единственная строка `Settings.tsx`), заводить отдельное поле возврата
 * под источник с одним-единственным значением было бы состоянием ради
 * состояния (см. заголовок `state/store.ts`, блок про `'appearance'`).
 */
import { useEffect, useState, type ReactElement } from 'react';

import { isAvailable } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { Card, Divider, IconButton, Radio } from '@shagi/ui';

import { useAppController, useHost } from '../state/context.js';
import {
  THEME_PREFERENCE_KEY,
  applyTheme,
  isThemePreference,
  type ThemePreference,
} from '../theme/preference.js';

export function Appearance(): ReactElement {
  const controller = useAppController();
  const host = useHost();
  const localPreferences = host.platform.localPreferences;

  const [preference, setPreference] = useState<ThemePreference>('system');

  // Читает сохранённое значение РОВНО один раз при монтировании и
  // применяет его сразу (см. заголовок файла) — не на каждый рендер.
  useEffect(() => {
    if (!isAvailable(localPreferences)) return;
    const saved = localPreferences.get(THEME_PREFERENCE_KEY);
    if (saved !== null && isThemePreference(saved)) {
      setPreference(saved);
      applyTheme(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- монтирование ровно один раз; `localPreferences` — стабильный порт от `host`, не пересоздаётся между рендерами
  }, []);

  function choose(next: ThemePreference): void {
    setPreference(next);
    applyTheme(next);
    if (isAvailable(localPreferences)) {
      localPreferences.set(THEME_PREFERENCE_KEY, next);
    }
  }

  return (
    <div>
      <div>
        <IconButton
          icon="close"
          label={t('settings', 'appearance.back.label')}
          onClick={() => controller.goTo('settings')}
        />
        <h1>{t('settings', 'appearance.pageTitle')}</h1>
      </div>

      <Card padding="sm">
        <Radio
          name="themePreference"
          value="system"
          checked={preference === 'system'}
          label={t('settings', 'appearance.options.system')}
          onChange={() => choose('system')}
        />
        <Divider />
        <Radio
          name="themePreference"
          value="light"
          checked={preference === 'light'}
          label={t('settings', 'appearance.options.light')}
          onChange={() => choose('light')}
        />
        <Divider />
        <Radio
          name="themePreference"
          value="dark"
          checked={preference === 'dark'}
          label={t('settings', 'appearance.options.dark')}
          onChange={() => choose('dark')}
        />
      </Card>
    </div>
  );
}
