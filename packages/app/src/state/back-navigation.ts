/**
 * Аппаратная кнопка «Назад» Android и браузерная «Назад» — одна ловушка в
 * истории.
 *
 * --- Что было сломано -------------------------------------------------------
 *
 * Навигация ШАГОВ — состояние `AppController` (`store.ts`), а не история
 * браузера: `goTo`/`openTask`/`openSettings` меняют поле, ничего не
 * записывая в `history`. Внутри Android WebView это значит, что у истории
 * ровно одна запись, `canGoBack()` всегда `false`, и системная кнопка
 * «Назад» уходит прямо в активность — то есть ЗАКРЫВАЕТ приложение с
 * любого экрана. Человек открывал задачу, жал «Назад» и оказывался не в
 * списке, а на домашнем экране телефона.
 *
 * --- Как это чинится --------------------------------------------------------
 *
 * Пока из приложения есть куда возвращаться (`controller.canGoBack()`), в
 * историю кладётся одна служебная запись — «ловушка». Системная «Назад»
 * тратится на неё, WebView отдаёт `popstate`, и приложение возвращается на
 * шаг назад САМО, не закрываясь. Если после этого возвращаться всё ещё
 * есть куда, ловушка ставится заново.
 *
 * На корневом экране ловушки нет намеренно: там «Назад» обязана уйти
 * системе и свернуть приложение. Приложение, из которого нельзя выйти
 * кнопкой «Назад», — это не аккуратность, а ловушка в буквальном смысле.
 *
 * Ровно тот же механизм даёт браузерную «Назад» в вебе — это не побочный
 * эффект, а причина делать через `history`, а не через Kotlin: одна
 * реализация на все три оболочки, и её можно проверить тестом без
 * эмулятора (`test/state/back-navigation.test.ts`), а поведение НА
 * устройстве отдельно подтверждается смоуком (`adb shell input keyevent
 * KEYCODE_BACK`) — то, что нельзя проверить здесь, проверяется там, а не
 * объявляется работающим.
 */
import type { AppController } from './store.js';

/** Метка служебной записи истории — чтобы не спутать её с чужой. */
const BACK_TRAP = 'shagi:back-trap';

/**
 * Имя глобальной функции, которую зовёт оболочка Android по системной
 * кнопке «Назад». Договор с `MainActivity.kt` (патчится в
 * `.github/workflows/build-android.yml`): вернули `true` — продукт сам
 * обработал возврат, оболочке делать нечего; вернули `false` — возвращаться
 * некуда, и кнопка обязана уйти системе.
 *
 * ── Почему не только ловушка истории ─────────────────────────────────────
 *
 * Ловушка (ниже) — механизм для БРАУЗЕРА, и там он работает: измерено в
 * настоящем Chromium. На Android он опирается на мост wry «системная кнопка
 * → `WebView.goBack()`», и вот этот мост оказался ненадёжным. Измерено на
 * эмуляторе, прогон `33976789058`:
 *
 *     История WebView до нажатия: {"length":2,"state":{"shagi:back-trap":true}}
 *     ##[error]аппаратная «Назад» ... закрыла приложение
 *
 * То есть запись в истории СТОЯЛА (значит `WebView.canGoBack()` обязан был
 * вернуть `true`), `override val handleBackNavigation: Boolean = true` в
 * собранном `MainActivity.kt` тоже стоял — а `popstate` до страницы всё
 * равно не дошёл. Три прогона ушли на то, чтобы это доказать, и вывод из
 * них один: посредника между кнопкой и продуктом быть не должно. Оболочка
 * спрашивает продукт напрямую и делает то, что он ответил.
 */
const HARDWARE_BACK_HOOK = '__shagiOnHardwareBack';

export interface BackNavigationHandle {
  /** Снимает слушатели. Ловушка в истории остаётся — вычищать её значило бы
   * инициировать ещё одну навигацию при размонтировании. */
  readonly dispose: () => void;
}

/**
 * `history`/`window` могут отсутствовать (SSR, тестовая среда без DOM) —
 * тогда функция честно ничего не делает и говорит об этом типом, а не
 * падает на первом же обращении.
 */
export function installBackNavigation(controller: AppController): BackNavigationHandle {
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') {
    return { dispose: () => undefined };
  }

  let trapArmed = false;

  /** Ответ продукта оболочке Android: обработали ли мы возврат сами. */
  function handleHardwareBack(): boolean {
    if (!controller.canGoBack()) return false;
    controller.goBack();
    return true;
  }

  const globals = window as unknown as Record<string, unknown>;
  globals[HARDWARE_BACK_HOOK] = handleHardwareBack;

  function armIfNeeded(): void {
    if (trapArmed || !controller.canGoBack()) return;
    window.history.pushState({ [BACK_TRAP]: true }, '');
    trapArmed = true;
  }

  function handlePopState(): void {
    // Запись истории уже израсходована системой — независимо от того,
    // сумеем ли мы вернуться назад по состоянию приложения.
    trapArmed = false;
    controller.goBack();
    armIfNeeded();
  }

  const unsubscribe = controller.subscribe(armIfNeeded);
  window.addEventListener('popstate', handlePopState);
  armIfNeeded();

  return {
    dispose: () => {
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
      if (globals[HARDWARE_BACK_HOOK] === handleHardwareBack) {
        delete globals[HARDWARE_BACK_HOOK];
      }
    },
  };
}
