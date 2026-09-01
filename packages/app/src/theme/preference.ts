/**
 * Тема оформления (M42 Appearance) — общий модуль между `App.tsx`
 * (boot-применение сохранённого выбора при запуске, ДО того как
 * пользователь вообще откроет `Settings`) и `screens/Appearance.tsx` (сам
 * экран выбора). Вынесено сюда, а не продублировано в обоих местах —
 * НЕ тот жанр дублирования, что намеренно повторённая простая платформенная
 * обвязка в каждом из `apps/{web,desktop,mobile}/src/platform.ts`
 * (`createNetworkStatus` и т.п.): там три РАЗНЫЕ оболочки, у каждой свои
 * платформенные детали за тем же контрактом порта. Здесь один и тот же
 * пакет (`@shagi/app`), два места одного и того же пакета, которым нужна
 * буквально одна и та же логика (ключ `localStorage`, разбор сохранённого
 * значения, применение атрибута) — рассинхронизация копий была бы реальным
 * багом (кто-то читает не тот ключ или применяет иначе), не стилистическим
 * дублированием, которое CLAUDE.md просит сохранить.
 *
 * Три варианта, никакой четвёртой темы (M42: "System/Light/Dark; no
 * Zapiski production theme").
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Префикс `shagi.` — на случай будущих настроек в том же `localStorage`,
 * не сталкивается с чужими ключами (задание координирующей сессии). */
export const THEME_PREFERENCE_KEY = 'shagi.preferences.theme';

/** Защита от постороннего значения под тем же ключом (например, старой
 * версии продукта с другим набором вариантов) — честная деградация к
 * `'system'` вызывающим кодом, а не падение на непредвиденной строке. */
export function isThemePreference(value: string): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Единственное место, которое трогает `data-theme` на `document.documentElement`
 * — CSS-токены (`packages/ui/src/tokens/colors.css`) уже полностью реализуют
 * все три состояния через этот атрибут (см. заголовок файла там за полным
 * разбором System/Light/Dark блоков), здесь только его выставление/снятие.
 * `'system'` СНИМАЕТ атрибут вовсе (не ставит его в какое-то третье
 * значение) — именно отсутствие атрибута включает `prefers-color-scheme` в
 * `colors.css`.
 */
export function applyTheme(preference: ThemePreference): void {
  if (preference === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', preference);
  }
}
