/**
 * Общий тип пропсов для чипов планирования (`DateChip`/`TimeChip`/
 * `DurationChip`/`DeadlineChip`/`ReminderChip`/`RecurrenceChip`) — тонких
 * обёрток над `Chip` (`../../Chip.tsx`), фиксирующих иконку под свой смысл.
 *
 * `ChipProps` — дискриминирующее объединение (`removable: true` тянет за
 * собой обязательные `removeLabel`/`onRemove`, см. заголовок `Chip.tsx`).
 * Обычный `Omit<ChipProps, K>` не распределяется по union и схлопывает его
 * до пересечения ключей — из-за этого потерялась бы сама дискриминация
 * (TS перестал бы требовать `removeLabel`/`onRemove` вместе с
 * `removable: true`). `DistributiveOmit` — стандартный обходной приём
 * (`T extends unknown ? ... : never` заставляет условный тип распределиться
 * по каждому члену union отдельно), сохраняющий объединение.
 *
 * `icon` чипы планирования фиксируют сами — исключён отсюда. `children`
 * заменён на `label: string` (задание пакета работ: чипы принимают уже
 * готовую отображаемую строку через пропс, а не JSX-детей — форматирование
 * даты/времени под locale делает вызывающий код через `@shagi/i18n`, не
 * этот пакет).
 */
import type { ChipProps } from '../../Chip.js';

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export type PlanningChipProps = DistributiveOmit<ChipProps, 'icon' | 'children'> & {
  /** Уже отформатированная вызывающим кодом строка (дата/время/длительность
   * и т.п.) — этот пакет её не вычисляет и не форматирует под locale. */
  readonly label: string;
};
