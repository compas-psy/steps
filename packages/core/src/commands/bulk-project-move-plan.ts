/**
 * План массового переноса задач в проект — ЧИСТАЯ функция, в которой живёт
 * нормативное правило `01§12` «Parent/Subtask project moves». Отдельно от
 * команды и от экрана по той же причине, что и `bulk-completion-plan.ts`:
 * это место, где ТЗ формулирует поведение дословно, и его нужно проверять
 * без хранилища и без UI.
 *
 *   «R1 invariant: Parent and direct Subtasks share Project and Section.
 *    - moving Parent Project/Section cascades direct Subtasks in one
 *      transaction;
 *    - moving a Subtask alone to another Project requires
 *      `Подзадача станет отдельной задачей`; confirm detaches it;
 *    - moving top-level Task to Inbox clears Project/Section and sets
 *      Parent `capture_state=inbox`; attached Subtasks remain `processed`.»
 *
 * Отсюда четыре обязательства, все четыре здесь:
 *
 * 1. Выбран родитель — его активные прямые подзадачи едут вместе с ним и
 *    НЕ отцепляются: инвариант «общий проект» соблюдается движением, а не
 *    разрывом связи.
 * 2. Выбрана подзадача, а её родитель — нет: это и есть «moving a Subtask
 *    alone». Такая подзадача отцепляется (`parentTaskId: null`), и именно
 *    про них предупреждает единственное агрегированное подтверждение.
 * 3. Подзадача, попавшая в выбор И вместе с родителем — каскад побеждает:
 *    она едет как ребёнок и НЕ отцепляется. Иначе один и тот же выбор
 *    ломал бы иерархию из-за лишней галочки.
 * 4. Перенос во «Входящие» (`projectId === null`) ставит `capture_state`
 *    = `inbox` ТОЛЬКО задачам верхнего уровня; приехавшие каскадом
 *    подзадачи остаются `processed` — это в ТЗ выделено отдельной
 *    оговоркой.
 *
 * Глубина — один уровень (модель задач R1, `02`): у подзадачи не бывает
 * своих подзадач, поэтому рекурсии здесь нет.
 */
import type { Uuid } from '../values.js';

/** Одна задача в плане переноса. */
export interface BulkProjectMoveStep {
  readonly id: Uuid;
  /** Нужно ли разорвать связь с родителем («Подзадача станет отдельной
   * задачей», `01§12`). */
  readonly detachFromParent: boolean;
  /** Ставить ли `capture_state = 'inbox'` — только для верхнего уровня и
   * только при переносе во «Входящие». */
  readonly moveToInboxCapture: boolean;
}

export interface BulkProjectMovePlan {
  /** Все задачи к переносу, каждая ровно один раз. */
  readonly steps: readonly BulkProjectMoveStep[];
  /** Сколько подзадач будет отцеплено от родителей — число для
   * единственного агрегированного подтверждения. */
  readonly detachedChildCount: number;
  /** Сколько подзадач едет каскадом сверх явного выбора. */
  readonly cascadedChildCount: number;
  /** Нужно ли подтверждение: только отцепление необратимо ломает
   * иерархию, каскад её как раз сохраняет. */
  readonly needsConfirmation: boolean;
}

export interface BulkProjectMoveInput {
  /** Явно выбранные задачи. */
  readonly selectedIds: readonly Uuid[];
  /** Активные прямые подзадачи по id родителя. */
  readonly activeChildrenOf: ReadonlyMap<Uuid, readonly Uuid[]>;
  /** Родитель по id подзадачи — для тех выбранных, что сами являются
   * подзадачами. Отсутствие ключа = задача верхнего уровня. */
  readonly parentOf: ReadonlyMap<Uuid, Uuid>;
  /** Целевой проект; `null` — «Входящие». */
  readonly targetProjectId: Uuid | null;
}

export function planBulkProjectMove(input: BulkProjectMoveInput): BulkProjectMovePlan {
  const { selectedIds, activeChildrenOf, parentOf, targetProjectId } = input;
  const selected = new Set(selectedIds);

  // Каскад: дети выбранных родителей. Ребёнок, выбранный ещё и явно, всё
  // равно едет как ребёнок (обязательство 3) — поэтому каскад считается
  // ПЕРВЫМ и его пометка приоритетнее.
  const cascaded = new Set<Uuid>();
  for (const id of selectedIds) {
    for (const child of activeChildrenOf.get(id) ?? []) cascaded.add(child);
  }
  const cascadedBeyondSelection = [...cascaded].filter((id) => !selected.has(id));

  const steps: BulkProjectMoveStep[] = [];
  const seen = new Set<Uuid>();
  let detachedChildCount = 0;

  for (const id of [...selectedIds, ...cascadedBeyondSelection]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const parent = parentOf.get(id);
    const isSubtask = parent !== undefined;
    // «Одинокая» подзадача — та, чей родитель не переезжает вместе с ней.
    const movesWithParent = isSubtask && (selected.has(parent) || cascaded.has(id));
    const detachFromParent = isSubtask && !movesWithParent;
    if (detachFromParent) detachedChildCount += 1;
    steps.push({
      id,
      detachFromParent,
      // Верхний уровень после переноса — либо изначально верхний, либо
      // отцепляемая подзадача: она становится отдельной задачей и по
      // `01§12` попадает во «Входящие» на общих основаниях.
      moveToInboxCapture: targetProjectId === null && (!isSubtask || detachFromParent),
    });
  }

  return {
    steps,
    detachedChildCount,
    cascadedChildCount: cascadedBeyondSelection.length,
    needsConfirmation: detachedChildCount > 0,
  };
}
