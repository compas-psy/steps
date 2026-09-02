import type { Temporal } from '@js-temporal/polyfill';

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
}
