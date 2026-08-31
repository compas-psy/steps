/**
 * Реестр каталога `ru-RU` — единственное место, где типы `Namespace`/`KeyOf`
 * выводятся из самих JSON-файлов через `typeof`/`keyof`. Ключей нет нигде
 * продублированными вручную: добавить или переименовать ключ значит
 * поправить JSON — типы (и, соответственно, `tsc --noEmit`) обновятся сами,
 * а обращение к старому/несуществующему ключу перестанет компилироваться.
 *
 * Формат — решение владельца по вопросу ?12 (`.ultraplan/open-questions.md`):
 * плоские JSON-каталоги по namespace (один файл = один namespace, ключи
 * внутри — плоские строки, не вложенные объекты) с ICU MessageFormat
 * (движок — `message-format.ts`).
 */
import ruCommon from './catalog/ru-RU/common.json' with { type: 'json' };
import ruInbox from './catalog/ru-RU/inbox.json' with { type: 'json' };
import ruOnboarding from './catalog/ru-RU/onboarding.json' with { type: 'json' };
// Имя файла — `projectDetail.json`, НЕ `project-detail.json`: гейт
// `scripts/check-i18n-catalog.mjs` берёт имя namespace прямо из имени файла
// (`entry.name.slice(0, -'.json'.length)`) и сверяет его буквально со
// строковым литералом `t('projectDetail', …)` в коде — дефис в имени файла
// не совпал бы с этим литералом и гейт бы падал на каждый вызов `t()`.
import ruProjectDetail from './catalog/ru-RU/projectDetail.json' with { type: 'json' };
import ruProjects from './catalog/ru-RU/projects.json' with { type: 'json' };
import ruShell from './catalog/ru-RU/shell.json' with { type: 'json' };
import ruTasks from './catalog/ru-RU/tasks.json' with { type: 'json' };
import ruTime from './catalog/ru-RU/time.json' with { type: 'json' };
import ruToday from './catalog/ru-RU/today.json' with { type: 'json' };

/** R1 обязателен и полон (SPEC/00 §13.1) — единственная база, из которой выводятся типы ключей. */
export const CATALOG_RU_RU = {
  common: ruCommon,
  inbox: ruInbox,
  onboarding: ruOnboarding,
  projectDetail: ruProjectDetail,
  projects: ruProjects,
  shell: ruShell,
  tasks: ruTasks,
  time: ruTime,
  today: ruToday,
} as const;

export const BASE_LOCALE = 'ru-RU' as const;

export type Namespace = keyof typeof CATALOG_RU_RU;
export type KeyOf<N extends Namespace> = keyof (typeof CATALOG_RU_RU)[N];
