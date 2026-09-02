/**
 * Smoke-тест оболочки: приложение поднимается, `@shagi/app` монтируется,
 * консоль без ошибок. Экранов проверять нечего (SPEC §3) — только то, что
 * корневой узел (`data-shagi-app-root`, `packages/app/src/App.tsx`) реально
 * появился в DOM и ничего не упало при загрузке.
 */
import { expect, test } from '@playwright/test';

test('оболочка открывается офлайн-собранной страницей и монтирует @shagi/app без ошибок в консоли', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');

  const root = page.locator('[data-shagi-app-root]');
  await expect(root).toBeAttached();

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('манифест PWA доступен и ссылается на существующие иконки', async ({ page, request }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.webmanifest');

  const manifestResponse = await request.get(manifestHref ?? '/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as { icons: Array<{ src: string }> };
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok(), `${icon.src} недоступна`).toBe(true);
  }
});

test('service worker регистрируется', async ({ page }) => {
  await page.goto('/');
  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return (
      navigator.serviceWorker.controller !== null ||
      (await navigator.serviceWorker.getRegistration()) !== undefined
    );
  });
  expect(registered).toBe(true);
});

/**
 * Главное действие продукта под живым указателем: человек целится в
 * КВАДРАТИК чекбокса и ожидает, что задача завершится.
 *
 * Проверяется здесь, а не модульным тестом, потому что жест ловится только
 * настоящим hit-testing: у `TaskCheckbox` (`@shagi/ui`) прозрачный `<input>`
 * и видимый квадрат лежат в одной точке, и до исправления квадрат
 * перехватывал клик на себя — задача не завершалась, вместо этого клик
 * всплывал до обработчика строки и открывал карточку задачи. В jsdom такого
 * не увидеть вовсе (там нет hit-testing), а причина этой поломки отдельно
 * закреплена в `packages/ui/e2e/pointer.spec.ts`.
 *
 * Клик — `page.mouse.click` по координатам центра квадрата, а не по
 * локатору: человек целится в точку на экране, а не в узел DOM, и после
 * исправления верхним узлом там стал сам `<input>`.
 */
test('клик по квадратику чекбокса завершает задачу, а не открывает её карточку', async ({
  page,
}) => {
  await page.goto('/');

  // Онбординг до Today с одной настоящей задачей.
  await page.getByRole('button', { name: 'Начать' }).click();
  await page.locator('input, textarea').first().fill('Купить хлеб');
  await page.getByRole('button', { name: /Добавить задачу/ }).click();
  await page.getByRole('button', { name: 'Понятно' }).click();

  const task = page.getByText('Купить хлеб');
  await expect(task).toBeVisible();

  const box = page.locator('.shagi-task-checkbox__box').first();
  const rect = await box.boundingBox();
  expect(rect, 'видимый квадрат чекбокса не отрисован').not.toBeNull();
  if (rect === null) return;

  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  // Задача ушла из списка Today (завершена), и экран остался Today —
  // карточка задачи НЕ открылась.
  await expect(task).toHaveCount(0);
  await expect(page.locator('.shagi-today')).toBeVisible();
});
