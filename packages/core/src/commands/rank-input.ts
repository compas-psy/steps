import { initialRank, rankAfter, rankBefore, rankBetween } from '../order/index.js';
import type { Rank } from '../values.js';

/**
 * Вход команды для позиции нового/перемещаемого `rank` (`02§5`, `?2`).
 *
 * Решение пакета работ E01.4: команда **не обходит список сама** (не
 * запрашивает соседей из хранилища) — список, в который вставляется задача,
 * неоднозначен (Inbox, конкретный Project/Section, subtasks родителя,
 * search-результат) и завязан на конкретный порядок выборки, который знает
 * только вызывающий код (NLP-preview, форма, импорт), а не команда. Поэтому
 * входом команды являются уже выбранные вызывающим кодом соседние ранги (или
 * явный признак «список пуст»/«вставить в начало/конец») — ровно то, что уже
 * есть в `packages/core/src/order`: `initialRank`/`rankAfter`/`rankBefore`/
 * `rankBetween`. Команда лишь их вызывает, не дублируя и не изобретая новой
 * стратегии.
 *
 * `explicit` — отдельный случай: адаптер импорта (или будущий batch-перенос)
 * иногда уже вычислил корректный `Rank` сам (например, пачкой при вставке
 * многих задач подряд, чтобы не пересчитывать соседей на каждую) — команде
 * незачем это отвергать, раз значение уже прошло `isRank`.
 */
export type NewTaskRank =
  | { readonly placement: 'empty-list' }
  | { readonly placement: 'end'; readonly lastRank: Rank }
  | { readonly placement: 'start'; readonly firstRank: Rank }
  | { readonly placement: 'between'; readonly lowerRank: Rank; readonly upperRank: Rank }
  | { readonly placement: 'explicit'; readonly rank: Rank };

export function resolveTaskRank(input: NewTaskRank): Rank {
  switch (input.placement) {
    case 'empty-list':
      return initialRank();
    case 'end':
      return rankAfter(input.lastRank);
    case 'start':
      return rankBefore(input.firstRank);
    case 'between':
      return rankBetween(input.lowerRank, input.upperRank);
    case 'explicit':
      return input.rank;
  }
}
