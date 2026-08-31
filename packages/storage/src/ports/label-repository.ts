import type { Label, LabelValidationContext, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. */
export interface LabelRepository {
  findById(id: Uuid): Promise<Label | null>;

  findByNormalizedName(normalizedName: string): Promise<Label | null>;

  /** Живые метки scope пользователя, упорядочены по `rank`. */
  listAll(): Promise<readonly Label[]>;

  /**
   * Готовый `LabelValidationContext` (`@shagi/core`, правило 24) —
   * нормализованные имена всех живых меток, не считая `excludingId` (иначе
   * повторное сохранение без изменений конфликтовало бы само с собой).
   */
  loadValidationContext(excludingId: Uuid | null): Promise<LabelValidationContext>;
}
