/**
 * Служебный value-type пакета — не доменный (`@shagi/core` уже определяет
 * доменные branded-типы, дублировать нечего). `NonEmptyArray` — единственный
 * способ, которым `DomainMutation.outbox` (`ports/transaction.ts`) не даёт
 * скомпилировать пустой список outbox-записей: TypeScript выводит кортеж
 * `readonly [T, ...T[]]` как минимум с одним элементом, а `[]` ему не
 * соответствует — это часть механизма «мимо outbox не записать» из задания
 * пакета работ E02.1 (не рантайм-проверка, а форма типа).
 */
export type NonEmptyArray<T> = readonly [T, ...T[]];

export function isNonEmptyArray<T>(value: readonly T[]): value is NonEmptyArray<T> {
  return value.length > 0;
}
