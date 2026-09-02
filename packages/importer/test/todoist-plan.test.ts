/**
 * Проверки импорта Todoist на НАСТОЯЩИХ файлах (`test/fixtures/*.csv`), а
 * не на строках, собранных прямо в тесте. Причина простая: половина
 * реальных поломок импорта — это BOM, CRLF, многострочное закавыченное
 * поле и кириллица в имени файла, то есть ровно то, что исчезает, если
 * фикстуру писать литералом рядом с проверкой.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  COMMENTS_BLOCK_TITLE,
  COMMENTS_OVERFLOW_FILE,
  DESCRIPTION_LIMIT,
  parseTodoistCsv,
  parseTodoistFiles,
} from '../src/index.js';
import type { TodoistImportPlan } from '../src/index.js';

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

function planOf(name: string, projectName: string): TodoistImportPlan {
  const result = parseTodoistCsv(projectName, fixture(name));
  if (result.status !== 'ok') {
    throw new Error(`ожидался разбор, получен отказ ${result.rejection.code}`);
  }
  return result.plan;
}

describe('импорт Todoist: годный одиночный CSV', () => {
  const plan = planOf('todoist-single.csv', 'Работа.csv');
  const project = plan.projects[0];
  const byTitle = (
    title: string,
  ):
    | (typeof project extends undefined ? never : NonNullable<typeof project>['tasks'][number])
    | undefined => project?.tasks.find((task) => task.title === title);

  it('имя проекта берётся из имени файла, вид — из meta', () => {
    expect(project?.projectTitle).toBe('Работа');
    expect(project?.defaultView).toBe('list');
  });

  it('секции сохранены в порядке появления', () => {
    expect(project?.sectionNames).toEqual(['Планёрка', 'Разное']);
  });

  it('BOM снят: заголовки распознаны, задачи найдены', () => {
    expect(project?.tasks.length).toBe(5);
  });

  it('метка @работа вынесена из заголовка в метки', () => {
    expect(byTitle('Собрать отчёт')?.labels).toEqual(['работа']);
  });

  it('многострочное описание в кавычках сохранено целиком', () => {
    expect(byTitle('Собрать отчёт')?.description).toContain('Первая строка\nВторая строка');
  });

  it('приоритет Todoist перевёрнут: 4 → P1, 1 → P4', () => {
    expect(byTitle('Собрать отчёт')?.priority).toBe(1);
    expect(byTitle('Полить цветы')?.priority).toBe(4);
  });

  it('дата и время сохранены как есть, без пересчёта пояса (01§26)', () => {
    expect(byTitle('Собрать отчёт')?.plannedDate).toBe('2026-09-10');
    expect(byTitle('Собрать отчёт')?.plannedTime).toBe('14:00');
    expect(project?.warnings.some((w) => w.code === 'timezone_recorded')).toBe(true);
  });

  it('дедлайн и длительность разобраны отдельно от даты плана', () => {
    expect(byTitle('Собрать отчёт')?.deadlineDate).toBe('2026-09-12');
    expect(byTitle('Собрать отчёт')?.durationMin).toBe(45);
  });

  it('AUTHOR/RESPONSIBLE сохранены в описании и отмечены в отчёте', () => {
    expect(byTitle('Собрать отчёт')?.description).toContain('Автор: Илья (12345)');
    expect(project?.warnings.some((w) => w.code === 'people_preserved')).toBe(true);
  });

  it('комментарий приклеен к своей задаче размеченным блоком', () => {
    const description = byTitle('Собрать отчёт')?.description ?? '';
    expect(description).toContain(COMMENTS_BLOCK_TITLE);
    expect(description).toContain('уточнить цифры у бухгалтерии');
  });

  it('INDENT=2 стал подзадачей, INDENT=3 сплющен до подзадачи верхнего предка', () => {
    const parent = byTitle('Собрать отчёт');
    expect(byTitle('Выгрузить данные')?.parentRef).toBe(parent?.ref);
    expect(byTitle('Проверить формулы')?.parentRef).toBe(parent?.ref);
    const flattened = project?.warnings.find((w) => w.code === 'deep_indent_flattened');
    expect(flattened?.detail.originalParent).toBe('Выгрузить данные');
  });

  it('повтор «every day» разобран в правило домена', () => {
    expect(byTitle('Полить цветы')?.recurrence).toEqual({ unit: 'day', interval: 1 });
  });

  it('дата словами с годом разобрана', () => {
    expect(byTitle('Купить бумагу')?.plannedDate).toBe('2026-09-12');
  });

  it('секция сбрасывает иерархию: задача второй секции не стала ничьей подзадачей', () => {
    expect(byTitle('Купить бумагу')?.parentRef).toBeNull();
    expect(byTitle('Купить бумагу')?.sectionName).toBe('Разное');
  });
});

describe('импорт Todoist: терпимость и трансформации', () => {
  it('неизвестные колонки не ломают разбор и попадают в отчёт', () => {
    const plan = planOf('todoist-extra-columns.csv', 'Прочее.csv');
    const warning = plan.projects[0]?.warnings.find((w) => w.code === 'unknown_columns');
    expect(String(warning?.detail.columns)).toContain('NEW_COLUMN');
    expect(plan.projects[0]?.tasks.length).toBe(3);
  });

  it('повторяющаяся подзадача повышена до верхнего уровня (01§26)', () => {
    const project = planOf('todoist-extra-columns.csv', 'Прочее.csv').projects[0];
    const child = project?.tasks.find((task) => task.title === 'Повторяющийся ребёнок');
    expect(child?.parentRef).toBeNull();
    expect(child?.recurrence).toEqual({ unit: 'week', interval: 2 });
    expect(project?.warnings.some((w) => w.code === 'recurring_subtask_promoted')).toBe(true);
  });

  it('INDENT=4 сплющен, и это отдельно сообщено', () => {
    const project = planOf('todoist-extra-columns.csv', 'Прочее.csv').projects[0];
    const deep = project?.tasks.find((task) => task.title === 'Глубокий внук');
    const top = project?.tasks.find((task) => task.title === 'Родитель');
    expect(deep?.parentRef).toBe(top?.ref);
    expect(project?.warnings.some((w) => w.code === 'deep_indent_flattened')).toBe(true);
  });

  it('IS_COLLAPSED отмечен как косметика без эквивалента', () => {
    const project = planOf('todoist-extra-columns.csv', 'Прочее.csv').projects[0];
    expect(project?.warnings.some((w) => w.code === 'collapsed_ignored')).toBe(true);
  });

  it('нераспознанная дата не теряется: предупреждение + исходная строка в описании', () => {
    const project = planOf('todoist-malformed-dates.csv', 'Кривые.csv').projects[0];
    const task = project?.tasks.find((t) => t.title === 'Совсем не дата');
    expect(task?.plannedDate).toBeNull();
    expect(task?.description).toContain('когда-нибудь потом');
    const warning = project?.warnings.find(
      (w) => w.code === 'date_not_recognized' && w.taskRef === task?.ref,
    );
    expect(warning?.detail.value).toBe('когда-нибудь потом');
  });

  it('непредставимый повтор не выдумывается: задача без повтора + предупреждение', () => {
    const project = planOf('todoist-malformed-dates.csv', 'Кривые.csv').projects[0];
    const task = project?.tasks.find((t) => t.title === 'Непредставимый повтор');
    expect(task?.recurrence).toBeNull();
    expect(project?.warnings.some((w) => w.code === 'recurrence_not_representable')).toBe(true);
  });

  it('комментарии, не влезшие в описание, уходят вложением без усечения', () => {
    const project = planOf('todoist-comments-overflow.csv', 'Большая.csv').projects[0];
    const task = project?.tasks[0];
    expect(task?.description.length ?? 0).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(task?.description).not.toContain(COMMENTS_BLOCK_TITLE);
    const attachment = project?.attachments[0];
    expect(attachment?.fileName).toBe(COMMENTS_OVERFLOW_FILE);
    expect(attachment?.text.length ?? 0).toBeGreaterThan(DESCRIPTION_LIMIT);
    expect(project?.warnings.some((w) => w.code === 'comments_overflow_attachment')).toBe(true);
  });

  it('текст-формула сохранён как есть — портить импортируемое нельзя', () => {
    const project = planOf('todoist-formula-injection.csv', 'Формулы.csv').projects[0];
    expect(project?.tasks[0]?.title).toBe("=cmd|' /C calc'!A0");
    expect(project?.tasks[0]?.description).toContain('-5 градусов');
  });
});

describe('импорт Todoist: отказы', () => {
  it('пустой файл отклонён кодом empty_file', () => {
    const result = parseTodoistCsv('пусто.csv', fixture('todoist-empty.csv'));
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.rejection.code).toBe('empty_file');
  });

  it('чужой CSV отклонён кодом not_todoist_csv', () => {
    const result = parseTodoistCsv('чужой.csv', fixture('todoist-not-todoist.csv'));
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.rejection.code).toBe('not_todoist_csv');
  });

  it('испорченный файл (обрыв внутри кавычек) не роняет разбор', () => {
    const result = parseTodoistCsv('битый.csv', fixture('todoist-corrupt.csv'));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.plan.projects[0]?.tasks[0]?.title).toContain('Обрезанная задача');
    }
  });

  it('набор файлов: один негодный не срывает импорт остальных', () => {
    const result = parseTodoistFiles([
      { fileName: 'пусто.csv', text: fixture('todoist-empty.csv') },
      { fileName: 'Работа.csv', text: fixture('todoist-single.csv') },
    ]);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.plan.projects).toHaveLength(1);
      expect(result.plan.warnings.some((w) => w.detail.file === 'пусто.csv')).toBe(true);
    }
  });

  it('набор, где негодны ВСЕ файлы, отклонён целиком', () => {
    const result = parseTodoistFiles([
      { fileName: 'пусто.csv', text: fixture('todoist-empty.csv') },
      { fileName: 'чужой.csv', text: fixture('todoist-not-todoist.csv') },
    ]);
    expect(result.status).toBe('rejected');
  });

  it('итоги плана считаются по всем проектам', () => {
    const result = parseTodoistFiles([
      { fileName: 'Работа.csv', text: fixture('todoist-single.csv') },
      { fileName: 'Прочее.csv', text: fixture('todoist-extra-columns.csv') },
    ]);
    if (result.status !== 'ok') throw new Error('ожидался разбор');
    expect(result.plan.totals.projects).toBe(2);
    expect(result.plan.totals.tasks).toBe(8);
    expect(result.plan.totals.labels).toBe(1);
  });
});
