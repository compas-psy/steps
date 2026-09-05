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
    },
  };
}
