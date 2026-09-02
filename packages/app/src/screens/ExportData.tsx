/**
 * Экспорт и восстановление — M49 «Export» (`01§27`, «Always Free»).
 *
 * Экран делает ровно три вещи и ни одной сверх:
 *
 * 1. Собирает `shagi-backup-v1.zip` и отдаёт его человеку файлом.
 * 2. Экспортирует один проект таблицей CSV («Also per-project CSV
 *    portability export»).
 * 3. Читает бэкап обратно и восстанавливает граф.
 *
 * Формат, контрольные суммы и правила перенумерации живут в
 * `@shagi/importer`; здесь только вызовы и показ.
 *
 * --- Как файл попадает к человеку ----------------------------------------
 *
 * Через `URL.createObjectURL` + временную ссылку с `download`. Это не
 * обход `FileStorePort`, а его отсутствие: во всех трёх оболочках порт
 * сегодня `Unavailable` (вложения — R1b), и «сохранить файл» на вебе
 * означает ровно скачивание. Когда порт появится, замена коснётся одной
 * функции `saveFile` ниже.
 *
 * --- Защита от формул в CSV ----------------------------------------------
 *
 * Ячейки экспорта проходят через `formatCsvCell` (`@shagi/importer`):
 * заголовок задачи, начинающийся с `=`, в табличном редакторе стал бы
 * формулой. Нейтрализация делается ИМЕННО на выходе, а не при импорте —
 * разбор в `csv/sanitize.ts`.
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { DEFAULT_LOCALE, t } from '@shagi/i18n';
import { generateDeviceId, type Project, type Uuid } from '@shagi/core';
import {
  applyRestore,
  BACKUP_FILE_NAME,
  buildBackupArchive,
  formatCsvCell,
  planRestore,
  readBackupArchive,
  type RestorePlan,
  type WorkspaceSnapshot,
} from '@shagi/importer';
import { Button, Card, CardBody, IconButton, Modal, Toast } from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';

import './ExportData.css';

/** Версия приложения для манифеста. Одно место, а не строка в разметке. */
const APP_VERSION = '0.1.0';

let cachedDeviceId: Uuid | null = null;
function deviceId(): Uuid {
  cachedDeviceId ??= generateDeviceId();
  return cachedDeviceId;
}

function saveFile(bytes: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Освобождать сразу нельзя — браузер ещё не начал скачивание; отпускаем
  // на следующем такте, когда клик уже обработан.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportData(): ReactElement {
  const controller = useAppController();
  const storage = useStorage();
  const restoreInput = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [busy, setBusy] = useState<'backup' | 'csv' | 'restore' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    readonly plan: RestorePlan;
    readonly snapshot: WorkspaceSnapshot;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storage.projects.listActive().then((list) => {
      if (cancelled) return;
      setProjects(list);
      setSelectedProjectId(list[0]?.id ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  async function handleBackup(): Promise<void> {
    setBusy('backup');
    setError(null);
    const exported = await storage.exportAllEntities();
    const snapshot: WorkspaceSnapshot = { ...exported, settings: {} };
    const bytes = await buildBackupArchive(snapshot, {
      appVersion: APP_VERSION,
      exportedAt: Temporal.Now.instant().toString(),
      locale: DEFAULT_LOCALE,
    });
    saveFile(bytes, BACKUP_FILE_NAME, 'application/zip');
    setBusy(null);
    setNotice(
      t('dataTransfer', 'export.backup.ready', {
        size: Math.max(1, Math.round(bytes.length / 1024)),
      }),
    );
  }

  async function handleProjectCsv(): Promise<void> {
    if (selectedProjectId === '') return;
    setBusy('csv');
    setError(null);
    const projectId = selectedProjectId as Uuid;
    const project = projects.find((candidate) => candidate.id === projectId);
    const sections = await storage.sections.listByProject(projectId);
    const rows: string[][] = [
      ['TYPE', 'CONTENT', 'DESCRIPTION', 'PRIORITY', 'INDENT', 'DATE', 'DEADLINE', 'DURATION'],
    ];
    for (const sectionId of [null, ...sections.map((section) => section.id)]) {
      const section = sections.find((candidate) => candidate.id === sectionId);
      if (section !== undefined) rows.push(['section', section.title, '', '', '', '', '', '']);
      const tasks = await storage.tasks.listByProjectSection(projectId, sectionId, 'active');
      for (const task of tasks) {
        rows.push([
          'task',
          task.title,
          task.description,
          // Обратное отображение приоритета: в Todoist 4 — самый срочный.
          String(5 - task.priority),
          task.parentTaskId === null ? '1' : '2',
          task.plannedDate === null
            ? ''
            : `${task.plannedDate.toString()}${task.plannedTime === null ? '' : ` ${task.plannedTime.toString().slice(0, 5)}`}`,
          task.deadlineDate?.toString() ?? '',
          task.durationMin === null ? '' : String(task.durationMin),
        ]);
      }
    }
    const csv = rows.map((row) => row.map((cell) => formatCsvCell(cell)).join(',')).join('\r\n');
    // BOM — чтобы Excel открыл кириллицу в UTF-8, а не в системной кодировке.
    saveFile(
      new TextEncoder().encode(`﻿${csv}`),
      `${project?.title ?? 'project'}.csv`,
      'text/csv;charset=utf-8',
    );
    setBusy(null);
  }

  async function handleRestoreFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Значение поля сбрасывается СРАЗУ: без этого повторный выбор того же
    // файла не порождает события `change` (браузер считает, что ничего не
    // изменилось), и человек, поправивший файл и выбравший его снова, не
    // получал бы ничего. Найдено живым прогоном.
    event.target.value = '';
    if (file === undefined) return;
    setBusy('restore');
    setError(null);
    const parsed = await readBackupArchive(new Uint8Array(await file.arrayBuffer()));
    setBusy(null);
    if (parsed.status === 'rejected') {
      setError(restoreRejectionText(parsed.code, parsed.path));
      return;
    }
    // Карта занятых id считается ДО подтверждения: человек должен видеть,
    // сколько записей приедет копиями, ещё до записи (`01§27`).
    const existingExport = await storage.exportAllEntities();
    const plan = planRestore(parsed.snapshot, {
      existing: {
        projects: new Set(existingExport.projects.map((item) => item.id)),
        sections: new Set(existingExport.sections.map((item) => item.id)),
        tasks: new Set(existingExport.tasks.map((item) => item.id)),
        labels: new Set(existingExport.labels.map((item) => item.id)),
        checklistItems: new Set(existingExport.checklistItems.map((item) => item.id)),
        reminders: new Set(existingExport.reminders.map((item) => item.id)),
        recurrenceSeries: new Set(existingExport.recurrenceSeries.map((item) => item.id)),
      },
    });
    setPendingRestore({ plan, snapshot: parsed.snapshot });
  }

  async function confirmRestore(): Promise<void> {
    if (pendingRestore === null) return;
    setBusy('restore');
    const summary = await applyRestore(pendingRestore.plan.snapshot, {
      storage,
      now: Temporal.Now.instant(),
      deviceId: deviceId(),
    });
    const remapped = pendingRestore.plan.remapped.size;
    setPendingRestore(null);
    setBusy(null);
    setNotice(
      [
        t('dataTransfer', 'export.restore.done', {
          tasks: summary.tasks,
          projects: summary.projects,
        }),
        remapped === 0 ? '' : t('dataTransfer', 'export.restore.remapped', { count: remapped }),
      ]
        .filter((part) => part !== '')
        .join(' '),
    );
  }

  return (
    <div className="shagi-export">
      <div className="shagi-export__header">
        <IconButton
          icon="back"
          label={t('dataTransfer', 'export.back.label')}
          onClick={() => controller.goTo('dataPrivacy')}
        />
        <h1 className="shagi-export__title">{t('dataTransfer', 'export.pageTitle')}</h1>
      </div>

      {error !== null && (
        <Toast variant="error" message={error} onDismiss={() => setError(null)} dismissLabel="✕" />
      )}
      {notice !== null && (
        <Toast
          variant="success"
          message={notice}
          onDismiss={() => setNotice(null)}
          dismissLabel="✕"
        />
      )}

      <Card>
        <CardBody>
          <h2 className="shagi-export__section-title">
            {t('dataTransfer', 'export.backup.title')}
          </h2>
          <p className="shagi-export__hint">{t('dataTransfer', 'export.backup.description')}</p>
          <Button variant="primary" disabled={busy !== null} onClick={() => void handleBackup()}>
            {busy === 'backup'
              ? t('dataTransfer', 'export.backup.preparing')
              : t('dataTransfer', 'export.backup.action')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="shagi-export__section-title">{t('dataTransfer', 'export.csv.title')}</h2>
          <p className="shagi-export__hint">{t('dataTransfer', 'export.csv.description')}</p>
          <div className="shagi-export__row">
            <select
              aria-label={t('dataTransfer', 'export.csv.projectLabel')}
              className="shagi-export__select"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              disabled={busy !== null || projects.length === 0}
              onClick={() => void handleProjectCsv()}
            >
              {t('dataTransfer', 'export.csv.action')}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="shagi-export__section-title">
            {t('dataTransfer', 'export.restore.title')}
          </h2>
          <p className="shagi-export__hint">{t('dataTransfer', 'export.restore.description')}</p>
          <input
            ref={restoreInput}
            type="file"
            accept=".zip,application/zip"
            aria-label={t('dataTransfer', 'export.restore.fileLabel')}
            className="shagi-export__file"
            onChange={(event) => void handleRestoreFile(event)}
          />
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => restoreInput.current?.click()}
          >
            {busy === 'restore'
              ? t('dataTransfer', 'export.restore.reading')
              : t('dataTransfer', 'export.restore.action')}
          </Button>
        </CardBody>
      </Card>

      {pendingRestore !== null && (
        <Modal
          open
          onClose={() => setPendingRestore(null)}
          title={t('dataTransfer', 'export.restore.confirmTitle')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingRestore(null)}>
                {t('dataTransfer', 'export.restore.confirmCancel')}
              </Button>
              <Button variant="primary" onClick={() => void confirmRestore()}>
                {t('dataTransfer', 'export.restore.confirmAccept')}
              </Button>
            </>
          }
        >
          <p>
            {t('dataTransfer', 'export.restore.confirmBody', {
              tasks: t('dataTransfer', 'import.preview.tasks', {
                count: pendingRestore.snapshot.tasks.length,
              }),
              projects: t('dataTransfer', 'import.preview.projects', {
                count: pendingRestore.snapshot.projects.length,
              }),
            })}
          </p>
        </Modal>
      )}
    </div>
  );
}

function restoreRejectionText(code: string, path?: string): string {
  switch (code) {
    case 'manifest_missing':
      return t('dataTransfer', 'export.restore.reject.manifest_missing');
    case 'manifest_unreadable':
      return t('dataTransfer', 'export.restore.reject.manifest_unreadable');
    case 'schema_too_new':
      return t('dataTransfer', 'export.restore.reject.schema_too_new');
    case 'checksum_mismatch':
      return t('dataTransfer', 'export.restore.reject.checksum_mismatch', { path: path ?? '' });
    default:
      return t('dataTransfer', 'import.reject.unreadable_archive');
  }
}
