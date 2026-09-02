/**
 * Указатель реально попадает в интерактивный элемент — проверка, которую
 * НЕЛЬЗЯ сделать в jsdom (`vitest`): jsdom не делает hit-testing вовсе,
 * `userEvent.click(элемент)` там диспатчит событие прямо на переданный узел,
 * не спрашивая, кто в этой точке экрана лежит сверху. Поэтому компонент, у
 * которого декоративный слой перекрывает настоящий `<input>`, проходит все
 * модульные тесты и падает только под живым курсором или пальцем.
 *
 * Реальная поломка, из-за которой этот файл заведён: `TaskCheckbox`
 * (`src/components/task/TaskCheckbox.tsx`) рисует прозрачный `<input>` и
 * видимый квадрат ОБА как `position:absolute; inset:0`, но квадрат идёт в
 * DOM позже — значит рисуется поверх и перехватывал указатель. В отличие от
 * `Checkbox`/`Radio`/`Switch` (корень — `<label>`, клик по любому потомку
 * переключает поле нативно) у `TaskCheckbox` корень `<span>` (заголовок
 * задачи рендерится снаружи, см. его заголовок), нативной связи нет — клик
 * по видимому квадрату не переключал задачу ВООБЩЕ: на экранах продукта он
 * всплывал до обработчика строки и открывал карточку задачи. Отметить
 * задачу выполненной было нельзя ни мышью, ни пальцем.
 *
 * Здесь проверяется ПРИЧИНА (кто лежит в точке, куда целится человек).
 * Сквозное следствие — «клик по квадрату действительно завершает задачу» —
 * проверяется на реальном приложении в `apps/web/e2e/smoke.spec.ts`: там
 * короткая страница продукта, а не длинный каталог-харнесс, у которого
 * внутренний прокручиваемый `.dev-frame` смещает элемент между `mousedown`
 * и `mouseup` и ломает сам жест, независимо от того, чинен компонент.
 */
import { expect, test } from '@playwright/test';

test('в точке видимого квадрата TaskCheckbox лежит поле, а не декоративный слой', async ({
  page,
}) => {
  await page.goto('/');

  const example = page.getByTestId('example-task-checkbox-states');
  await expect(example).toBeVisible();
  // `elementFromPoint` работает только по видимой области окна: без
  // прокрутки координаты секции каталога-харнесса лежат ниже вьюпорта, и
  // проверка вернула бы `null` независимо от того, чинен компонент или нет.
  await example.scrollIntoViewIfNeeded();

  const tagAtCenter = await example.evaluate((root) => {
    const box = root.querySelector('.shagi-task-checkbox__box');
    if (box === null) return 'квадрат не найден';
    const rect = box.getBoundingClientRect();
    const found = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return found === null ? 'ничего' : found.tagName.toLowerCase();
  });

  expect(tagAtCenter).toBe('input');
});
