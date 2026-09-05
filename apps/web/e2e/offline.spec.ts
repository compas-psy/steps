/**
 * Offline launch — гейт MASTER §1.1 («installable app shell и offline
 * launch») и суть local-first обещания на вебе.
 *
 * Что проверяется: человек зашёл ОДИН раз, создал задачу, потерял сеть,
 * перезагрузил страницу — приложение открывается и задача на месте.
 *
 * Почему один раз, а не два: до этого теста service worker кэшировал
 * `/assets/*` только при повторной загрузке (на первой странице он ещё не
 * управляет запросами — регистрация идёт по `load`). Тест с двумя
 * онлайн-заходами был бы зелёным на сломанном для реального человека
 * поведении, поэтому здесь ровно один онлайн-заход.
 *
 * Проверяется и ДАННЫЕ, а не только оболочка: пустое приложение,
 * открывшееся без сети, — это не local-first, это статическая страница.
 *
 * ВАЖНО ПРО КЭШИ БРАУЗЕРА — почему офлайн проверяется НОВОЙ вкладкой, а не
 * `page.reload()`. Перезагрузка той же страницы обслуживается in-memory
 * кэшем живого рендерера, который не убирает ни `setOffline`, ни
 * `Network.clearBrowserCache` (тот чистит дисковый). Измерено: тест с
 * `reload()` был ЗЕЛЁНЫМ на версии `sw.js`, у которой в кэше вообще не было
 * ни `/assets/*.js`, ни `/assets/*.css` — то есть проверял не то, что
 * заявлял. Реальный человек закрывает вкладку и возвращается: новая
 * вкладка того же контекста берёт тот же origin storage и тот же service
 * worker, но чистый рендерер — и это единственная конфигурация, в которой
 * утверждение «открывается офлайн» действительно проверяется.
 */
import { expect, test } from '@playwright/test';

test('офлайн после первого захода: приложение открывается и локальные задачи на месте', async ({
  page,
  context,
}) => {
  await page.goto('/');

  // Онбординг до Today с одной настоящей задачей — она и есть локальные
  // данные, которые обязаны пережить потерю сети.
  await page.getByRole('button', { name: 'Начать' }).click();
  await page.locator('input, textarea').first().fill('Задача без сети');
  await page.getByRole('button', { name: /Добавить задачу/ }).click();
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByText('Задача без сети')).toBeVisible();

  // Service worker обязан не просто зарегистрироваться, а ЗАКОНЧИТЬ
  // установку: именно на install он кладёт оболочку и её ассеты в кэш.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.installing) {
      await new Promise((resolve) => {
        registration.installing?.addEventListener('statechange', function handler() {
          if (this.state === 'activated' || this.state === 'redundant') resolve(undefined);
        });
      });
    }
  });

  // Человек закрыл вкладку. Данные, регистрация SW и его кэши остаются —
  // они принадлежат origin'у, а не вкладке.
  await page.close();

  const revisit = await context.newPage();
  // Дисковый кэш чистим сессией НОВОЙ вкладки и до перехода: сессия
  // закрытой страницы этого уже не сделает, и тогда `/assets/*` приедут из
  // кэша браузера мимо service worker'а — тест снова перестанет проверять
  // то, ради чего написан.
  const cdp = await context.newCDPSession(revisit);
  await cdp.send('Network.clearBrowserCache');

  await context.setOffline(true);
  try {
    const errors: string[] = [];
    revisit.on('pageerror', (error) => errors.push(error.message));

    await revisit.goto('/');

    await expect(revisit.locator('[data-shagi-app-root]')).toBeAttached();
    await expect(revisit.getByText('Задача без сети')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
