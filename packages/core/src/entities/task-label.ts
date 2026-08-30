import { isHlcAfter, type Hlc } from '../hlc.js';
import type { Uuid } from '../values.js';

/**
 * `task_labels` (`02§2`, `02§8` OR-set) — связь задачи и метки.
 *
 * Нет отдельного `id`/`deleted_at`: существование связи не хранится булевым
 * флагом, а **вычисляется** из пары HLC (`addHlc`/`removeHlc`) — это и есть
 * OR-set. `removeHlc=null` значит "ни разу не отвязывалась".
 */
export interface TaskLabel {
  readonly taskId: Uuid;
  readonly labelId: Uuid;
  readonly addHlc: Hlc;
  readonly removeHlc: Hlc | null;
}

/**
 * `02§8`: "relation exists when add_hlc > remove_hlc". Отсутствие
 * `removeHlc` эквивалентно "остальное время меньше `addHlc`" — связь жива.
 */
export function isTaskLabelActive(link: TaskLabel): boolean {
  if (link.removeHlc === null) {
    return true;
  }
  return isHlcAfter(link.addHlc, link.removeHlc);
}
