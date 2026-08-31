import { describe, expect, it } from 'vitest';

import {
  runMigrations,
  type MigrationCheckpointPort,
  type MigrationStep,
} from '../../src/migration/migration.js';

/**
 * Игрушечный `TExecutor` — документ-хранилище в памяти, не SQLite/IndexedDB
 * (те — следующие пакеты работ). Этого достаточно, чтобы протестировать
 * САМ протокол безопасности (`02§15`), который платформонезависим (см.
 * заголовочный комментарий `../../src/migration/migration.ts`): будущие
 * конкретные миграции SQLite/IndexedDB обязаны следовать тому же паттерну
 * "up тестируется, down тестируется, checkpoint снимается перед каждым
 * шагом" — этот файл фиксирует паттерн как исполняемый пример.
 */
interface FakeStore {
  fields: Record<string, unknown>;
}

function createStore(): FakeStore {
  return { fields: {} };
}

const migration1AddTitle: MigrationStep<FakeStore> = {
  version: 1,
  description: 'Добавить поле title (тестовая миграция 1)',
  up: (store) => {
    store.fields['title'] = '';
  },
  down: (store) => {
    delete store.fields['title'];
  },
};

const migration2AddPriority: MigrationStep<FakeStore> = {
  version: 2,
  description: 'Добавить поле priority (тестовая миграция 2)',
  up: (store) => {
    store.fields['priority'] = 4;
  },
  down: (store) => {
    delete store.fields['priority'];
  },
};

const migration3Failing: MigrationStep<FakeStore> = {
  version: 3,
  description: 'Миграция, которая всегда падает — проверяет read-only recovery',
  up: () => {
    throw new Error('симулированный сбой миграции 3');
  },
  down: () => {
    throw new Error('откат миграции 3 не поддержан — вперёд она тоже никогда не проходит');
  },
};

/** Checkpoint — глубокая копия `fields`, как самый простой из возможных
 * "атомарных снимков" (`02§15`). */
const checkpoint: MigrationCheckpointPort<FakeStore, Record<string, unknown>> = {
  createCheckpoint: (store) => Promise.resolve({ ...store.fields }),
  restoreCheckpoint: (store, snapshot) => {
    store.fields = { ...snapshot };
    return Promise.resolve();
  },
};

describe('runMigrations — протокол безопасности (02§15)', () => {
  it('up_to_date: currentVersion уже на уровне последней миграции', async () => {
    const store = createStore();
    const outcome = await runMigrations({
      executor: store,
      currentVersion: 2,
      migrations: [migration1AddTitle, migration2AddPriority],
      checkpoint,
    });
    expect(outcome).toEqual({ status: 'up_to_date', version: 2 });
  });

  it('migrated: применяет по порядку миграции 1 и 2 — тест на обновление (up)', async () => {
    const store = createStore();
    const outcome = await runMigrations({
      executor: store,
      currentVersion: 0,
      migrations: [migration1AddTitle, migration2AddPriority],
      checkpoint,
    });
    expect(outcome).toEqual({ status: 'migrated', fromVersion: 0, toVersion: 2 });
    expect(store.fields).toEqual({ title: '', priority: 4 });
  });

  it('стратегия отката (down) каждой миграции описана и реально отменяет её up', () => {
    const store = createStore();
    migration1AddTitle.up(store);
    migration2AddPriority.up(store);
    expect(store.fields).toEqual({ title: '', priority: 4 });

    migration2AddPriority.down(store);
    expect(store.fields).toEqual({ title: '' });

    migration1AddTitle.down(store);
    expect(store.fields).toEqual({});
  });

  it('failed_read_only_recovery: провал миграции 3 не стирает уже применённые 1 и 2', async () => {
    const store = createStore();
    const outcome = await runMigrations({
      executor: store,
      currentVersion: 0,
      migrations: [migration1AddTitle, migration2AddPriority, migration3Failing],
      checkpoint,
    });

    expect(outcome).toEqual({
      status: 'failed_read_only_recovery',
      fromVersion: 0,
      failedAtVersion: 3,
      error: 'симулированный сбой миграции 3',
    });
    // Данные из миграций 1 и 2 сохранены — restoreCheckpoint откатил только
    // шаг 3 к снимку, снятому ПЕРЕД ним (не к самому началу).
    expect(store.fields).toEqual({ title: '', priority: 4 });
  });

  it('несмежные версии миграций — программная ошибка, не молчаливый пропуск', async () => {
    const gapMigration: MigrationStep<FakeStore> = { ...migration2AddPriority, version: 5 };
    await expect(
      runMigrations({
        executor: createStore(),
        currentVersion: 0,
        migrations: [migration1AddTitle, gapMigration],
        checkpoint,
      }),
    ).rejects.toThrow(/версии миграций обязаны быть 1..N без пропусков/);
  });
});
