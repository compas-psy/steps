/**
 * `useIsDesktopViewport` — одна точка правды о том, десктопная сейчас
 * раскладка или мобильная.
 *
 * Почему это РАНТАЙМ, а не только `@media` в CSS: критерий приёмки
 * владельца — «нижней навигации на десктопе НЕТ», а не «она скрыта».
 * Спрятанный `display:none` остаётся в DOM: его пункты по-прежнему в
 * порядке табуляции скринридера и в дереве доступности (aria-скрытие
 * пришлось бы поддерживать руками и оно рассыпается при первой же правке),
 * а сам факт «мобильная полоса всё ещё смонтирована» — это ровно то
 * состояние, которое владелец увидел в установленной Windows-сборке. Здесь
 * же на десктопе `BottomNav` не рендерится вовсе, и это проверяемо тестом
 * (`test/shell/AppShell.responsive.test.tsx`).
 *
 * Порог — `BREAKPOINTS.desktopMin` (`@shagi/ui`, SPEC/04 §8 «Responsive»:
 * mobile <600, tablet 600–1023, desktop >=1024), а не собственное число:
 * `tokens/breakpoints.ts` для того и существует («рантайм-код (`matchMedia`
 * …) читает эти числа напрямую», её заголовок), CSS-переменную внутрь
 * `@media` подставить нельзя, поэтому обе стороны обязаны брать её из
 * одного модуля. Планшет (600–1023) сознательно остаётся в мобильной
 * раскладке: у него нет места и на сайдбар 240px, и на вменяемую колонку
 * контента, а нижняя навигация пальцем там уместна ровно так же, как на
 * телефоне.
 *
 * `useSyncExternalStore`, а не `useState`+`useEffect`: первый же кадр
 * обязан быть правильным (иначе десктоп моргает мобильной полосой на
 * старте), а подписка на `change` медиазапроса — это ровно внешний стор с
 * `subscribe`/`getSnapshot`. `getServerSnapshot` возвращает `false`
 * (мобильная раскладка) — там, где окна нет, ширины тоже нет, а мобильная
 * раскладка работает на любой ширине, десктопная на узкой — нет.
 */
import { useSyncExternalStore } from 'react';

import { BREAKPOINTS } from '@shagi/ui';

export const DESKTOP_MEDIA_QUERY = `(min-width: ${BREAKPOINTS.desktopMin}px)`;

/**
 * Подписка сразу на два источника — и это не перестраховка «на всякий
 * случай», а результат замера: happy-dom (среда юнит-тестов этого пакета)
 * шлёт `change` медиазапроса при РАСШИРЕНИИ окна и НЕ шлёт при сужении,
 * хотя `matches` и `window.innerWidth` к тому моменту уже обновлены
 * (проверено отдельным пробником: 1440→390 даёт `matches === false`, но
 * ноль событий `change`; `resize` при этом приходит в обе стороны). Тест
 * «окно сузили — сайдбар исчез» на одном только `change` не проходил бы, а
 * без него нельзя доказать, что раскладка действительно переключается, а не
 * выбирается один раз при монтировании.
 *
 * `resize` в браузере приходит на каждый кадр перетаскивания рамки окна —
 * но `useSyncExternalStore` перерисовывает ТОЛЬКО когда снимок реально
 * изменился (`getSnapshot` возвращает булево), поэтому лишние вызовы
 * ничего не стоят: пока ширина остаётся по одну сторону 1024, дерево не
 * трогается.
 */
function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_MEDIA_QUERY);
  query.addEventListener('change', onStoreChange);
  window.addEventListener('resize', onStoreChange);
  return () => {
    query.removeEventListener('change', onStoreChange);
    window.removeEventListener('resize', onStoreChange);
  };
}

function getSnapshot(): boolean {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsDesktopViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
