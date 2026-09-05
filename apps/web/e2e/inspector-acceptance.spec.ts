/**
 * Скриншот-приёмка десктопного Inspector'а (SPEC/04 §8-§9).
 *
 * Владелец продукта потребовал именно эти четыре состояния: Today без
 * панели → Today с открытой задачей в панели → проект со списком и панелью
 * → всё это на 1920×1080. Снимки уезжают в артефакты прогона, чтобы
 * приёмка смотрела на картинку, а не на зелёную галочку: «зелёный CI сам
 * по себе больше не является доказательством готовности UI».
 *
 * Это НЕ замена снимкам с установленной сборки: те снимает
 * `apps/desktop/scripts/windows-install-smoke.mjs` с настоящего `.exe`.
 * Здесь — тот же самый бандл `@shagi/app` в настоящем Chromium, и ценность
 * его в том, что здесь по продукту можно ПРОКЛИКАТЬ сценарий, чего смоук
 * установщика не умеет.
 *
 * Утверждения рядом со снимками — не для красоты: снимок без проверки
 * доказывает только то, что страница отрисовалась. Поэтому каждое
 * состояние дополнительно меряется — ширина панели по вилке спеки,
 * отсутствие горизонтальной прокрутки, наличие списка под панелью.
 */
import { expect, test, type Page } from '@playwright/test';

/** Каталог артефактов приёмки; в CI выкладывается целиком. */
const DIR = 'acceptance-screenshots';

/** Контрольная строка владельца — та же, что в юнит-приёмке и в
 * Android-смоуке. */
const CONTROL_PHRASE = '9 сентября в 11:00 Сходить с мамой в МВД';

/** Вилка ширины панели из SPEC/04 §8: «inspector 360–440». */
const INSPECTOR_MIN = 360;
const INSPECTOR_MAX = 440;

async function onboardToToday(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать' }).click();
  await page.locator('input, textarea').first().fill('Купить хлеб');
  await page.getByRole('button', { name: /Добавить задачу/ }).click();
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByText('Купить хлеб')).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  const size = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  expect(size.doc, `горизонтальная прокрутка страницы: ${where}`).toBeLessThanOrEqual(size.win);
}

test.describe('Inspector — приёмка на 1920×1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Today без панели, затем задача открыта в панели справа', async ({ page }) => {
    await onboardToToday(page);
    await page.screenshot({ path: `${DIR}/desktop-1920-01-today.png` });
    await expect(page.getByRole('complementary', { name: 'Карточка задачи' })).toHaveCount(0);
    await expectNoHorizontalScroll(page, 'Today без панели');

    await page.getByText('Купить хлеб').click();

    const inspector = page.getByRole('complementary', { name: 'Карточка задачи' });
    await expect(inspector).toBeVisible();
    await page.screenshot({ path: `${DIR}/desktop-1920-02-today-inspector.png` });

    // Список обязан остаться: карточка открылась РЯДОМ, а не вместо него —
    // ровно то, чего не было в забракованной сборке.
    await expect(page.getByRole('main').getByText('СЕГОДНЯ')).toBeVisible();

    const box = await inspector.boundingBox();
    expect(box, 'у панели нет геометрии').not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(INSPECTOR_MIN);
    expect(box?.width ?? 0).toBeLessThanOrEqual(INSPECTOR_MAX);

    await expectNoHorizontalScroll(page, 'Today с панелью');
  });

  test('проект со списком задач и открытой задачей в панели', async ({ page }) => {
    await onboardToToday(page);

    await page.getByRole('button', { name: 'Проекты' }).click();
    await page.getByRole('button', { name: 'Создать проект' }).click();
    await page.getByRole('textbox', { name: 'Название' }).fill('Ремонт кухни');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByText('Ремонт кухни').first().click();

    const add = page.getByRole('textbox', { name: /Добавить задачу в/ }).first();
    // Фразы с датами намеренно: снимок заодно показывает, что инлайн-«+»
    // разбирает текст, а не кладёт его в название целиком.
    for (const text of [
      'завтра в 10:00 вызвать замерщика',
      'до пятницы выбрать плитку',
      'через неделю оплатить материалы',
    ]) {
      await add.fill(text);
      await add.press('Enter');
      await expect(page.getByText(text.split(' ').at(-1) ?? '')).toBeVisible();
    }
    await page.screenshot({ path: `${DIR}/desktop-1920-03-project-list.png` });
    await expectNoHorizontalScroll(page, 'проект без панели');

    await page.getByText('вызвать замерщика').first().click();
    await expect(page.getByRole('complementary', { name: 'Карточка задачи' })).toBeVisible();
    await page.screenshot({ path: `${DIR}/desktop-1920-04-project-inspector.png` });

    // Список проекта под панелью остался.
    await expect(page.getByRole('main').getByText('выбрать плитку')).toBeVisible();
    await expectNoHorizontalScroll(page, 'проект с панелью');
  });

  test('Quick Add показывает разобранную контрольную строку до создания', async ({ page }) => {
    await onboardToToday(page);
    await page.keyboard.press('Control+n');
    await page.getByRole('textbox', { name: 'Текст задачи' }).fill(CONTROL_PHRASE);

    const preview = page.getByRole('region', { name: 'Распознано' });
    await expect(preview).toContainText('Сходить с мамой в МВД');
    await expect(preview).toContainText('11:00');
    await page.screenshot({ path: `${DIR}/desktop-1920-05-quick-add.png` });
  });

  test('тёмная тема: сайдбар, список и панель различимы', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('shagi.preferences.theme', 'dark');
    });
    await onboardToToday(page);
    await page.getByText('Купить хлеб').click();
    await expect(page.getByRole('complementary', { name: 'Карточка задачи' })).toBeVisible();
    await page.screenshot({ path: `${DIR}/desktop-1920-06-dark.png` });
    await expectNoHorizontalScroll(page, 'тёмная тема');
  });
});
