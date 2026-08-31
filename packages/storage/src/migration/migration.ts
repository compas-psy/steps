/**
 * Механизм версионирования схемы (задание пакета работ E02.1, п.4; `02§15`).
 *
 * Платформонезависимо и намеренно generic по `TExecutor`: native (SQLite) и
 * web (IndexedDB) применяют миграцию совершенно разными средствами —
 * "native atomic DB backup/checkpoint" против "web versioned IndexedDB
 * upgrade + recovery snapshot" (`02§15` дословно перечисляет их как разные
 * механизмы, не один общий). Пытаться свести их в один `SchemaExecutorPort`
 * означало бы придумать абстракцию, которой нет в контракте — вместо этого
 * здесь зафиксирована только ОБЩАЯ ЧАСТЬ, которую `02§15` требует дословно
 * от обеих платформ: атомарный checkpoint перед миграцией, а провал —
 * восстановление, не потеря данных, и открытие read-only recovery-пути.
 * Эта общая часть — чистая функция `runMigrations`, проверяемая одним
 * набором тестов на игрушечном `TExecutor` (`test/migration/migration.test.ts`),
 * и тем же контрактом воспользуются оба будущих адаптера (следующие пакеты
 * работ), каждый со своим конкретным `TExecutor`
 * (`SqliteDriverPort` в `../sqlite/driver-port.ts` — один из кандидатов).
 */

export interface MigrationStep<TExecutor> {
  /** Монотонно возрастающая версия схемы, начиная с 1. */
  readonly version: number;
  /** Человекочитаемое описание — по-русски, как весь остальной код (CLAUDE.md «Стиль»). */
  readonly description: string;
  readonly up: (executor: TExecutor) => Promise<void> | void;
  /**
   * Стратегия отката — задание E02.1 п.4 требует, чтобы у КАЖДОЙ миграции
   * она была описана, не только "up". Не обязательно обратима без потерь
   * (откат схемы иногда сам по себе разрушителен — тогда `down` обязан
   * бросить с понятным сообщением, а не молча притвориться успехом);
   * функция обязана существовать и быть протестирована в любом случае.
   */
  readonly down: (executor: TExecutor) => Promise<void> | void;
}

/**
 * Порт атомарного снепшота/checkpoint (`02§15`: "native atomic DB
 * backup/checkpoint"; "web versioned IndexedDB upgrade + recovery snapshot
 * for destructive changes"). Оба случая абстрагируются одинаково: до
 * миграции — снять снимок, при провале — вернуться к нему.
 */
export interface MigrationCheckpointPort<TExecutor, TCheckpoint> {
  createCheckpoint(executor: TExecutor): Promise<TCheckpoint>;
  restoreCheckpoint(executor: TExecutor, checkpoint: TCheckpoint): Promise<void>;
}

export type MigrationOutcome =
  | { readonly status: 'up_to_date'; readonly version: number }
  | { readonly status: 'migrated'; readonly fromVersion: number; readonly toVersion: number }
  | {
      /**
       * Провал миграции никогда не стирает данные (`02§15` дословно) —
       * этот статус, а не исключение, потому что вызывающий код обязан
       * уметь продолжить работу: "открывается путь только для чтения с
       * технической ошибкой" (задание E02.1 п.4). Исключение прервало бы
       * колбэк раньше, чем вызывающий код успел бы отреагировать read-only
       * режимом — явный статус читаемее, чем `catch` вокруг исключения,
       * которое означает то же самое.
       */
      readonly status: 'failed_read_only_recovery';
      readonly fromVersion: number;
      readonly failedAtVersion: number;
      readonly error: string;
    };

/**
 * Применяет по порядку все миграции с версией строго больше `currentVersion`.
 * Перед КАЖДЫМ шагом снимается checkpoint (не один общий на всю пачку) —
 * так откат при провале посреди пачки возвращает ровно к последней успешно
 * применённой версии, а не к самому началу (не отбрасывает уже сделанную
 * работу этого же вызова).
 */
export async function runMigrations<TExecutor, TCheckpoint>(params: {
  readonly executor: TExecutor;
  readonly currentVersion: number;
  readonly migrations: readonly MigrationStep<TExecutor>[];
  readonly checkpoint: MigrationCheckpointPort<TExecutor, TCheckpoint>;
}): Promise<MigrationOutcome> {
  const { executor, currentVersion, checkpoint } = params;
  const pending = [...params.migrations]
    .filter((step) => step.version > currentVersion)
    .toSorted((a, b) => a.version - b.version);

  assertContiguousVersions(params.migrations);

  if (pending.length === 0) {
    return { status: 'up_to_date', version: currentVersion };
  }

  let appliedVersion = currentVersion;
  for (const step of pending) {
    const snapshot = await checkpoint.createCheckpoint(executor);
    try {
      await step.up(executor);
      appliedVersion = step.version;
    } catch (error) {
      await checkpoint.restoreCheckpoint(executor, snapshot);
      return {
        status: 'failed_read_only_recovery',
        fromVersion: currentVersion,
        failedAtVersion: step.version,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { status: 'migrated', fromVersion: currentVersion, toVersion: appliedVersion };
}

/** Версии обязаны идти без пропусков и без дублей начиная с 1 — иначе
 * `currentVersion` не может однозначно указывать "куда докатились". */
function assertContiguousVersions<TExecutor>(
  migrations: readonly MigrationStep<TExecutor>[],
): void {
  const sorted = [...migrations].toSorted((a, b) => a.version - b.version);
  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1;
    const actual = sorted[i]?.version;
    if (actual !== expected) {
      throw new RangeError(
        `runMigrations: версии миграций обязаны быть 1..N без пропусков; ожидалась ${expected}, встретилась ${String(actual)}`,
      );
    }
  }
}
