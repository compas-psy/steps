import type { Temporal } from '@js-temporal/polyfill';

import type {
  Attachment,
  ChecklistItem,
  ImportBatch,
  SyncConflict,
  SyncOutboxEntry,
  Label,
  Project,
  RecurrenceSeries,
  Reminder,
  Section,
  Task,
  TaskLabel,
  TaskLink,
} from '@shagi/core';

import type { DomainMutation } from './transaction.js';
import type { StorageQueryPort } from './query-port.js';

/**
 * Транзакция записи, переданная в колбэк `StoragePort.runTransaction`.
 * Единственный метод мутации — `applyMutation`; она же и есть весь
 * write-контракт этого пакета (см. `transaction.ts`). `StorageWriteTransaction`
 * также расширяет `StorageQueryPort` — колбэк может читать (в т.ч.
 * read-your-writes: эффекты собственных `applyMutation`, вызванных ранее в
 * той же транзакции, видны немедленно), чтобы, например, собрать
 * `TaskValidationContext` заново после промежуточной записи внутри одной
 * атомарной пользовательской команды.
 *
 * Намеренно нет отдельного метода `commit`/`rollback`: колбэк
 * `runTransaction`, вернувшийся нормально, коммитит; колбэк, бросивший
 * исключение, откатывает целиком — весь список эффектов, а не только
 * последний вызов `applyMutation`. Это соответствует `00§7`: "any user
 * command first in a single local transaction" — сама транзакция размером
 * с ОДНУ пользовательскую команду, не с один вызов `applyMutation`.
 */
export interface StorageWriteTransaction extends StorageQueryPort {
  applyMutation(mutation: DomainMutation): Promise<void>;

  /**
   * Запись `import_batches` — единственная сущность со своим write-методом,
   * а не через `applyMutation` (`01§26`, «Every import has
   * `import_batch_id`»).
   *
   * Причина ровно та, что уже записана в `import-batch-repository.ts`:
   * `import_batch` СОЗНАТЕЛЬНО не входит в `EntityType` (`@shagi/core`) —
   * он не синхронизируется обычным merge'ем и не имеет outbox-записи, а
   * `applyMutation` без outbox запрещена и типом, и рантайм-проверкой.
   * Втащить batch в `EntityType` значило бы объявить его синхронизируемым,
   * то есть соврать про модель; поэтому у него собственный путь записи —
   * зато В ТОЙ ЖЕ транзакции, что и импортируемые сущности, когда это
   * нужно.
   *
   * Идемпотентна по `id`: повторная запись того же batch обновляет его
   * (импорт помечает batch завершённым, а откат — отменённым, тем же id).
   */
  saveImportBatch(batch: ImportBatch): Promise<void>;
}

/** Итог чистки просроченных tombstone (`../tombstone/tombstone.ts`) — по
 * одному счётчику на каждую сущность с полем `deletedAt` (`@shagi/core`). */
export interface TombstonePurgeSummary {
  readonly task: number;
  readonly project: number;
  readonly section: number;
  readonly label: number;
  readonly checklistItem: number;
}

/**
 * Точка входа пакета — то, что видит командный слой (следующий пакет
 * работ) и то, против чего написан общий набор тестов контракта
 * (`../contract/storage-contract.ts`).
 */
export interface StoragePort extends StorageQueryPort {
  /**
   * Единственный способ мутировать хранилище (`00§7`). Domain-валидация
   * (`@shagi/core validateDomainMutation`) происходит СНАРУЖИ, до вызова —
   * это ответственность командного слоя, не этого пакета (пакет работ
   * E02.1 «Границы»: "Кросс-строчные ограничения... обеспечиваются
   * транзакционно и валидатором из `@shagi/core` — не пиши второй
   * валидатор"). Здесь только атомарность самой записи.
   */
  runTransaction<T>(run: (tx: StorageWriteTransaction) => Promise<T>): Promise<T>;

  /**
   * Чистильщик просроченных (>90 дней, `02§9`) tombstone — системная
   * поддержка, а не пользовательская команда: запись уже была
   * синхронизирована outbox-записью в момент своего tombstone-удаления,
   * повторная синхронизация физического удаления не нужна (сервер сам
   * стирает свою копию по тому же 90-дневному сроку), поэтому это
   * НЕ `DomainMutation` и НЕ требует outbox-записи.
   */
  purgeExpiredTombstones(now: Temporal.Instant): Promise<TombstonePurgeSummary>;

  /**
   * Стирает ВСЁ локальное содержимое: доменные таблицы, tombstone,
   * поисковый индекс и очередь синхронизации. Экран M52 «Delete Data»
   * (`05_SECURITY_PRIVACY_LEGAL.md` §13).
   *
   * НЕ `DomainMutation` и намеренно НЕ пишет ни одной outbox-записи — по
   * той же §13: «Never conflate local delete and account delete». Локальное
   * удаление обязано стирать копию НА ЭТОМ устройстве и ничего не сообщать
   * серверу; запись в outbox означала бы «удали это и у себя», то есть
   * ровно то смешение, которое спека запрещает. Сегодня сервера нет вовсе,
   * но правило важно записать в контракте, а не вспомнить его потом.
   *
   * Tombstone тоже стираются: они существуют, чтобы рассказать серверу об
   * удалении, а рассказывать больше нечему и некому — оставить их значило
   * бы хранить следы задач после того, как человек попросил стереть всё.
   *
   * Атомарность обязательна: наполовину стёртое хранилище хуже нестёртого —
   * человек считает, что данных нет, а часть осталась.
   */
  eraseAllLocalData(): Promise<void>;

  /**
   * Полное содержимое рабочего пространства — источник для экспорта бэкапа
   * (`01§27`).
   *
   * Отдельный метод, а не набор вызовов репозиториев, по простой причине:
   * репозитории отвечают на вопросы ЭКРАНОВ («задачи этого проекта», «на
   * эту дату», «этой серии»), и собрать из них ВСЁ невозможно — задача без
   * даты, без проекта и без родителя не попадает ни в одну выборку.
   * Бэкап, потерявший такую задачу, хуже отсутствующего: человек считает,
   * что копия есть.
   *
   * Что сюда НЕ входит и почему — `@shagi/importer`
   * `backup/snapshot.ts`: очередь синхронизации, конфликты, партии импорта
   * и любые секреты (`01§27`: «Never include auth/device secrets»).
   * Включая tombstone: удалённое остаётся удалённым и в копии.
   */
  exportAllEntities(): Promise<WorkspaceExport>;

  /**
   * Полный дамп ВСЕГО содержимого — для переноса между адаптерами
   * (IndexedDB → нативная SQLite, ADR-0005).
   *
   * Чем отличается от `exportAllEntities` и почему это не одно и то же:
   * бэкап (`01§27`) — копия ДАННЫХ ЧЕЛОВЕКА, и в него сознательно не
   * входят ни tombstone, ни очередь синхронизации, ни партии импорта (см.
   * `@shagi/importer` `backup/snapshot.ts`). Перенос backend'а — другое
   * дело: он обязан сохранить состояние устройства ЦЕЛИКОМ. Потерять
   * tombstone значит воскресить удалённые задачи при следующей
   * синхронизации; потерять outbox значит не отправить изменения, которые
   * человек уже сделал. Поэтому здесь — всё, включая удалённое.
   */
  dumpForMigration(): Promise<StorageDump>;

  /**
   * Обратная сторона `dumpForMigration`: записывает дамп как есть, одной
   * транзакцией, БЕЗ валидации и без порождения outbox-записей. Это не
   * пользовательская команда, а перенос уже существующего состояния —
   * дописывать в очередь синхронизации то, что человек не делал, было бы
   * искажением истории устройства.
   */
  loadFromMigrationDump(dump: StorageDump): Promise<void>;
}

/**
 * Состояние устройства целиком — включая удалённое (tombstone), очередь
 * синхронизации, конфликты и партии импорта.
 */
export interface StorageDump extends WorkspaceExport {
  readonly syncOutbox: readonly SyncOutboxEntry[];
  readonly syncConflicts: readonly SyncConflict[];
  readonly importBatches: readonly ImportBatch[];
}

/** Полный граф рабочего пространства — то, что уезжает в бэкап. В
 * `exportAllEntities` — только живые записи; в `dumpForMigration` (через
 * `StorageDump`) — все, включая tombstone. */
export interface WorkspaceExport {
  readonly projects: readonly Project[];
  readonly sections: readonly Section[];
  readonly tasks: readonly Task[];
  readonly labels: readonly Label[];
  readonly taskLabels: readonly TaskLabel[];
  readonly checklistItems: readonly ChecklistItem[];
  readonly reminders: readonly Reminder[];
  readonly recurrenceSeries: readonly RecurrenceSeries[];
  readonly taskLinks: readonly TaskLink[];
  readonly attachments: readonly Attachment[];
}
