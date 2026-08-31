import type {
  Attachment,
  ChecklistItem,
  EntityType,
  Label,
  Project,
  RecurrenceSeries,
  Reminder,
  Section,
  SyncOutboxEntry,
  Task,
  TaskLabel,
  TaskLink,
} from '@shagi/core';

import type { NonEmptyArray } from '../values.js';

/**
 * Единственная форма, в которой сущность может попасть в хранилище — по
 * одной на каждую точку `EntityType` (`@shagi/core`), кроме `import_batch`
 * (сознательно не входит в `EntityType`, см. `import-batch-repository.ts`).
 * Дискриминант `entity` совпадает со значениями `EntityType`, поэтому одна
 * и та же строка одновременно адресует и запись сущности здесь, и её
 * `outbox`-запись (`SyncOutboxEntry.entityType`) — их физически нельзя
 * рассинхронизировать вручную, они один и тот же литеральный тип.
 */
export type EntityWrite =
  | { readonly entity: 'task'; readonly value: Task }
  | { readonly entity: 'project'; readonly value: Project }
  | { readonly entity: 'section'; readonly value: Section }
  | { readonly entity: 'label'; readonly value: Label }
  | { readonly entity: 'task_label'; readonly value: TaskLabel }
  | { readonly entity: 'checklist_item'; readonly value: ChecklistItem }
  | { readonly entity: 'reminder'; readonly value: Reminder }
  | { readonly entity: 'recurrence_series'; readonly value: RecurrenceSeries }
  | { readonly entity: 'attachment'; readonly value: Attachment }
  | { readonly entity: 'task_link'; readonly value: TaskLink };

/**
 * Проверка во время компиляции, что множества значений `EntityWrite['entity']`
 * и `EntityType` (`@shagi/core`) совпадают буквально, в обе стороны — не тест
 * поведения, а тип, который не скомпилируется, если кто-то добавит значение
 * в `EntityType` и забудет завести соответствующую ветку `EntityWrite`, или
 * наоборот. Использована ниже в самоприменяющемся `const`-утверждении, а не
 * только объявлена — так расхождение красным падает уже на `tsc`, до
 * запуска `pnpm test`.
 */
export type AssertEntityWriteCoversEntityType = EntityWrite['entity'] extends EntityType
  ? true
  : ['EntityWrite не покрывает весь EntityType', EntityWrite['entity']];
export type AssertEntityTypeCoversEntityWrite = EntityType extends EntityWrite['entity']
  ? true
  : ['EntityType содержит значения без ветки EntityWrite', EntityType];

const entityWriteCoversEntityType: AssertEntityWriteCoversEntityType = true;
const entityTypeCoversEntityWrite: AssertEntityTypeCoversEntityWrite = true;
void entityWriteCoversEntityType;
void entityTypeCoversEntityWrite;

/**
 * **Единственный** вход мутации, которую умеет применить хранилище
 * (задание пакета работ E02.1, `00§7` шаги 2–3: "canonical mutation" +
 * "outbox mutation" одной локальной транзакцией).
 *
 * `outbox` — `NonEmptyArray`, а не `readonly SyncOutboxEntry[]`. Это не
 * стилистический выбор: пустой массив `[]` при таком типе не проходит
 * проверку типов TypeScript (кортеж `readonly [T, ...T[]]` требует минимум
 * один элемент) — вызвать `applyMutation` без единой outbox-записи не
 * получится, даже если кто-то по ошибке попробует передать `outbox: []`,
 * это не скомпилируется. См. `test/ports/transaction-outbox-invariant.test.ts`
 * — там ровно этот случай зафиксирован `// @ts-expect-error`.
 *
 * `writes` может быть пустым — это осознанно: recurrence-atomic-completion
 * (`02§13`) в некоторых сценариях меняет только outbox-адресуемые сущности,
 * которые уже перечислены в `writes`, но чисто теоретическая мутация без
 * канонических изменений (например, будущий "touch"/heartbeat) не должна
 * быть запрещена на уровне типа — это дело валидатора команд, не формы API.
 */
export interface DomainMutation {
  readonly writes: readonly EntityWrite[];
  readonly outbox: NonEmptyArray<SyncOutboxEntry>;
}
