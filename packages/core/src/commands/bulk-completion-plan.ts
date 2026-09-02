/**
 * План массового завершения — ЧИСТАЯ функция, в которой живёт нормативное
 * правило `01§20` «Bulk completion hierarchy». Отдельно от команды и от
 * экрана потому, что это ровно то место, где ТЗ формулирует поведение
 * дословно, и его нужно уметь проверить без хранилища и без UI:
 *
 *   «a Subtask that is both explicitly selected and already included
 *    through its selected Parent is counted/applied once»
 *
 * Из этой формулировки следуют три обязательства, все три здесь:
 *
 * 1. Ребёнок, выбранный явно И попавший через выбранного родителя,
 *    встречается в плане РОВНО ОДИН РАЗ.
 * 2. `additionalChildCount` — сколько подзадач добавляет каскад СВЕРХ
 *    явного выбора. Именно это число показывает единственное
 *    агрегированное подтверждение («confirmation reports additional child
 *    count»), и именно поэтому в него не входят дети, выбранные вручную:
 *    человек про них уже знает, он сам их отметил.
 * 3. Порядок: дети РАНЬШЕ родителей. `01§8` запрещает состояние
 *    «завершённый родитель с активным ребёнком»; выполняя план по порядку,
 *    в него невозможно попасть даже на промежуточном шаге.
 *
 * Глубина каскада — один уровень: `01§8` говорит про «active direct
 * Subtasks», а модель задач R1 (`02`) даёт ровно один уровень вложенности
 * (подзадача не может иметь своих подзадач). Рекурсии здесь нет не по
 * упрощению, а потому что второго уровня не существует.
 */
import type { Uuid } from '../values.js';

export interface BulkCompletionPlan {
  /** Все задачи к завершению, каждая ровно один раз, дети раньше
   * родителей. */
  readonly orderedIds: readonly Uuid[];
  /** Сколько подзадач добавил каскад сверх явно выбранных — число для
   * единственного агрегированного подтверждения (`01§20`). */
  readonly additionalChildCount: number;
  /**
   * Нужно ли единственное агрегированное подтверждение. Условие взято из
   * `01§20` ДОСЛОВНО — «If selection contains Parent tasks with active
   * direct Subtasks: show one aggregate confirmation» — то есть триггер
   * это САМО НАЛИЧИЕ иерархии в выборе, а не то, добавляет ли каскад
   * кого-то сверх выбранного.
   *
   * Различие не теоретическое, и первая версия здесь была неправильной:
   * она показывала подтверждение только при `additionalChildCount > 0`.
   * Тогда выбор «родитель + его единственная подзадача» (человек отметил
   * обе руками) завершался МОЛЧА, хотя это ровно тот случай, ради которого
   * §20 и написан: завершается иерархия, каскадом, атомарно, и правило
   * «counted/applied once» применяется именно здесь. `additionalChildCount`
   * в этом случае равен нулю — подтверждение это и сообщает отдельной
   * формулировкой, а не показывает «завершатся 0 подзадач».
   */
  readonly needsConfirmation: boolean;
}

/**
 * @param selectedIds  явно выбранные задачи, в порядке выбора/показа
 * @param activeChildrenOf  активные прямые подзадачи по id родителя;
 *   отсутствие ключа и пустой список равнозначны
 */
export function planBulkCompletion(
  selectedIds: readonly Uuid[],
  activeChildrenOf: ReadonlyMap<Uuid, readonly Uuid[]>,
): BulkCompletionPlan {
  const selected = new Set(selectedIds);

  // Каскад: дети выбранных родителей, КРОМЕ выбранных явно — те уже в
  // плане, и считать их вторично значит нарушить «counted/applied once».
  const cascaded: Uuid[] = [];
  const inCascade = new Set<Uuid>();
  for (const id of selectedIds) {
    for (const child of activeChildrenOf.get(id) ?? []) {
      if (selected.has(child) || inCascade.has(child)) continue;
      inCascade.add(child);
      cascaded.push(child);
    }
  }

  // Полный набор без повторов: порядок выбора сохраняется, дубликаты в
  // самом выборе схлопываются.
  const all: Uuid[] = [];
  const seen = new Set<Uuid>();
  for (const id of [...selectedIds, ...cascaded]) {
    if (seen.has(id)) continue;
    seen.add(id);
    all.push(id);
  }

  const parentOf = new Map<Uuid, Uuid>();
  for (const [parent, kids] of activeChildrenOf) {
    for (const kid of kids) parentOf.set(kid, parent);
  }
  // Ребёнок ИМЕННО В ЭТОМ ПЛАНЕ — тот, чей родитель тоже завершается сейчас.
  // Вложенность в R1 одноуровневая (см. заголовок файла), поэтому
  // достаточно одного разделения, а не топологической сортировки.
  const isChildInPlan = (id: Uuid): boolean => {
    const parent = parentOf.get(id);
    return parent !== undefined && seen.has(parent);
  };

  return {
    orderedIds: [...all.filter(isChildInPlan), ...all.filter((id) => !isChildInPlan(id))],
    additionalChildCount: cascaded.length,
    // Триггер — наличие в выборе родителя с активными прямыми подзадачами
    // (`01§20` дословно), независимо от того, выбраны ли эти дети явно.
    needsConfirmation: selectedIds.some((id) => (activeChildrenOf.get(id) ?? []).length > 0),
  };
}
