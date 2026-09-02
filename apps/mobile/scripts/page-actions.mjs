/**
 * Выражения, исполняемые ВНУТРИ страницы приложения.
 *
 * Отдельный модуль, а не куски внутри дымового теста, по одной причине:
 * их нужно проверять там, где есть браузер. Эмулятор Android поднимается
 * только в CI и стоит минуты; веб-сборка запускается локально за секунды.
 * Один и тот же файл используют оба — значит «на вебе кликается, а на
 * устройстве мимо» невозможно из-за расхождения самих выражений
 * (`apps/mobile/scripts/verify-page-actions.mjs`).
 */

/** Видимый текст продукта. Пустая строка = белый экран. */
export const READ_APP_TEXT = `
  (() => {
    const root = document.querySelector('[data-shagi-app-root]');
    return root === null ? '' : (root.innerText || '').trim();
  })()
`;

/**
 * Заголовки строк СПИСКА задач (`TaskRow` из `@shagi/ui`, класс
 * `.shagi-task-row`) — не весь видимый текст страницы.
 *
 * Отличие от `READ_APP_TEXT` не косметическое: Quick Add показывает живой
 * предпросмотр распознанного заголовка (`ParsingPreview`) на каждое
 * нажатие клавиши, задолго до отправки формы и тем более до того, как
 * запись реально легла в SQLite. `READ_APP_TEXT` видит этот предпросмотр
 * и решил бы, что задача уже создана, хотя форма ещё даже не отправлена —
 * ровно так дымовой тест однажды прошёл `waitFor` за секунды и потерял
 * запись под `force-stop`: результат совпал с ожиданием случайно, а не
 * потому, что дождался persisted-состояния (найдено разбором лога
 * провалившегося прогона). `.shagi-task-row` рендерится только строками
 * СПИСКА (Today/План/Проект), которых внутри открытого Quick Add нет.
 */
export const READ_TASK_ROW_TITLES = `
  (() => Array.from(document.querySelectorAll('.shagi-task-row'))
    .map((node) => (node.innerText || '').trim())
    .join('\\n'))()
`;

/**
 * Отчёт оболочки о собранном хранилище (`apps/mobile/src/main.tsx` кладёт
 * его в `globalThis.__shagiStorage` сразу после `prepareStorage`).
 */
export const READ_BACKEND = `
  (() => JSON.stringify(globalThis.__shagiStorage ?? null))()
`;

/**
 * Нажимает элемент по видимому тексту.
 *
 * `exact` — не украшение. Подстрочный поиск «Добавить» в карточке задачи
 * попадает в «Добавить дату» (быстрое действие вверху экрана), а не в
 * кнопку формы подзадачи: она ниже по DOM, а `find` возвращает первое
 * совпадение. Поймано локальной проверкой выражений, а не прогоном на
 * эмуляторе.
 */
export function clickByText(text, { exact = false } = {}) {
  return `
    (() => {
      const wanted = ${JSON.stringify(text)};
      const exact = ${JSON.stringify(exact)};
      const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
      const target = nodes.find((node) => {
        const label = (node.innerText || '').trim();
        return exact ? label === wanted : label.includes(wanted);
      });
      if (!target) return false;
      target.click();
      return true;
    })()
  `;
}

/** Нажимает элемент по доступному имени (`aria-label`) — для кнопок-иконок. */
export function clickByLabel(label, { exact = false } = {}) {
  return `
    (() => {
      const wanted = ${JSON.stringify(label)};
      const exact = ${JSON.stringify(exact)};
      const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
      const target = nodes.find((node) => {
        const name = node.getAttribute('aria-label') || '';
        return exact ? name === wanted : name.includes(wanted);
      });
      if (!target) return false;
      target.click();
      return true;
    })()
  `;
}

/**
 * Открывает строку задачи по её заголовку.
 *
 * Строка списка — не кнопка (`TaskRow` из `@shagi/ui`), поэтому поиск по
 * кнопкам её не находит. Кликается именно КОНТЕЙНЕР строки
 * (`.shagi-task-row`): обработчик открытия висит на нём, а клик по
 * вложенному элементу экран отбрасывает как «клик по интерактивной части
 * строки» (чекбокс/меню). Первая версия искала любой элемент с нужным
 * текстом — возвращала `true`, а карточка не открывалась; поймано
 * локальной проверкой.
 */
export function openTaskRow(title) {
  return `
    (() => {
      const wanted = ${JSON.stringify(title)};
      const rows = Array.from(document.querySelectorAll('.shagi-task-row'));
      const row = rows.find((node) => (node.innerText || '').includes(wanted));
      if (!row) return false;
      row.click();
      return true;
    })()
  `;
}

/** Пишет в поле ввода так, как это делает человек: нативный сеттер плюс
 * событие `input`. Прямое `value = …` React не заметит. */
function typeInto(selectorExpression, text) {
  return `
    (() => {
      const input = ${selectorExpression};
      if (!input) return false;
      const prototype = input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `;
}

export function typeIntoFirstInput(text) {
  return typeInto(
    `document.querySelector('input[type="text"], input:not([type]), textarea')`,
    text,
  );
}

export function typeIntoLabeled(label, text) {
  return typeInto(
    `Array.from(document.querySelectorAll('input, textarea')).find((node) =>
       (node.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`,
    text,
  );
}

/**
 * Слепок состояния хранилища ПРЯМО В СТРАНИЦЕ: origin, список баз
 * IndexedDB с версиями, число задач в каждой и флаг пройденного онбординга.
 *
 * После ADR-0005 у него вторая роль: доказывать, что базы прежней сборки
 * на устройстве НЕТ — одноразовый перенос обязан её удалить, иначе стёртые
 * данные воскресали бы при следующем запуске.
 */
export const READ_STORAGE_STATE = `
  (async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    const countTasks = (name) => new Promise((resolve) => {
      const request = indexedDB.open(name);
      request.onerror = () => resolve('ошибка открытия');
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tasks')) { db.close(); resolve('нет store tasks'); return; }
        const tx = db.transaction('tasks', 'readonly');
        const counted = tx.objectStore('tasks').count();
        counted.onsuccess = () => { const n = counted.result; db.close(); resolve(n); };
        counted.onerror = () => { db.close(); resolve('ошибка count'); };
      };
    });
    const tasks = {};
    for (const db of dbs) tasks[db.name + '@v' + db.version] = await countTasks(db.name);
    return JSON.stringify({
      origin: location.origin,
      базы: dbs.map((db) => db.name + '@v' + db.version),
      задач: tasks,
      онбордингПройден: localStorage.getItem('shagi.preferences.onboardingDone'),
    });
  })()
`;
