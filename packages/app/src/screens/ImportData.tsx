/**
 * Импорт из Todoist — M46 «Import Source», M47 «Import Preview» и M48
 * «Import Result».
 *
 * --- Почему три экрана матрицы это один маршрут -------------------------
 *
 * Матрица (`12`) перечисляет их отдельными экранами, и по смыслу это три
 * разных вида. Но между ними ходит РАЗОБРАННЫЙ ПЛАН — значение, которое
 * живёт ровно от выбора файла до применения и после этого никому не
 * нужно. Чтобы разнести их по трём маршрутам `ScreenId`, план пришлось бы
 * положить в глобальное состояние (`state/store.ts`), где он был бы
 * единственным крупным значением с временем жизни в один сценарий — и
 * пережил бы, например, уход в настройки и обратно, показав человеку
 * предпросмотр файла, который он уже забыл. Поэтому маршрут один
 * (`'importData'`), а три экрана — три состояния `step`. Расхождение с
 * матрицей сознательное и здесь записано.
 *
 * --- Что делает и чего не делает экран -----------------------------------
 *
 * Разбор, применение и откат живут в `@shagi/importer`; здесь только
 * чтение файла, показ и вызовы. Правила `01§26` (сплющивание, повышение
 * повторов, комментарии, лимиты, окно отката) в этом файле не
 * дублируются — иначе их стало бы две копии, и однажды они разошлись бы.
 *
 * Файл читается ЦЕЛИКОМ на устройстве: ни одного сетевого вызова, как и
 * весь продукт (`01§1`, local-first).
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import { generateDeviceId, generateUuidV7, type Uuid } from '@shagi/core';
import {
  applyTodoistImport,
  canRollbackImport,
  decodeText,
  parseTodoistFiles,
  rollbackImport,
  unpackArchive,
  type ImportOutcome,
  type ImportWarning,
  type TodoistCsvFile,
  type TodoistImportPlan,
} from '@shagi/importer';
import { Button, Card, CardBody, IconButton, Toast } from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';

import './ImportData.css';

type Step =
  | { readonly kind: 'source' }
  | { readonly kind: 'preview'; readonly plan: TodoistImportPlan; readonly fileName: string }
  | { readonly kind: 'result'; readonly outcome: ImportOutcome };

/** `ownerScope`/`deviceId` — как на остальных экранах: одна пара на
 * сеанс, до появления настоящей идентичности устройства. */
let cachedIdentity: { ownerScope: Uuid; deviceId: Uuid } | null = null;
function localIdentity(): { ownerScope: Uuid; deviceId: Uuid } {
  cachedIdentity ??= { ownerScope: generateUuidV7(), deviceId: generateDeviceId() };
  return cachedIdentity;
}

/** Текст предупреждения — по коду из `@shagi/importer`: пакет разбора
 * намеренно не знает продуктовых строк (CLAUDE.md, локализация). */
function warningText(warning: ImportWarning, plan: TodoistImportPlan): string {
  const taskTitle =
    warning.taskRef === null
      ? ''
      : (plan.projects
          .flatMap((project) => project.tasks)
          .find((task) => task.ref === warning.taskRef)?.title ?? '');
  const params = { ...warning.detail, task: taskTitle };
  switch (warning.code) {
    case 'deep_indent_flattened':
      return t('dataTransfer', 'import.warning.deep_indent_flattened', params);
    case 'recurring_subtask_promoted':
      return t('dataTransfer', 'import.warning.recurring_subtask_promoted', params);
    case 'date_not_recognized':
      return t('dataTransfer', 'import.warning.date_not_recognized', params);
    case 'recurrence_not_representable':
      return t('dataTransfer', 'import.warning.recurrence_not_representable', params);
    case 'comments_overflow_attachment':
      return t('dataTransfer', 'import.warning.comments_overflow_attachment', params);
    case 'collapsed_ignored':
      return t('dataTransfer', 'import.warning.collapsed_ignored');
    case 'timezone_recorded':
      return t('dataTransfer', 'import.warning.timezone_recorded', params);
    case 'people_preserved':
      return t('dataTransfer', 'import.warning.people_preserved', params);
    case 'unknown_columns':
      return t('dataTransfer', 'import.warning.unknown_columns', params);
  }
}

export function ImportData(): ReactElement {
  const controller = useAppController();
  const storage = useStorage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'source' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Незакрытое окно отката переживает уход с экрана.
   *
   * `01§26` даёт на «Отменить импорт» 10 минут, но первая версия экрана
   * теряла кнопку при первом же переходе: `step` жил только в памяти
   * компонента. Живой прогон показал это буквально — уйти на Today и
   * вернуться значило остаться без единственного способа отменить импорт,
   * хотя окно ещё открыто. Поэтому при открытии экран спрашивает
   * хранилище о последней партии и, если её ещё можно откатить,
   * возвращается сразу к результату.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const batch = await storage.importBatches.findLatest();
      if (batch === null || cancelled) return;
      const gate = await canRollbackImport(batch.id, {
        storage,
        now: Temporal.Now.instant(),
        deviceId: localIdentity().deviceId,
      });
      if (cancelled || !gate.can) return;
      const report = batch.reportJson as Record<string, unknown>;
      const ids = (key: string): readonly Uuid[] =>
        Array.isArray(report[key]) ? (report[key] as Uuid[]) : [];
      setStep({
        kind: 'result',
        outcome: {
          batchId: batch.id,
          createdProjectIds: ids('projectIds'),
          createdSectionIds: ids('sectionIds'),
          createdLabelIds: ids('labelIds'),
          createdTaskIds: ids('taskIds'),
          skipped: Array.isArray(report.skipped)
            ? (report.skipped as { title: string; reason: string }[])
            : [],
          rollbackDeadline: batch.rollbackDeadline,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  /** Разбирает выбранный файл: CSV — как есть, ZIP — распаковкой всех
   * CSV внутри (`01§26`, «backup ZIP containing project CSV files»). */
  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Значение поля сбрасывается СРАЗУ: без этого повторный выбор того же
    // файла не порождает события `change` (браузер считает, что ничего не
    // изменилось), и человек, поправивший файл и выбравший его снова, не
    // получал бы ничего. Найдено живым прогоном.
    event.target.value = '';
    if (file === undefined) return;
    setBusy(true);
    setError(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let files: TodoistCsvFile[];

    if (file.name.toLowerCase().endsWith('.zip')) {
      const unpacked = unpackArchive(bytes);
      if (unpacked.status === 'rejected') {
        setBusy(false);
        setError(archiveRejectionText(unpacked.code));
        return;
      }
      files = Object.entries(unpacked.files)
        .filter(([path]) => path.toLowerCase().endsWith('.csv'))
        .map(([path, content]) => ({ fileName: path, text: decodeText(content) }));
      if (files.length === 0) {
        setBusy(false);
        setError(t('dataTransfer', 'import.reject.no_csv_in_archive'));
        return;
      }
    } else {
      files = [{ fileName: file.name, text: decodeText(bytes) }];
    }

    const parsed = parseTodoistFiles(files);
    setBusy(false);
    if (parsed.status === 'rejected') {
      setError(t('dataTransfer', `import.reject.${parsed.rejection.code}`));
      return;
    }
    setStep({ kind: 'preview', plan: parsed.plan, fileName: file.name });
  }

  async function handleImport(plan: TodoistImportPlan): Promise<void> {
    setBusy(true);
    setError(null);
    const identity = localIdentity();
    const outcome = await applyTodoistImport(plan, {
      storage,
      now: Temporal.Now.instant(),
      deviceId: identity.deviceId,
      ownerScope: identity.ownerScope,
      // Entitlement пока всегда Free: биллинга в R1 нет. На импорт это не
      // влияет — лимит проектов для него не действует (`01§26`).
      hasProEntitlement: false,
    });
    setBusy(false);
    setStep({ kind: 'result', outcome });
  }

  async function handleRollback(outcome: ImportOutcome): Promise<void> {
    setBusy(true);
    const result = await rollbackImport(outcome.batchId, {
      storage,
      now: Temporal.Now.instant(),
      deviceId: localIdentity().deviceId,
    });
    setBusy(false);
    if (result.status === 'ok') {
      setNotice(t('dataTransfer', 'import.result.rollbackDone'));
      setError(null);
      return;
    }
    // Отказ — не ошибка приложения, а объяснимое состояние: показываем
    // ПРИЧИНУ, а не общее «не получилось».
    setError(t('dataTransfer', `import.rollback.refused.${result.code}`));
  }

  return (
    <div className="shagi-import">
      <div className="shagi-import__header">
        <IconButton
          icon="back"
          label={t('dataTransfer', 'import.back.label')}
          onClick={() => controller.goTo('dataPrivacy')}
        />
        <h1 className="shagi-import__title">{t('dataTransfer', 'import.pageTitle')}</h1>
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

      {step.kind === 'source' && (
        <Card>
          <CardBody>
            <h2 className="shagi-import__section-title">
              {t('dataTransfer', 'import.source.title')}
            </h2>
            <p className="shagi-import__hint">{t('dataTransfer', 'import.source.description')}</p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.zip,text/csv,application/zip"
              aria-label={t('dataTransfer', 'import.source.fileLabel')}
              className="shagi-import__file"
              onChange={(event) => void handleFile(event)}
            />
            <Button variant="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy
                ? t('dataTransfer', 'import.source.reading')
                : t('dataTransfer', 'import.source.pick')}
            </Button>
          </CardBody>
        </Card>
      )}

      {step.kind === 'preview' && (
        <>
          <Card>
            <CardBody>
              <h2 className="shagi-import__section-title">
                {t('dataTransfer', 'import.preview.title')}
              </h2>
              <ul className="shagi-import__totals">
                <li>
                  {t('dataTransfer', 'import.preview.projects', {
                    count: step.plan.totals.projects,
                  })}
                </li>
                <li>
                  {t('dataTransfer', 'import.preview.sections', {
                    count: step.plan.totals.sections,
                  })}
                </li>
                <li>
                  {t('dataTransfer', 'import.preview.tasks', { count: step.plan.totals.tasks })}
                </li>
                <li>
                  {t('dataTransfer', 'import.preview.labels', { count: step.plan.totals.labels })}
                </li>
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="shagi-import__section-title">
                {t('dataTransfer', 'import.preview.warningsTitle')}
              </h2>
              {allWarnings(step.plan).length === 0 ? (
                <p className="shagi-import__hint">
                  {t('dataTransfer', 'import.preview.noWarnings')}
                </p>
              ) : (
                <ul className="shagi-import__warnings">
                  {allWarnings(step.plan).map((warning, index) => (
                    <li key={`${warning.code}-${warning.taskRef ?? 'all'}-${index}`}>
                      {warningText(warning, step.plan)}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="shagi-import__actions">
            <Button variant="ghost" disabled={busy} onClick={() => setStep({ kind: 'source' })}>
              {t('dataTransfer', 'import.preview.cancel')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void handleImport(step.plan)}>
              {busy
                ? t('dataTransfer', 'import.preview.running')
                : t('dataTransfer', 'import.preview.confirm')}
            </Button>
          </div>
        </>
      )}

      {step.kind === 'result' && (
        <>
          <Card>
            <CardBody>
              <h2 className="shagi-import__section-title">
                {t('dataTransfer', 'import.result.title')}
              </h2>
              <ul className="shagi-import__totals">
                <li>
                  {t('dataTransfer', 'import.result.createdProjects', {
                    count: step.outcome.createdProjectIds.length,
                  })}
                </li>
                <li>
                  {t('dataTransfer', 'import.result.createdSections', {
                    count: step.outcome.createdSectionIds.length,
                  })}
                </li>
                <li>
                  {t('dataTransfer', 'import.result.createdLabels', {
                    count: step.outcome.createdLabelIds.length,
                  })}
                </li>
                <li>
                  {t('dataTransfer', 'import.result.createdTasks', {
                    count: step.outcome.createdTaskIds.length,
                  })}
                </li>
                <li>
                  {t('dataTransfer', 'import.result.skipped', {
                    count: step.outcome.skipped.length,
                  })}
                </li>
              </ul>
              {step.outcome.skipped.length > 0 && (
                <ul className="shagi-import__warnings">
                  {step.outcome.skipped.map((item) => (
                    <li key={item.title}>
                      {t('dataTransfer', 'import.result.skippedItem', {
                        title: item.title,
                        reason: item.reason,
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="shagi-import__actions">
            <Button
              variant="destructive"
              disabled={busy || notice !== null}
              onClick={() => void handleRollback(step.outcome)}
            >
              {t('dataTransfer', 'import.result.rollback')}
            </Button>
            <Button variant="primary" onClick={() => controller.goTo('todayEmpty')}>
              {t('dataTransfer', 'import.result.done')}
            </Button>
          </div>
          <p className="shagi-import__hint">{t('dataTransfer', 'import.result.rollbackHint')}</p>
        </>
      )}
    </div>
  );
}

function allWarnings(plan: TodoistImportPlan): readonly ImportWarning[] {
  return [...plan.warnings, ...plan.projects.flatMap((project) => project.warnings)];
}

function archiveRejectionText(code: string): string {
  switch (code) {
    case 'unsafe_path':
      return t('dataTransfer', 'import.reject.unsafe_path');
    case 'nested_archive':
      return t('dataTransfer', 'import.reject.nested_archive');
    case 'too_large_compressed':
      return t('dataTransfer', 'import.reject.too_large_compressed');
    case 'too_large_expanded':
      return t('dataTransfer', 'import.reject.too_large_expanded');
    case 'too_many_entries':
      return t('dataTransfer', 'import.reject.too_many_entries');
    default:
      return t('dataTransfer', 'import.reject.unreadable_archive');
  }
}
