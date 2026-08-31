import type { Section, Uuid } from '@shagi/core';

/** Только чтение — см. `task-repository.ts`. */
export interface SectionRepository {
  findById(id: Uuid): Promise<Section | null>;

  /** Индекс `sections(project_id, rank)` — живые секции, упорядочены по `rank`. */
  listByProject(projectId: Uuid): Promise<readonly Section[]>;
}
