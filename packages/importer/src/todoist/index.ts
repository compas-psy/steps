/**
 * Точка входа импорта Todoist: один CSV (`01§26` «single project CSV») и
 * набор CSV из backup ZIP («backup ZIP containing project CSV files»).
 *
 * Имя проекта берётся из имени файла: в самом CSV Todoist его не пишет —
 * там только секции и задачи. Для backup ZIP это единственный источник
 * названия, и он же используется для одиночного файла.
 */
import type {
  ImportRejection,
  TodoistImportPlan,
  TodoistParseResult,
  TodoistProjectPlan,
} from './model.js';
import { buildTodoistProjectPlan } from './plan.js';

export interface TodoistCsvFile {
  /** Имя файла без пути; расширение снимается для названия проекта. */
  readonly fileName: string;
  readonly text: string;
}

/** `Работа.csv` → `Работа`. Todoist в backup ZIP кладёт файлы вида
 * `Работа.csv`, иногда с идентификатором в имени. */
export function projectTitleFromFileName(fileName: string): string {
  const base = fileName.split('/').pop() ?? fileName;
  return base.replace(/\.csv$/i, '').trim() || base;
}

function totals(projects: readonly TodoistProjectPlan[]): TodoistImportPlan['totals'] {
  const labels = new Set<string>();
  let tasks = 0;
  let sections = 0;
  let attachments = 0;
  for (const project of projects) {
    tasks += project.tasks.length;
    sections += project.sectionNames.length;
    attachments += project.attachments.length;
    for (const task of project.tasks) for (const label of task.labels) labels.add(label);
  }
  return { projects: projects.length, sections, tasks, labels: labels.size, attachments };
}

/**
 * Разбор набора файлов. Файл, который сам по себе не годится (пустой, не
 * тот формат, без задач), не роняет весь импорт: он просто не даёт
 * проекта. Отказ возвращается, только если НИ ОДИН файл не дал ни одной
 * задачи — иначе backup из двадцати проектов срывался бы из-за одного
 * пустого.
 */
export function parseTodoistFiles(files: readonly TodoistCsvFile[]): TodoistParseResult {
  if (files.length === 0) {
    return { status: 'rejected', rejection: { code: 'empty_file', detail: {} } };
  }
  const projects: TodoistProjectPlan[] = [];
  const rejections: ImportRejection[] = [];
  for (const file of files) {
    const built = buildTodoistProjectPlan({
      projectTitle: projectTitleFromFileName(file.fileName),
      csv: file.text,
    });
    if (built.status === 'ok') {
      projects.push(built.plan);
      continue;
    }
    rejections.push({ code: built.code, detail: { file: file.fileName } });
  }
  if (projects.length === 0) {
    return {
      status: 'rejected',
      rejection: rejections[0] ?? { code: 'no_tasks', detail: {} },
    };
  }
  return {
    status: 'ok',
    plan: {
      projects,
      // Отказавшие файлы внутри годного архива — не тишина: они уходят
      // предупреждением уровня плана, чтобы Preview их показал.
      warnings: rejections.map((rejection) => ({
        code: 'unknown_columns' as const,
        taskRef: null,
        detail: { file: String(rejection.detail.file ?? ''), reason: rejection.code },
      })),
      totals: totals(projects),
    },
  };
}

/** Одиночный CSV — частный случай набора из одного файла. */
export function parseTodoistCsv(fileName: string, text: string): TodoistParseResult {
  return parseTodoistFiles([{ fileName, text }]);
}
