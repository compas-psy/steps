import type { SearchResultRef } from '../types.js';
import {
  GOLDEN_LABEL_IMPORTANT,
  GOLDEN_LABEL_URGENT,
  GOLDEN_PROJECT_HEALTH,
  GOLDEN_PROJECT_REPAIR,
  GOLDEN_PROJECT_VACATION,
  GOLDEN_TASK_ALL_DEALS_YE_TITLE,
  GOLDEN_TASK_BOOK_TICKETS,
  GOLDEN_TASK_BUY_IPHONE,
  GOLDEN_TASK_CHECK_MAIL,
  GOLDEN_TASK_CLEAN_HOUSE,
  GOLDEN_TASK_ELECTRONICS,
  GOLDEN_TASK_FIX_BUG,
  GOLDEN_TASK_MILK_EXACT,
  GOLDEN_TASK_MILK_PREFIX,
  GOLDEN_TASK_MILK_SUBSTRING,
  GOLDEN_TASK_MILK_TOKEN,
  GOLDEN_TASK_REPORT_YO_TITLE,
  GOLDEN_TASK_REVISION_ACTIVE,
  GOLDEN_TASK_REVISION_COMPLETED,
  GOLDEN_TASK_SEE_DOCTOR,
} from './dataset.js';

export interface GoldenSearchCase {
  /** Короткое имя случая для заголовка `it(...)` — какое именно правило
   * `01§15` он проверяет, не пересказ запроса. */
  readonly name: string;
  readonly query: string;
  readonly expected: readonly SearchResultRef[];
}

function task(id: SearchResultRef['id']): SearchResultRef {
  return { kind: 'task', id };
}
function project(id: SearchResultRef['id']): SearchResultRef {
  return { kind: 'project', id };
}
function label(id: SearchResultRef['id']): SearchResultRef {
  return { kind: 'label', id };
}

/**
 * 18 пар «запрос → ожидаемый порядок» (задание пакета работ E02.3, п.4:
 * "не меньше 15–20 запросов") на едином датасете `./dataset.ts`. Раннер,
 * прогоняющий этот список против произвольной реализации поиска — в
 * `./run-golden.ts`.
 */
export const GOLDEN_SEARCH_CASES: readonly GoldenSearchCase[] = [
  {
    name: 'уровни 1–4 на одном корне "молок-": точное < префикс < токен < подстрока',
    query: 'молоко',
    expected: [
      task(GOLDEN_TASK_MILK_EXACT.id),
      task(GOLDEN_TASK_MILK_PREFIX.id),
      task(GOLDEN_TASK_MILK_TOKEN.id),
      task(GOLDEN_TASK_MILK_SUBSTRING.id),
    ],
  },
  {
    name: 'регистр не влияет на уровень (ВЕРХНИЙ РЕГИСТР даёт тот же порядок)',
    query: 'МОЛОКО',
    expected: [
      task(GOLDEN_TASK_MILK_EXACT.id),
      task(GOLDEN_TASK_MILK_PREFIX.id),
      task(GOLDEN_TASK_MILK_TOKEN.id),
      task(GOLDEN_TASK_MILK_SUBSTRING.id),
    ],
  },
  {
    name: 'ё=е: запрос без ё находит заголовок с ё, и по пути ловит совпадение по описанию',
    query: 'отчет',
    expected: [task(GOLDEN_TASK_REPORT_YO_TITLE.id), task(GOLDEN_TASK_CHECK_MAIL.id)],
  },
  {
    name: 'ё=е: тот же результат, если ё стоит в запросе, а не в заголовке',
    query: 'отчёт',
    expected: [task(GOLDEN_TASK_REPORT_YO_TITLE.id), task(GOLDEN_TASK_CHECK_MAIL.id)],
  },
  {
    name: 'ё=е: заголовок написан через "е", запрос — через "ё"',
    query: 'всё',
    expected: [task(GOLDEN_TASK_ALL_DEALS_YE_TITLE.id)],
  },
  {
    name: 'кириллица вперемешку с латиницей в заголовке: токен-совпадение по латинскому слову',
    query: 'iphone',
    expected: [task(GOLDEN_TASK_BUY_IPHONE.id)],
  },
  {
    name: 'то же самое, регистр латиницы не влияет',
    query: 'IPHONE',
    expected: [task(GOLDEN_TASK_BUY_IPHONE.id)],
  },
  {
    name: 'уровень 5: проект находится сам по себе (1) выше задачи, найденной через его название (5)',
    query: 'отпуск',
    expected: [project(GOLDEN_PROJECT_VACATION.id), task(GOLDEN_TASK_BOOK_TICKETS.id)],
  },
  {
    name: 'уровень 6: совпадение только по описанию задачи',
    query: 'квартальный',
    expected: [task(GOLDEN_TASK_CHECK_MAIL.id)],
  },
  {
    name: 'уровень 7: одинаковый заголовок — активная задача раньше завершённой',
    query: 'ревизия',
    expected: [task(GOLDEN_TASK_REVISION_ACTIVE.id), task(GOLDEN_TASK_REVISION_COMPLETED.id)],
  },
  {
    name: 'уровень 5 через метку: метка находится сама по себе (2) выше задачи с этой меткой (5)',
    query: 'важн',
    expected: [label(GOLDEN_LABEL_IMPORTANT.id), task(GOLDEN_TASK_SEE_DOCTOR.id)],
  },
  {
    name: 'то же самое для латинской метки',
    query: 'urgent',
    expected: [label(GOLDEN_LABEL_URGENT.id), task(GOLDEN_TASK_FIX_BUG.id)],
  },
  {
    name: 'запрос без единого совпадения — пустой результат, а не хвост с низким уровнем',
    query: 'квантум',
    expected: [],
  },
  {
    name: 'пробелы по краям запроса не влияют на результат',
    query: '  молоко  ',
    expected: [
      task(GOLDEN_TASK_MILK_EXACT.id),
      task(GOLDEN_TASK_MILK_PREFIX.id),
      task(GOLDEN_TASK_MILK_TOKEN.id),
      task(GOLDEN_TASK_MILK_SUBSTRING.id),
    ],
  },
  {
    name: 'Project находится по собственному заголовку теми же уровнями 1–4, что и Task',
    query: 'ремонт',
    expected: [project(GOLDEN_PROJECT_REPAIR.id)],
  },
  {
    name: 'future-available: ещё не наступившая задача (availableFrom в будущем) всё равно находится',
    query: 'уборка',
    expected: [task(GOLDEN_TASK_CLEAN_HOUSE.id)],
  },
  {
    name: 'уровень 4: подстрока в середине токена на отдельном корне (не "молок-")',
    query: 'троник',
    expected: [task(GOLDEN_TASK_ELECTRONICS.id)],
  },
  {
    name: 'Project находится по собственному заголовку — второй независимый пример (уровень 2)',
    query: 'здоров',
    expected: [project(GOLDEN_PROJECT_HEALTH.id)],
  },
];
