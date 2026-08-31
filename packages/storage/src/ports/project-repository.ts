import type { Project, Uuid } from '@shagi/core';

/** Только чтение — см. комментарий `task-repository.ts` о том, почему у
 * репозиториев этого пакета нет методов записи. */
export interface ProjectRepository {
  findById(id: Uuid): Promise<Project | null>;

  /** Активные (не архивные, не tombstone) проекты, упорядочены по `rank`. */
  listActive(): Promise<readonly Project[]>;

  /**
   * Число активных проектов в scope пользователя, не считая
   * `excludingId` — прямой вход для `ProjectValidationContext.
   * activeProjectCountExcludingThis` (`@shagi/core`, правила 27, 28).
   * `excludingId=null` для ещё не созданного проекта (считает все).
   */
  countActiveExcluding(excludingId: Uuid | null): Promise<number>;
}
