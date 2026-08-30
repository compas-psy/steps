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
