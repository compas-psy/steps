import { initialRank, rankAfter, rankBefore, rankBetween } from '../order/index.js';
import type { Rank } from '../values.js';

/**
 * Вход команды для позиции нового/перемещаемого `rank` — то же самое, что
 * `NewTaskRank` (`commands/rank-input.ts`, вне территории этого пакета
 * работ), но заведено заново под нейтральным именем: `Rank` (`values.ts`) —
 * не параметризованный по сущности branded-тип, ранги Project и Section
 * позиционируются той же алгеброй, что и Task (задание, раздел «Готово,
 * только используй»: "initialRank/rankAfter/rankBefore/rankBetween —
 * генерик по Rank, не завязаны на Task, подходят для ранжирования Section
 * внутри Project так же, как уже используются для Task"). Дублирование
 * пяти строк диспетчера дешевле, чем протаскивать зависимость на
 * task-специфично названный `rank-input.ts` (вне территории — трогать
 * нельзя) в Project/Section команды.
 *
 * Один файл на обе сущности (Project и Section), а не `project-rank.ts` +
 * `section-rank.ts`: сама функция не знает, чей это ранг, только имя файла
 * лексически начинается с `project-`, потому что территория задания не
 * оставляет варианта имени файла без префикса `project-`/`section-`.
 */
export type NewRank =
  | { readonly placement: 'empty-list' }
  | { readonly placement: 'end'; readonly lastRank: Rank }
  | { readonly placement: 'start'; readonly firstRank: Rank }
  | { readonly placement: 'between'; readonly lowerRank: Rank; readonly upperRank: Rank }
  | { readonly placement: 'explicit'; readonly rank: Rank };

export function resolveRank(input: NewRank): Rank {
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
