import { Temporal } from '@js-temporal/polyfill';
import type { Label, Project, Task, TaskLabel } from '@shagi/core';

import {
  makeHlc,
  makeLabel,
  makeProject,
  makeTask,
  makeTaskLabel,
  nextInstant,
} from '../../contract/fixtures.js';

/**
 * Фиксированный датасет для golden-тестов ранжирования (задание пакета
 * работ E02.3, п.4). Сущности — настоящие доменные `Task`/`Project`/`Label`
 * (`@shagi/core`), собранные через `../../contract/fixtures.ts` — те же
 * строители, что использует общий контракт хранилища, так что датасет
 * можно загрузить в ЛЮБОЙ `StoragePort` (`tx.applyMutation`) буквально, не
 * подгоняя формат под конкретный движок. Кто ранжирует поверх него — уже
 * не забота этого файла: движок сам решает, как получить кандидатов из
 * своего хранилища (инвертированный индекс IndexedDB, FTS5-запрос SQLite,
 * линейный проход в тестовом эталоне, см. `test/search/golden/`), а этот
 * файл лишь фиксирует ОДИНАКОВЫЕ входные данные для всех них.
 *
 * Одно и то же название сущности НЕ переиспользуется на разных корнях
 * специально — так каждый golden-запрос (`./cases.ts`) остаётся однозначным
 * и не задевает случайно посторонние сущности датасета.
 */

export const GOLDEN_PROJECT_REPAIR: Project = makeProject({ title: 'Ремонт квартиры' });
export const GOLDEN_PROJECT_VACATION: Project = makeProject({ title: 'Отпуск' });
export const GOLDEN_PROJECT_HEALTH: Project = makeProject({ title: 'Здоровье' });

export const GOLDEN_LABEL_IMPORTANT: Label = makeLabel({
  displayName: 'Важное',
  normalizedName: 'важное',
});
export const GOLDEN_LABEL_URGENT: Label = makeLabel({
  displayName: 'urgent',
  normalizedName: 'urgent',
});

// --- Уровни 1–4: точное/префикс/токен/подстрока на одном корне "молок-" ------
export const GOLDEN_TASK_MILK_EXACT: Task = makeTask({ title: 'Молоко' });
export const GOLDEN_TASK_MILK_PREFIX: Task = makeTask({ title: 'Молоко овсяное' });
export const GOLDEN_TASK_MILK_TOKEN: Task = makeTask({ title: 'Купить молоко' });
/** Синтетический заголовок (не настоящее слово): нужна подстрока "молоко"
 * внутри ОДНОГО токена, не выровненная по его началу (иначе это был бы
 * уровень 3 "token", а не уровень 4 "substring", см. `../match.ts`). */
export const GOLDEN_TASK_MILK_SUBSTRING: Task = makeTask({ title: 'Полмолоко' });

// --- ё/е при сопоставлении, оба направления ------------------------------------
/** Заголовок с `ё`, запрос будет с `е` (`./cases.ts`: "отчет"). */
export const GOLDEN_TASK_REPORT_YO_TITLE: Task = makeTask({ title: 'Отчёт' });
/** Заголовок с `е`, запрос будет с `ё` (`./cases.ts`: "всё"). */
export const GOLDEN_TASK_ALL_DEALS_YE_TITLE: Task = makeTask({ title: 'Все дела' });

// --- Кириллица вперемешку с латиницей -------------------------------------------
export const GOLDEN_TASK_BUY_IPHONE: Task = makeTask({ title: 'Купить iPhone' });

// --- Уровень 5: совпадение по проекту/метке --------------------------------------
export const GOLDEN_TASK_BOOK_TICKETS: Task = makeTask({
  title: 'Забронировать билеты',
  projectId: GOLDEN_PROJECT_VACATION.id,
});
export const GOLDEN_TASK_SEE_DOCTOR: Task = makeTask({ title: 'Сходить к врачу' });
export const GOLDEN_TASK_FIX_BUG: Task = makeTask({ title: 'Fix bug' });

// --- Уровень 6: совпадение только по описанию -------------------------------------
/** `description` не входит в `TaskFixtureOverrides` (`../../contract/fixtures.ts`
 * не заводит его — общему контракту оно не нужно), поэтому проставляется
 * поверх готовой фикстуры, а не через сам строитель. */
export const GOLDEN_TASK_CHECK_MAIL: Task = {
  ...makeTask({ title: 'Проверить почту' }),
  description: 'квартальный отчёт по расходам',
};

// --- Уровень 7: одинаковый заголовок, активная vs завершённая --------------------
export const GOLDEN_TASK_REVISION_ACTIVE: Task = makeTask({ title: 'Ревизия', status: 'active' });
export const GOLDEN_TASK_REVISION_COMPLETED: Task = makeTask({
  title: 'Ревизия',
  status: 'completed',
});

// --- Подстрока не по границе токена, отдельный корень (независимая проверка) -----
export const GOLDEN_TASK_ELECTRONICS: Task = makeTask({ title: 'Электроника' });

// --- Задача из будущего ("future-available") — `01§15`: поиск обязан находить её,
// хотя обычные списки (Today/Plan) её ещё не показывают, пока не наступит
// `availableFrom`. Ранжирование (`../rank.ts`) про `availableFrom` ничего не
// знает — это забота отбора кандидатов конкретным движком; здесь нужно лишь
// присутствие такой задачи в датасете, чтобы будущий тест движка мог
// убедиться, что она не выброшена на этапе отбора кандидатов.
export const GOLDEN_TASK_CLEAN_HOUSE: Task = {
  ...makeTask({ title: 'Уборка дома' }),
  availableFrom: Temporal.PlainDate.from('2099-01-01'),
};

export const GOLDEN_TASKS: readonly Task[] = [
  GOLDEN_TASK_MILK_EXACT,
  GOLDEN_TASK_MILK_PREFIX,
  GOLDEN_TASK_MILK_TOKEN,
  GOLDEN_TASK_MILK_SUBSTRING,
  GOLDEN_TASK_REPORT_YO_TITLE,
  GOLDEN_TASK_ALL_DEALS_YE_TITLE,
  GOLDEN_TASK_BUY_IPHONE,
  GOLDEN_TASK_BOOK_TICKETS,
  GOLDEN_TASK_SEE_DOCTOR,
  GOLDEN_TASK_FIX_BUG,
  GOLDEN_TASK_CHECK_MAIL,
  GOLDEN_TASK_REVISION_ACTIVE,
  GOLDEN_TASK_REVISION_COMPLETED,
  GOLDEN_TASK_ELECTRONICS,
  GOLDEN_TASK_CLEAN_HOUSE,
];

export const GOLDEN_PROJECTS: readonly Project[] = [
  GOLDEN_PROJECT_REPAIR,
  GOLDEN_PROJECT_VACATION,
  GOLDEN_PROJECT_HEALTH,
];

export const GOLDEN_LABELS: readonly Label[] = [GOLDEN_LABEL_IMPORTANT, GOLDEN_LABEL_URGENT];

export const GOLDEN_TASK_LABELS: readonly TaskLabel[] = [
  makeTaskLabel(GOLDEN_TASK_SEE_DOCTOR.id, GOLDEN_LABEL_IMPORTANT.id, makeHlc(nextInstant())),
  makeTaskLabel(GOLDEN_TASK_FIX_BUG.id, GOLDEN_LABEL_URGENT.id, makeHlc(nextInstant())),
];
