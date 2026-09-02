/**
 * «Онбординг уже пройден» — признак, по которому `screens/Launch.tsx`
 * решает, куда вести человека при запуске: в продукт или в приветствие.
 *
 * --- Зачем это вообще появилось ---------------------------------------------
 *
 * До этого модуля `Launch` безусловно уходил на `'welcome'`, и продукт
 * ВСЕГДА открывался онбордингом — сколько бы задач ни лежало в хранилище.
 * Поймано дымовым тестом на живом Android (`apps/mobile/scripts/
 * android-smoke.mjs`): создали задачу → `am force-stop` → запуск → снова
 * «Что мне делать дальше?». Разобрано до причины, а не по симптому:
 * та же связка на вебе показала, что база `shagi@v1` после перезагрузки на
 * месте и задача в ней есть (`tasks: 1`) — то есть ХРАНИЛИЩЕ РАБОТАЛО, а
 * терялась ровно навигация запуска. `localStorage` при этом был пуст:
 * признака пройденного онбординга не существовало вовсе.
 *
 * --- Два сигнала, а не один --------------------------------------------------
 *
 * 1. Явный флаг под этим ключом — ставится в конце потока онбординга
 *    (`screens/NlpOnboarding.tsx`, кнопка «Понятно»: последний шаг потока
 *    M02→M04→M05→Today). Это основной сигнал: он верен и тогда, когда
 *    человек прошёл онбординг и не завёл ни одной задачи.
 * 2. Запасной — «в хранилище есть хоть одна задача» (`Launch.tsx`). Он
 *    нужен для установок, сделанных ДО появления флага, и хоть как-то
 *    помогает там, где `localPreferences` недоступен (`Unavailable`,
 *    SPEC §4 — порт вправе отсутствовать). Без него человек с задачами
 *    получал бы онбординг поверх собственных данных.
 *
 *    ЧЕСТНО О ГРАНИЦЕ: платформу без `localPreferences` этот сигнал
 *    спасает НЕ полностью. Кто прошёл онбординг и не завёл ни одной
 *    задачи, на такой платформе увидит онбординг снова: хранить признак
 *    негде, а по пустому хранилищу «прошёл» от «впервые запустил» не
 *    отличить. Сегодня это никого не задевает — у всех трёх оболочек
 *    (`apps/{web,desktop,mobile}/src/platform.ts`) порт реализован через
 *    `localStorage` и доступен. Оболочке, где он действительно окажется
 *    недоступен, понадобится СВОЙ способ пережить перезапуск (файл
 *    настроек, нативное key-value) — тогда и заводить, а не изображать
 *    решение заранее.
 *
 * Обратная операция — `clearOnboardingDone` — обязательна для M52 «Удалить
 * локальные данные» (`screens/DataPrivacy.tsx`): после стирания человек
 * должен попасть туда же, куда попал бы на новом устройстве, а не в пустой
 * продукт с флагом «всё уже видел».
 *
 * Форма модуля — та же, что у `../theme/preference.ts` (ключ + тонкие
 * обёртки над портом): один и тот же пакет, одна и та же задача «настройка,
 * переживающая перезапуск», и рассинхронизация копий была бы багом.
 */
import { isAvailable, type PlatformCapabilitiesRegistry } from '@shagi/platform';

/** Префикс `shagi.` — тот же, что у темы: не сталкивается с чужими ключами
 * в общем `localStorage` оболочки. */
export const ONBOARDING_DONE_KEY = 'shagi.preferences.onboardingDone';

const DONE_VALUE = '1';

/** `false`, если порт недоступен: «не знаем» — это не «пройден». Решение о
 * запасном сигнале принимает вызывающий код (`Launch.tsx`). */
export function isOnboardingDone(platform: PlatformCapabilitiesRegistry): boolean {
  const preferences = platform.localPreferences;
  if (!isAvailable(preferences)) return false;
  return preferences.get(ONBOARDING_DONE_KEY) === DONE_VALUE;
}

/** Недоступный порт — не ошибка: выбор просто не переживёт перезапуск, а
 * запасной сигнал (наличие задач) всё равно отработает. */
export function markOnboardingDone(platform: PlatformCapabilitiesRegistry): void {
  const preferences = platform.localPreferences;
  if (!isAvailable(preferences)) return;
  preferences.set(ONBOARDING_DONE_KEY, DONE_VALUE);
}

export function clearOnboardingDone(platform: PlatformCapabilitiesRegistry): void {
  const preferences = platform.localPreferences;
  if (!isAvailable(preferences)) return;
  preferences.remove(ONBOARDING_DONE_KEY);
}
