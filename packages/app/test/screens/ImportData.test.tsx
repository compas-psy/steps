// eslint-disable-next-line import/no-unassigned-import -- побочный эффект: регистрирует indexedDB в globalThis, присваивать нечего
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { ImportData } from '../../src/screens/ImportData.js';
import type { StorageBackend } from '../../src/state/storage-backend.js';

const INDEXEDDB: StorageBackend = { kind: 'indexeddb', databaseName: 'shagi-import-test' };

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: INDEXEDDB };
}

/** Фикстуры берутся ИЗ `@shagi/importer` — те же настоящие файлы, что и в
 * его собственных тестах: заводить вторую копию значило бы позволить им
 * разойтись. `import.meta.url` в среде vitest указывает на путь `/@fs/...`,
 * поэтому корень пакета вычисляется от `process.cwd()`. */
function fixture(name: string): File {
  const path = resolve(process.cwd(), '..', 'importer', 'test', 'fixtures', name);
  return new File([readFileSync(path)], name, { type: 'text/csv' });
}

function renderImport(): ReturnType<typeof createAppController> {
  const controller = createAppController({ screen: 'importData' });
  render(
    <AppProvider host={testHost()} controller={controller}>
      <ImportData />
    </AppProvider>,
  );
  return controller;
}

describe('ImportData (M46–M48)', () => {
  it('пустой файл отклонён с объяснением, предпросмотр не показывается', async () => {
    const user = userEvent.setup();
    renderImport();

    await user.upload(
      screen.getByLabelText(t('dataTransfer', 'import.source.fileLabel')),
      fixture('todoist-empty.csv'),
    );

    expect(
      await screen.findByText(t('dataTransfer', 'import.reject.empty_file')),
    ).toBeInTheDocument();
    expect(screen.queryByText(t('dataTransfer', 'import.preview.title'))).not.toBeInTheDocument();
  });

  it('чужой CSV отклонён как не-Todoist', async () => {
    const user = userEvent.setup();
    renderImport();

    await user.upload(
      screen.getByLabelText(t('dataTransfer', 'import.source.fileLabel')),
      fixture('todoist-not-todoist.csv'),
    );

    expect(
      await screen.findByText(t('dataTransfer', 'import.reject.not_todoist_csv')),
    ).toBeInTheDocument();
  });

  it('годный файл показывает предпросмотр и НЕ пишет в хранилище до подтверждения', async () => {
    const user = userEvent.setup();
    renderImport();

    await user.upload(
      screen.getByLabelText(t('dataTransfer', 'import.source.fileLabel')),
      fixture('todoist-single.csv'),
    );

    expect(await screen.findByText(t('dataTransfer', 'import.preview.title'))).toBeInTheDocument();
    expect(
      screen.getByText(t('dataTransfer', 'import.preview.tasks', { count: 5 })),
    ).toBeInTheDocument();
    // Предупреждение о сплющивании — на экране, а не только в отчёте.
    expect(screen.getByText(/один уровень подзадач/)).toBeInTheDocument();
    // Кнопка применения ещё не нажата — результата быть не может.
    expect(screen.queryByText(t('dataTransfer', 'import.result.title'))).not.toBeInTheDocument();
  });

  it('повторный выбор ТОГО ЖЕ файла снова обрабатывается', async () => {
    // Регрессия живого прогона: поле `<input type="file">` не порождает
    // `change`, если значение не изменилось, — человек, выбравший тот же
    // файл второй раз, не получал ничего. Значение сбрасывается сразу
    // после чтения, поэтому второй выбор снова доходит до обработчика.
    const user = userEvent.setup();
    renderImport();
    const input = screen.getByLabelText(
      t('dataTransfer', 'import.source.fileLabel'),
    ) as HTMLInputElement;

    await user.upload(input, fixture('todoist-empty.csv'));
    expect(
      await screen.findByText(t('dataTransfer', 'import.reject.empty_file')),
    ).toBeInTheDocument();
    expect(input.value).toBe('');

    await user.upload(input, fixture('todoist-single.csv'));
    expect(await screen.findByText(t('dataTransfer', 'import.preview.title'))).toBeInTheDocument();
  });

  it('импорт применяется и его можно отменить, пока окно открыто', async () => {
    const user = userEvent.setup();
    renderImport();

    await user.upload(
      screen.getByLabelText(t('dataTransfer', 'import.source.fileLabel')),
      fixture('todoist-single.csv'),
    );
    await screen.findByText(t('dataTransfer', 'import.preview.title'));
    await user.click(
      screen.getByRole('button', { name: t('dataTransfer', 'import.preview.confirm') }),
    );

    expect(await screen.findByText(t('dataTransfer', 'import.result.title'))).toBeInTheDocument();
    expect(
      screen.getByText(t('dataTransfer', 'import.result.createdTasks', { count: 5 })),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: t('dataTransfer', 'import.result.rollback') }),
    );
    await waitFor(() =>
      expect(screen.getByText(t('dataTransfer', 'import.result.rollbackDone'))).toBeInTheDocument(),
    );
  });

  it('незакрытое окно отката переживает уход с экрана', async () => {
    // Регрессия живого прогона: `01§26` даёт 10 минут, а первая версия
    // теряла кнопку при первом же переходе — состояние жило только в
    // памяти компонента. Здесь экран размонтируется и монтируется заново,
    // как при уходе на Today и обратно.
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'importData' });
    const host = testHost();
    const first = render(
      <AppProvider host={host} controller={controller}>
        <ImportData />
      </AppProvider>,
    );

    await user.upload(
      screen.getByLabelText(t('dataTransfer', 'import.source.fileLabel')),
      fixture('todoist-single.csv'),
    );
    await screen.findByText(t('dataTransfer', 'import.preview.title'));
    await user.click(
      screen.getByRole('button', { name: t('dataTransfer', 'import.preview.confirm') }),
    );
    await screen.findByText(t('dataTransfer', 'import.result.title'));

    first.unmount();
    render(
      <AppProvider host={host} controller={controller}>
        <ImportData />
      </AppProvider>,
    );

    expect(await screen.findByText(t('dataTransfer', 'import.result.title'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('dataTransfer', 'import.result.rollback') }),
    ).toBeInTheDocument();
  });
});
