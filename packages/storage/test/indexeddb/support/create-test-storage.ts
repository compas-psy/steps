// eslint-disable-next-line import/no-unassigned-import -- побочный эффект: регистрирует indexedDB/IDBKeyRange/... в globalThis, нечего присваивать
import 'fake-indexeddb/auto';

import { createIndexedDbStorage, type IndexedDbStorage } from '../../../src/indexeddb/index.js';

/**
 * `fake-indexeddb/auto` (devDependency, см. отчёт пакета работ E02.3)
 * регистрирует `indexedDB`/`IDBKeyRange`/... в `globalThis` — единственное
 * место в тестах этого пакета, где вообще упоминается `fake-indexeddb`;
 * сам адаптер (`src/indexeddb/*`) импортирует эти имена только КАК ТИПЫ
 * (`IDBDatabase` и т.п. из `lib.dom.d.ts`) и обращается к глобальному
 * `indexedDB` только внутри тел функций — в браузере эти тела так же
 * найдут настоящий нативный `indexedDB`, полифил тут ничего не подменяет
 * на уровне кода адаптера, только на уровне тестового рантайма Node.
 *
 * Каждый вызов создаёт СВОЮ базу (случайное имя) — `fake-indexeddb` держит
 * все базы в памяти процесса на весь его срок жизни, поэтому без разных
 * имён второй тест видел бы данные первого (общий контракт, `runStorageContract`,
 * вызывает фабрику много раз за один прогон, ожидая каждый раз пустое
 * хранилище).
 */
export function createTestIndexedDbStorage(): IndexedDbStorage {
  return createIndexedDbStorage(`test-${crypto.randomUUID()}`);
}
