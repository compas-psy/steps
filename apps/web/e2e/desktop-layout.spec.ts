/**
 * Десктопная раскладка в НАСТОЯЩЕМ браузере, на собранном приложении.
 *
 * Зачем отдельно от юнит-тестов `packages/app`: те доказывают, ЧТО
 * отрендерено (сайдбар вместо нижней навигации), но ничего не знают о
 * геометрии — happy-dom не считает раскладку, у него все прямоугольники
 * нулевые. А владелец забраковал именно геометрию установленной
 * Windows-сборки: полоса на всю ширину, «километровая» колонка, оверлей на
 * весь экран. Поэтому все числа ниже сняты живым движком: ширина колонки,
 * положение диалога, край контекстного меню, горизонтальная прокрутка
 * страницы.
 *
 * Три ширины — из критериев приёмки владельца (1280×720, 1440×900,
 * 1920×1080). Мобильная ширина здесь тоже проверяется: требование «десктоп
 * стал десктопом» бессмысленно, если Android при этом перестал быть
 * Android'ом.
 */
import { expect, test, type Page } from '@playwright/test';

/** Онбординг до Today с одной настоящей задачей — тот же путь, что в
 * `smoke.spec.ts` (там он и разобран). */
async function openTodayWithTask(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать' }).click();
  await page.locator('input, textarea').first().fill('Купить хлеб');
  await page.getByRole('button', { name: /Добавить задачу/ }).click();
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByText('Купить хлеб')).toBeVisible();
}

/** Ширина документа против ширины окна: если первая больше — у страницы
 * появилась горизонтальная прокрутка, чего быть не должно ни на одной
 * ширине. */
async function pageOverflow(page: Page): Promise<{ documentWidth: number; windowWidth: number }> {
  return page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    windowWidth: window.innerWidth,
  }));
}

const DESKTOP_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

for (const viewport of DESKTOP_VIEWPORTS) {
  const label = `${viewport.width}x${viewport.height}`;

  test(`${label}: сайдбар вместо нижней навигации, колонка не во всю ширину, страница не едет вбок`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openTodayWithTask(page);

    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
    // Центральная кнопка есть только у нижней навигации — если её нет,
    // значит нет и самой полосы (она не «спрятана», её не рендерят).
    await expect(page.getByRole('button', { name: 'Быстрое добавление' })).toHaveCount(0);

    const { documentWidth, windowWidth } = await pageOverflow(page);
    expect(documentWidth, 'горизонтальная прокрутка страницы').toBeLessThanOrEqual(windowWidth);

    // «Не километровая полоса»: колонка контента заметно уже окна.
    const column = await page.locator('.shagi-app-shell__column').first().boundingBox();
    expect(column).not.toBeNull();
    expect(column?.width ?? 0).toBeLessThanOrEqual(viewport.width * 0.75);
  });

  test(`${label}: Quick Add — центрированный диалог, а не шторка снизу, и закрывается Escape`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openTodayWithTask(page);

    await page.keyboard.press('Control+n');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    const rect = box ?? { x: 0, y: 0, width: 0, height: 0 };
    // Шторка снизу прижата к нижнему краю окна и растянута на всю ширину —
    // диалог не делает ни того, ни другого.
    expect(viewport.height - (rect.y + rect.height), 'зазор до нижнего края').toBeGreaterThan(0);
    expect(rect.width).toBeLessThan(viewport.width);
    expect(rect.x, 'диалог по центру').toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test(`${label}: контекстное меню задачи не выходит за правый край окна`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openTodayWithTask(page);

    await page.locator('.shagi-icon-button').last().click();
    const menu = page.locator('.shagi-menu');
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    const rect = box ?? { x: 0, y: 0, width: 0, height: 0 };
    expect(rect.x, 'левый край меню').toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width, 'правый край меню').toBeLessThanOrEqual(viewport.width);
  });
}

test('390x844 (Android): нижняя навигация на месте, сайдбара нет, страница не едет вбок', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTodayWithTask(page);

  await expect(page.getByRole('button', { name: 'Быстрое добавление' })).toBeVisible();
  await expect(page.locator('.shagi-sidebar')).toHaveCount(0);

  const { documentWidth, windowWidth } = await pageOverflow(page);
  expect(documentWidth).toBeLessThanOrEqual(windowWidth);

  // Quick Add на телефоне остаётся шторкой снизу: прижата к нижнему краю и
  // во всю ширину экрана. `expect.poll` — шторка ВЫЕЗЖАЕТ снизу
  // (`BottomSheet.css`, `translateY(100%)`), и первый же замер попадает в
  // середину анимации: без ожидания тест мерил бы кадр, а не результат.
  await page.getByRole('button', { name: 'Быстрое добавление' }).click();
  await expect
    .poll(async () => {
      const box = await page.getByRole('dialog').boundingBox();
      const rect = box ?? { x: 0, y: 0, width: 0, height: 0 };
      return { bottomGap: Math.round(844 - (rect.y + rect.height)), width: Math.round(rect.width) };
    })
    .toEqual({ bottomGap: 0, width: 390 });
});
