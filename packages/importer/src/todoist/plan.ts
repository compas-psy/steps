/**
 * Построение плана импорта из одного CSV-файла Todoist (`01§26`).
 *
 * Правила иерархии взяты дословно и каждое проверено своим тестом:
 *
 *   «INDENT=1 → top-level; INDENT=2 → Subtask; INDENT>=3 is flattened to a
 *    direct Subtask of the nearest top-level ancestor because R1 UX is
 *    one-level; all Task fields are retained, Import Preview reports the
 *    transformation and original parent path; recurring Todoist Subtask is
 *    promoted to top-level in the same Project/Section and Preview reports
 *    it.»
 *
 * Порядок двух последних правил ЗНАЧИМ и здесь именно такой: сначала
 * сплющивание по отступу, потом повышение повторяющейся подзадачи. Иначе
 * повторяющаяся задача с `INDENT=4` сначала стала бы верхнеуровневой, и
 * запись «сплющено из такого-то пути» в отчёт бы не попала — а ТЗ требует
 * сообщить обе трансформации.
 *
 * Комментарии (`TYPE=note`) `01§26` велит сохранять БЕЗ ПОТЕРЬ: в описание
 * отдельным размеченным блоком, а если описание перерастает предел в
 * 100 000 символов — переливом в текстовое вложение «Комментарии
 * Todoist.txt», и никакого усечения.
 */
import { parseCsvTable, type CsvRow } from '../csv/parse.js';
import { parseTodoistDate } from './date.js';
import type { ImportWarning, PlannedAttachment, PlannedTask, TodoistProjectPlan } from './model.js';

/** Предел описания задачи — `01§26` и модель данных `02`. */
export const DESCRIPTION_LIMIT = 100_000;

export const COMMENTS_BLOCK_TITLE = 'Импортировано из Todoist — комментарии';
export const COMMENTS_OVERFLOW_FILE = 'Комментарии Todoist.txt';

/** Колонки, без которых файл — не экспорт Todoist. */
const REQUIRED_COLUMNS = ['TYPE', 'CONTENT'];

/** Колонки, которые импорт понимает. Всё, чего здесь нет, попадает в
 * предупреждение `unknown_columns` — «tolerant to extra/new columns»
 * означает «не падать», а не «молча выбросить». */
const KNOWN_COLUMNS = new Set([
  'TYPE',
  'CONTENT',
  'DESCRIPTION',
  'PRIORITY',
  'INDENT',
  'AUTHOR',
  'RESPONSIBLE',
  'DATE',
  'DATE_LANG',
  'TIMEZONE',
  'DURATION',
  'DURATION_UNIT',
  'DEADLINE',
  'meta',
  'IS_COLLAPSED',
]);

/**
 * Приоритет Todoist — обратный: в его экспорте `4` это «p1, срочно», а `1`
 * — значение по умолчанию. В ШАГАХ шкала прямая: `1` — критично, `4` —
 * низкая. Отсюда зеркальное `5 - n`, а не тождество: перепутать здесь —
 * значит бесшумно поменять местами самые срочные и самые неспешные задачи
 * человека.
 */
function mapPriority(raw: string): 1 | 2 | 3 | 4 {
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value) || value < 1 || value > 4) return 4;
  return (5 - value) as 1 | 2 | 3 | 4;
}

function mapDuration(raw: string, unit: string): number | null {
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value) || value <= 0) return null;
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'day' || normalized === 'days') return value * 24 * 60;
  if (normalized === 'hour' || normalized === 'hours') return value * 60;
  return value;
}

/** `meta` вида `view_style=board` — `01§26`, «project/section and
 * meta view_style=board». */
function readDefaultView(rows: readonly CsvRow[]): 'list' | 'board' {
  return rows.some((row) => (row.meta ?? '').includes('view_style=board')) ? 'board' : 'list';
}

function splitLabels(content: string): { title: string; labels: readonly string[] } {
  // Todoist пишет метки прямо в тексте задачи как `@метка`. Забираем только
  // те, что стоят отдельными словами, — «e@mail» меткой не считается.
  const labels: string[] = [];
  const title = content
    .replaceAll(/(^|\s)@([^\s@]+)/g, (_match, space: string, label: string) => {
      labels.push(label);
      return space;
    })
    .replaceAll(/\s{2,}/g, ' ')
    .trim();
  return { title: title === '' ? content.trim() : title, labels };
}

interface Metadata {
  readonly author: string;
  readonly responsible: string;
  readonly rawDate: string;
}

/** Блок метаданных, который `01§26` велит дописывать в описание до R1.3
 * («AUTHOR/RESPONSIBLE are preserved in import report and appended to
 * imported metadata in Description»). Нераспознанная дата попадает сюда же
 * — потерять её нельзя. */
function metadataBlock(meta: Metadata, dateUnrecognized: boolean): string {
  const lines: string[] = [];
  if (meta.author.trim() !== '') lines.push(`Автор: ${meta.author.trim()}`);
  if (meta.responsible.trim() !== '') lines.push(`Ответственный: ${meta.responsible.trim()}`);
  if (dateUnrecognized && meta.rawDate.trim() !== '') {
    lines.push(`Дата из Todoist (не распознана): ${meta.rawDate.trim()}`);
  }
  if (lines.length === 0) return '';
  return ['Импортировано из Todoist', ...lines].join('\n');
}

function joinSections(parts: readonly string[]): string {
  return parts.filter((part) => part.trim() !== '').join('\n\n');
}

export interface BuildProjectPlanInput {
  readonly projectTitle: string;
  readonly csv: string;
}

export type BuildProjectPlanResult =
  | { readonly status: 'ok'; readonly plan: TodoistProjectPlan }
  | { readonly status: 'rejected'; readonly code: 'empty_file' | 'not_todoist_csv' | 'no_tasks' };

export function buildTodoistProjectPlan(input: BuildProjectPlanInput): BuildProjectPlanResult {
  const table = parseCsvTable(input.csv);
  if (table.headers.length === 0) return { status: 'rejected', code: 'empty_file' };
  if (!REQUIRED_COLUMNS.every((column) => table.headers.includes(column))) {
    return { status: 'rejected', code: 'not_todoist_csv' };
  }

  const warnings: ImportWarning[] = [];
  const unknownColumns = table.headers.filter(
    (header) => header !== '' && !KNOWN_COLUMNS.has(header),
  );
  if (unknownColumns.length > 0) {
    warnings.push({
      code: 'unknown_columns',
      taskRef: null,
      detail: { columns: unknownColumns.join(', ') },
    });
  }

  const tasks: PlannedTask[] = [];
  const attachments: PlannedAttachment[] = [];
  const sectionNames: string[] = [];
  const timezones = new Set<string>();
  let peoplePreserved = 0;
  let collapsedSeen = false;

  let currentSection: string | null = null;
  /** Последняя задача каждого уровня отступа — по ней ищется родитель. */
  const lastByIndent = new Map<number, number>();
  /** Комментарии, накопленные для последней встреченной задачи. */
  let noteTargetRef: number | null = null;
  const notesByRef = new Map<number, string[]>();
  /** Исходный путь до сплющивания — для отчёта. */
  const titleByRef = new Map<number, string>();

  for (const row of table.rows) {
    const type = (row.TYPE ?? '').trim().toLowerCase();
    if ((row.IS_COLLAPSED ?? '').trim() !== '' && (row.IS_COLLAPSED ?? '').trim() !== '0') {
      collapsedSeen = true;
    }

    if (type === 'section') {
      const name = (row.CONTENT ?? '').trim();
      currentSection = name === '' ? null : name;
      if (currentSection !== null && !sectionNames.includes(currentSection)) {
        sectionNames.push(currentSection);
      }
      // Новая секция обрывает иерархию отступов — задачи разных секций не
      // могут оказаться родителем и ребёнком.
      lastByIndent.clear();
      noteTargetRef = null;
      continue;
    }

    if (type === 'note') {
      if (noteTargetRef !== null) {
        const bucket = notesByRef.get(noteTargetRef) ?? [];
        bucket.push((row.CONTENT ?? '').trim());
        notesByRef.set(noteTargetRef, bucket);
      }
      continue;
    }

    if (type !== 'task') continue;

    const content = (row.CONTENT ?? '').trim();
    if (content === '') continue;

    const rawIndent = Number.parseInt((row.INDENT ?? '1').trim(), 10);
    const indent = Number.isInteger(rawIndent) && rawIndent >= 1 ? rawIndent : 1;
    const ref = tasks.length;

    // --- родитель по правилам 01§26 ---------------------------------------
    let parentRef: number | null = null;
    let flattenedFrom: string | null = null;
    if (indent >= 2) {
      const directParent = lastByIndent.get(indent - 1) ?? null;
      const topLevel = lastByIndent.get(1) ?? null;
      if (indent === 2) {
        parentRef = directParent;
      } else {
        // «flattened to a direct Subtask of the nearest top-level ancestor»
        parentRef = topLevel;
        // «Preview reports the transformation and original parent path» —
        // путь считаем по БЛИЖАЙШЕМУ известному предку, а не строго по
        // уровню `indent - 1`: Todoist пропускает уровни (задача с
        // INDENT=4 под задачей с INDENT=2 — обычное дело), и первая
        // версия в таком файле не сообщала о сплющивании вовсе, хотя оно
        // произошло. Найдено тестом на фикстуре `todoist-extra-columns`.
        const ancestorLevel = [...lastByIndent.keys()]
          .filter((level) => level < indent)
          .toSorted((a, b) => b - a)[0];
        const ancestorRef = ancestorLevel === undefined ? null : lastByIndent.get(ancestorLevel);
        flattenedFrom =
          ancestorRef === undefined || ancestorRef === null
            ? null
            : (titleByRef.get(ancestorRef) ?? null);
      }
    }

    const parsedDate = parseTodoistDate(row.DATE ?? '');
    let recurrence = parsedDate.recurrence;

    // «recurring Todoist Subtask is promoted to top-level in the same
    // Project/Section» — ПОСЛЕ сплющивания, чтобы обе трансформации попали
    // в отчёт (см. заголовок файла).
    // Предупреждение — по факту сплющивания (`indent >= 3`), а не по
    // наличию имени предка: имя может не найтись, а трансформация всё
    // равно произошла и обязана попасть в Preview.
    if (indent >= 3) {
      warnings.push({
        code: 'deep_indent_flattened',
        taskRef: ref,
        detail: { indent, originalParent: flattenedFrom ?? '' },
      });
    }
    if (recurrence !== null && parentRef !== null) {
      warnings.push({
        code: 'recurring_subtask_promoted',
        taskRef: ref,
        detail: { parent: titleByRef.get(parentRef) ?? '' },
      });
      parentRef = null;
    }
    if (parsedDate.recurrenceUnsupported) {
      warnings.push({
        code: 'recurrence_not_representable',
        taskRef: ref,
        detail: { value: (row.DATE ?? '').trim() },
      });
      recurrence = null;
    }
    if (parsedDate.unrecognized) {
      warnings.push({
        code: 'date_not_recognized',
        taskRef: ref,
        detail: { value: (row.DATE ?? '').trim() },
      });
    }

    const timezone = (row.TIMEZONE ?? '').trim();
    if (timezone !== '') timezones.add(timezone);
    const author = row.AUTHOR ?? '';
    const responsible = row.RESPONSIBLE ?? '';
    if (author.trim() !== '' || responsible.trim() !== '') peoplePreserved += 1;

    const { title, labels } = splitLabels(content);
    const deadline = parseTodoistDate(row.DEADLINE ?? '');

    tasks.push({
      ref,
      parentRef,
      title,
      description: joinSections([
        (row.DESCRIPTION ?? '').trim(),
        metadataBlock({ author, responsible, rawDate: row.DATE ?? '' }, parsedDate.unrecognized),
      ]),
      priority: mapPriority(row.PRIORITY ?? ''),
      sectionName: currentSection,
      plannedDate: parsedDate.date,
      plannedTime: parsedDate.time,
      deadlineDate: deadline.date,
      durationMin: mapDuration(row.DURATION ?? '', row.DURATION_UNIT ?? ''),
      labels,
      recurrence,
    });

    titleByRef.set(ref, title);
    noteTargetRef = ref;
    lastByIndent.set(indent, ref);
    // Более глубокие уровни больше не актуальны: следующая задача с таким
    // отступом относится уже к новой ветке.
    for (const level of lastByIndent.keys()) {
      if (level > indent) lastByIndent.delete(level);
    }
  }

  if (tasks.length === 0) return { status: 'rejected', code: 'no_tasks' };

  // --- комментарии: описание, при переполнении — вложение -----------------
  const withNotes = tasks.map((task) => {
    const notes = notesByRef.get(task.ref);
    if (notes === undefined || notes.length === 0) return task;
    const block = [COMMENTS_BLOCK_TITLE, ...notes].join('\n');
    const combined = joinSections([task.description, block]);
    if (combined.length <= DESCRIPTION_LIMIT) return { ...task, description: combined };
    // «No truncation» — перелив целиком уходит во вложение, описание
    // остаётся тем, что было до комментариев.
    attachments.push({
      taskRef: task.ref,
      fileName: COMMENTS_OVERFLOW_FILE,
      text: [COMMENTS_BLOCK_TITLE, ...notes].join('\n'),
    });
    warnings.push({
      code: 'comments_overflow_attachment',
      taskRef: task.ref,
      detail: { fileName: COMMENTS_OVERFLOW_FILE, chars: block.length },
    });
    return task;
  });

  if (timezones.size > 0) {
    warnings.push({
      code: 'timezone_recorded',
      taskRef: null,
      detail: { timezones: [...timezones].join(', ') },
    });
  }
  if (peoplePreserved > 0) {
    warnings.push({ code: 'people_preserved', taskRef: null, detail: { count: peoplePreserved } });
  }
  if (collapsedSeen) {
    warnings.push({ code: 'collapsed_ignored', taskRef: null, detail: {} });
  }

  return {
    status: 'ok',
    plan: {
      projectTitle: input.projectTitle,
      defaultView: readDefaultView(table.rows),
      sectionNames,
      tasks: withNotes,
      attachments,
      warnings,
    },
  };
}
