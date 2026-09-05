/**
 * Единственный путь «человеческая фраза → доменная задача».
 *
 * --- Почему этот файл появился --------------------------------------------
 *
 * В продукте было ЧЕТЫРЕ независимые точки создания задачи из введённого
 * текста, и детерминированный разбор (`parseQuickAdd`, `@shagi/nlp`) звала
 * ровно одна из них:
 *
 * | экран                     | вызывал parseQuickAdd |
 * | `QuickAdd.tsx` (оверлей)  | да                    |
 * | `FirstTask.tsx`           | нет                   |
 * | `ProjectDetail.tsx` («+») | нет                   |
 * | `TaskDetail.tsx` (подзадача) | нет                |
 *
 * Маршрут свежей установки — `Launch → welcome → firstTask → ...`, то есть
 * ПЕРВАЯ фраза, которую печатает только что установивший человек, попадала
 * именно в тот экран, где парсера нет: «9 сентября в 11:00 Сходить с мамой
 * в МВД» целиком становилось заголовком, а дата подставлялась сегодняшняя.
 * Сам парсер при этом был исправен и на той же строке возвращал верные
 * заголовок/дату/время — сломана была только связка.
 *
 * Поэтому здесь не «ещё один helper», а перенос сборки команды из
 * `QuickAdd.tsx` в общее место: у каждой точки входа остаётся её
 * собственный контекст (проект, секция, родитель, `captureState`, ранг), но
 * ни у одной больше нет своей версии ответа на вопрос «что из этой строки —
 * название, а что — дата, время, метка или повтор».
 *
 * Инвариант ТЗ (`00§7`): прямая запись в хранилище запрещена, всё идёт
 * через командный слой `@shagi/core` — этот модуль его не обходит, а
 * вызывает.
 */
import { Temporal } from '@js-temporal/polyfill';

import {
  attachLabelToTaskCommand,
  createLabelCommand,
  createRecurringTaskCommand,
  createTaskCommand,
  normalizeLabelName,
  type CaptureState,
  type CreateTaskInput,
  type NewRank,
  type Project,
  type Task,
  type Uuid,
} from '@shagi/core';
import type { StoragePort } from '@shagi/storage';
import {
  parseQuickAdd,
  type AnyAcceptedChip,
  type ChipCategory,
  type InheritedContext,
  type NowContext,
  type ParseQuickAddResult,
  type SourceSpan,
} from '@shagi/nlp';

// --- Разбор ----------------------------------------------------------------

export interface ComposerParseInput {
  readonly text: string;
  readonly now: NowContext;
  readonly inherited?: InheritedContext;
}

/** Тонкая обёртка над `parseQuickAdd` — существует ради одного места, куда
 * смотрят все точки входа, а не ради дополнительной логики. */
export function parseComposerText(input: ComposerParseInput): ParseQuickAddResult {
  return parseQuickAdd({
    text: input.text,
    now: input.now,
    ...(input.inherited !== undefined ? { inherited: input.inherited } : {}),
  });
}

/** `NowContext` из системных часов — один и тот же снимок для разбора и для
 * подстановки даты «сегодня», чтобы они не разъехались на границе суток. */
export function composerNow(): NowContext {
  return {
    date: Temporal.Now.plainDateISO(),
    time: Temporal.Now.plainTimeISO(),
    timeZone: Temporal.Now.timeZoneId(),
  };
}

// --- Чипы ------------------------------------------------------------------

/** Ключ чипа для слоя accept/reject-решений превью. */
export function chipKey(chip: AnyAcceptedChip): string {
  return chip.span !== null
    ? `${chip.category}:${chip.span.start}:${chip.span.end}`
    : `${chip.category}:implied`;
}

/** Найденный чип даты (`date` ИЛИ `weekday` — обе категории несут
 * `DateChipValue`, `01§4`: только одна дата у задачи). */
export function findDateChip(chips: readonly AnyAcceptedChip[]): AnyAcceptedChip | undefined {
  return chips.find((c) => c.category === 'date' || c.category === 'weekday');
}

export function findChip<C extends ChipCategory>(
  chips: readonly AnyAcceptedChip[],
  category: C,
): Extract<AnyAcceptedChip, { category: C }> | undefined {
  return chips.find((c) => c.category === category) as
    Extract<AnyAcceptedChip, { category: C }> | undefined;
}

/**
 * Заголовок после вычистки принятых служебных токенов. Считается по
 * АКТИВНЫМ чипам, а не по `result.title` из `@shagi/nlp`: человек мог снять
 * чип в превью, и снятый токен обязан вернуться в название. Тот же
 * алгоритм, что `internal/assemble.ts buildTitle`.
 */
export function buildDisplayTitle(rawText: string, spans: readonly SourceSpan[]): string {
  const sorted = [...spans].toSorted((a, b) => a.start - b.start);
  let result = '';
  let cursor = 0;
  for (const span of sorted) {
    result += rawText.slice(cursor, span.start);
    cursor = span.end;
  }
  result += rawText.slice(cursor);
  return result.replace(/\s+/g, ' ').trim();
}

/** Заголовок для активных чипов — то, что реально уедет в команду. */
export function displayTitleForChips(
  rawText: string,
  activeChips: readonly AnyAcceptedChip[],
): string {
  const spans = activeChips
    .filter((chip): chip is AnyAcceptedChip & { span: SourceSpan } => chip.span !== null)
    .map((chip) => chip.span);
  return buildDisplayTitle(rawText, spans);
}

// --- Создание --------------------------------------------------------------

export interface ComposerContext {
  readonly captureState: CaptureState;
  readonly rank: NewRank;
  /** Дата, подставляемая, когда чипа даты нет: Today-происхождение заводит
   * задачу НА СЕГОДНЯ (`01§3`, таблица «Origin → Inherited values»). */
  readonly fallbackDate?: Temporal.PlainDate | null;
  /** Проекты для разрешения `#проект` — только поиск существующего, проект
   * из Quick Add не создаётся (`01§4`). Точка входа без списка передаёт `[]`. */
  readonly projects?: readonly Project[];
  readonly projectId?: Uuid;
  readonly sectionId?: Uuid;
  readonly parentTaskId?: Uuid;
}

export interface ComposerDeps {
  readonly storage: StoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly ownerScope: Uuid;
}

export type ComposerSubmitResult =
  { readonly status: 'ok'; readonly task: Task } | { readonly status: 'rejected' };

/**
 * Метки — find-or-create (`01§4`: «#метка создаёт метку, если её нет»), в
 * отличие от проекта, который только ищется.
 */
async function resolveLabelIds(
  chips: readonly AnyAcceptedChip[],
  deps: ComposerDeps,
): Promise<readonly Uuid[]> {
  const labelIds: Uuid[] = [];
  for (const chip of chips) {
    if (chip.category !== 'label') continue;
    const name = chip.value.name;
    const found = await deps.storage.labels.findByNormalizedName(normalizeLabelName(name));
    if (found !== null) {
      labelIds.push(found.id);
      continue;
    }
    const existing = await deps.storage.labels.listAll();
    const last = existing.at(-1);
    const rank: NewRank =
      last === undefined ? { placement: 'empty-list' } : { placement: 'end', lastRank: last.rank };
    const created = await createLabelCommand({ displayName: name, colorToken: null, rank }, deps);
    if (created.status !== 'ok') throw new Error('label creation rejected');
    labelIds.push(created.label.id);
  }
  return labelIds;
}

/**
 * Собирает и выполняет команду создания задачи по активным чипам.
 *
 * Бросает на инфраструктурном сбое (драйвер/IPC) — вызывающий экран сам
 * решает, что показать; `'rejected'` возвращается только на отказ
 * доменного валидатора, это разные вещи и слипаться они не должны.
 */
export async function submitComposerTask(
  rawText: string,
  activeChips: readonly AnyAcceptedChip[],
  context: ComposerContext,
  deps: ComposerDeps,
): Promise<ComposerSubmitResult> {
  const title = displayTitleForChips(rawText, activeChips);

  const dateChip = findDateChip(activeChips);
  const timeChip = findChip(activeChips, 'time');
  const priorityChip = findChip(activeChips, 'priority');
  const durationChip = findChip(activeChips, 'duration');
  const deadlineChip = findChip(activeChips, 'deadline');
  const recurrenceChip = findChip(activeChips, 'recurrence');
  const projectChip = findChip(activeChips, 'project');

  const plannedDate =
    dateChip !== undefined
      ? (dateChip.value as { date: Temporal.PlainDate }).date
      : (context.fallbackDate ?? null);

  const resolvedProject =
    projectChip !== undefined
      ? ((context.projects ?? []).find(
          (p) => normalizeLabelName(p.title) === normalizeLabelName(projectChip.value.name),
        ) ?? null)
      : null;

  const labelIds = await resolveLabelIds(activeChips, deps);

  // Проект из контекста экрана (инлайн-«+» в проекте) сильнее чипа `#проект`:
  // человек уже находится в проекте, чип может быть опечаткой в названии.
  const projectFields =
    context.projectId !== undefined
      ? {
          projectId: context.projectId,
          ...(context.sectionId !== undefined ? { sectionId: context.sectionId } : {}),
        }
      : resolvedProject !== null
        ? { projectId: resolvedProject.id, originalProjectNameSnapshot: resolvedProject.title }
        : {};

  const input: CreateTaskInput = {
    ownerScope: deps.ownerScope,
    title,
    captureState: context.captureState,
    source: 'user',
    sourceChannel: 'text',
    rank: context.rank,
    ...projectFields,
    ...(context.parentTaskId !== undefined ? { parentTaskId: context.parentTaskId } : {}),
    ...(priorityChip !== undefined ? { priority: priorityChip.value.priority } : {}),
    ...(plannedDate !== null ? { plannedDate } : {}),
    ...(timeChip !== undefined ? { plannedTime: timeChip.value.time } : {}),
    ...(durationChip !== undefined ? { durationMin: durationChip.value.minutes } : {}),
    ...(deadlineChip !== undefined
      ? { deadlineDate: deadlineChip.value.date, deadlineTime: deadlineChip.value.time }
      : {}),
  };

  const created =
    recurrenceChip !== undefined
      ? await createRecurringTaskCommand(
          { ...input, anchorType: 'scheduled', rule: recurrenceChip.value },
          deps,
        )
      : await createTaskCommand(input, deps);

  if (created.status !== 'ok') return { status: 'rejected' };

  for (const labelId of labelIds) {
    await attachLabelToTaskCommand(
      { taskId: created.task.id, labelId },
      { storage: deps.storage, taskStorage: deps.storage, now: deps.now, deviceId: deps.deviceId },
    );
  }

  return { status: 'ok', task: created.task };
}
