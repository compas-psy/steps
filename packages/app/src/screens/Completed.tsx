/**
 * `Completed` — M36 «Completed» (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`:
 * "normal restore; recurring historical copy rules"), эпик E12 «План, поиск,
 * фильтры, завершённые», ПОСЛЕДНИЙ пакет работ этого эпика (E12.4) — после
 * него закрыты все 13 эпиков плана волны 1 (E00–E12). Источник поведения —
 * `01_PRODUCT_BEHAVIOR_R1.md` §11.9–§11.11 (`restoreTaskCommand`/
 * `describeRestoreSituation`, `@shagi/core`, `restore-task.ts` — прочитан
 * целиком за полным разбором ветвлений, этот экран лишь вызывает готовую
 * командную классификацию, не пересчитывает её сам).
 *
 * --- Точка входа в UI (задание требует обосновать исследованием) -----------
 *
 * `AppShell` (`../shell/AppShell.tsx`, эпик E09/E12.1/E12.2) сегодня несёт
 * РОВНО четыре реальных пункта — Today/Plan/Projects/Search — прочитана
 * целиком: заголовок файла прямо говорит, что из пяти задуманных позиций
 * `02-ui.md` («Сегодня · План · + · Проекты · Поиск») реализовано четыре,
 * «Завершённые» вообще не входит в этот список позиций. Заводить пятую
 * позицию под то, чего сама дизайн-спека нижней навигации не называет —
 * придумывать интерфейс, которого нет в контракте (тот же принцип, по
 * которому `Search.tsx` уже отклонил лишний `ScreenId` под системные
 * фильтры, см. её заголовок, блок «E12.3», п.1).
 *
 * `Search.tsx` (эпик E12, пакеты работ E12.1/E12.3) — ВЫБРАН как точка входа,
 * тем же жанром решения, что уже принят там для системных фильтров: M34
 * «Search Empty» — место, где пользователь УЖЕ в намерении «найти», ещё не
 * начал печатать. D17 «Completed | searchable/restorable rules» (десктопная
 * половина той же матрицы) прямо СВЯЗЫВАЕТ «Search» и «Completed» одной
 * строкой контракта — сильный сигнал, что они относятся к одному и тому же
 * «месту поиска», не к двум независимым разделам. Кнопка `completed.entry.*`
 * рендерится в `Search.tsx` рядом с рядом системных фильтров (тот же
 * `isEmptyQuery`-блок — обе вещи относятся к «просмотру без текстового
 * запроса»), переход — обычный `controller.goTo('completed')`, тот же приём,
 * что уже применён к `'search'`/`'plan'` (обычный `ScreenId`, не оверлей —
 * это «главный» экран, на который возвращаются, а не шаг разового потока).
 *
 * --- Список: один запрос, без пагинации (задание — минимально достаточно) --
 *
 * `storage.tasks.listByStatusAndPlannedDate('completed')` — тот же индекс,
 * что уже используют `Search.tsx`/`Plan.tsx` для 'active' (подтверждено
 * чтением `packages/storage/src/memory/repositories.ts` в их заголовках:
 * возвращает ВСЕ живые задачи данного статуса, сортировка по `plannedDate`,
 * не фильтр по нему). Перезапрашивается заново после каждого успешного
 * restore (`loadTasks()`, не точечная правка локального массива) — тот же
 * приём, что `ProjectDetail.tsx runCommand` применяет после каждой команды:
 * список завершённых задач в этом пакете работ маленький по своей природе
 * (локальный однопользовательский масштаб, CLAUDE.md YAGNI), лишний повторный
 * запрос дешевле отдельной логики "вычесть восстановленную задачу из списка
 * вручную, не расходясь с тем, что реально произошло".
 *
 * --- Клик по задаче → диалог восстановления, не Task Detail -----------------
 *
 * Задание прямо говорит: не полноценный `TaskDetail.tsx`, только действие
 * restore. Клик по строке открывает `Modal` с состоянием диалога восстанов-
 * ления (`RestoreDialogState`) — минимально достаточная реализация, без
 * отдельного мини-просмотра задачи (заголовок диалога уже несёт `task.title`,
 * этого достаточно, чтобы подтвердить «какую именно задачу восстанавливаем»,
 * задание не просит большего).
 *
 * --- Диалог: `describeRestoreSituation` строит СОСТОЯНИЕ, не гадает --------
 *
 * При открытии диалога — асинхронный вызов `describeRestoreSituation(id,
 * deps)` (`@shagi/core`), диалог до его разрешения показывает нейтральный
 * текст загрузки (`dialog.situation === null`). Показанные варианты — прямое
 * отражение вернувшихся флагов (задание: "собери это состояние из уже
 * загруженных данных ... не гадай на глазок"):
 *
 *  - `recurringBlocked` → ТОЛЬКО `Создать отдельную копию` (`01§11.10` "no
 *    normal restore") — кнопка `Восстановить` не рендерится вовсе, не
 *    `disabled` с текстом (задание требует, чтобы блокировка была настоящим
 *    исходом команды — она и есть: `restoreTaskCommand` вернула бы
 *    `recurring_next_exists`, если бы эта кнопка всё же существовала и была
 *    нажата, но здесь её нет по построению, кнопки не расходятся с ситуацией);
 *  - `hierarchyChoiceRequired` и/или `archivedProjectChoiceRequired` →
 *    группа(ы) `Filter`-чипов «выбери один вариант», `Восстановить`
 *    активна, только когда ВСЕ требуемые выборы сделаны (оба флага могут
 *    быть истинны ОДНОВРЕМЕННО — parent+subtask завершены, а их общий
 *    проект архивный — тогда обе группы рендерятся разом, подтверждение
 *    одно на двоих, один вызов `restoreTaskCommand` с обоими полями);
 *  - ни один флаг не требует выбора → одна кнопка `Восстановить`, без
 *    промежуточного выбора (тот же вызов, оба поля выбора просто не заданы).
 *
 * `deletedParentAutoTopLevel`/`deletedProjectAutoInbox` — чисто
 * информационные (задание не просит подтверждения для автоматических веток
 * §11.11 "restore top-level into Inbox"/"deleted Parent") — короткая
 * поясняющая строка в диалоге, не блокирующая кнопку.
 *
 * --- Исход `rejected` (архивный проект поверх лимита 27/28 без Pro) --------
 *
 * Единственный `rejected`, реально достижимый с корректно построенным UI —
 * гейт лимита активных проектов при `archivedProjectChoice:'restore_project'`
 * (`hasProEntitlement: false` буквально — биллинга нет нигде в дереве
 * пакетов, тот же честный подход, что уже применяет `Projects.tsx`, её
 * заголовок). Показан обычным `Toast` (`errors.restoreFailed`), диалог
 * остаётся открытым — пользователь может выбрать `restore_to_inbox` вместо
 * этого, не переоткрывая диалог заново. Полноценный контекстный paywall
 * (`Entitlement`, как в `Projects.tsx`) — за пределами минимально достаточной
 * реализации этого пакета работ (задание не просит биллинг-UI для Completed).
 */
import { useEffect, useState, type ReactElement } from 'react';

import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import {
  describeRestoreSituation,
  generateDeviceId,
  restoreTaskCommand,
  type RestoreArchivedProjectChoice,
  type RestoreHierarchyChoice,
  type RestoreSituationResult,
  type RestoreTaskDeps,
  type Task,
  type Uuid,
} from '@shagi/core';
import { Button, EmptyState, Filter, Icon, IconButton, Modal, TaskRow, Toast } from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';
import './Completed.css';

// --- Локальная идентичность устройства (см. заголовок файла) ----------------
// Тот же узкий, файл-локальный приём, что `ProjectDetail.tsx`/остальные
// экраны этого дерева пакетов (граница пакетов, CLAUDE.md — не общий модуль).

interface LocalIdentity {
  readonly deviceId: Uuid;
}

let cachedLocalIdentity: LocalIdentity | null = null;

function getLocalIdentity(): LocalIdentity {
  cachedLocalIdentity ??= { deviceId: generateDeviceId() };
  return cachedLocalIdentity;
}

function isInteractiveRowClick(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, button') !== null;
}

interface RestoreDialogState {
  readonly task: Task;
  /** `null` — ситуация ещё грузится (см. заголовок файла). */
  readonly situation: RestoreSituationResult | null;
  readonly hierarchyChoice: RestoreHierarchyChoice | null;
  readonly archivedProjectChoice: RestoreArchivedProjectChoice | null;
}

/** Все обязательные выборы уже сделаны — кнопка `Восстановить` разблокирована. */
function isReadyToRestore(dialog: RestoreDialogState): boolean {
  if (dialog.situation === null || dialog.situation.status !== 'ok') {
    return false;
  }
  if (dialog.situation.hierarchyChoiceRequired && dialog.hierarchyChoice === null) {
    return false;
  }
  if (dialog.situation.archivedProjectChoiceRequired && dialog.archivedProjectChoice === null) {
    return false;
  }
  return true;
}

export function Completed(): ReactElement {
  const storage = useStorage();
  const controller = useAppController();
  const [tasks, setTasks] = useState<readonly Task[] | null>(null);
  const [dialog, setDialog] = useState<RestoreDialogState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadTasks(): Promise<readonly Task[]> {
    return storage.tasks.listByStatusAndPlannedDate('completed');
  }

  useEffect(() => {
    let cancelled = false;
    void loadTasks().then((loaded) => {
      if (!cancelled) setTasks(loaded);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storage стабилен на время жизни экрана
  }, [storage]);

  function restoreDeps(): RestoreTaskDeps {
    // `storage` (полный `StoragePort`) структурно подходит и под `.storage`
    // (`CommandStoragePort`), и под `.projectStorage` (`CommandProjectStoragePort`)
    // разом — тот же приём инверсии зависимости (ADR-0003), что `ProjectDetail.tsx`
    // уже применяет для `deleteSectionDeps()` (один объект хранилища в двух
    // узких ролях одновременно, без адаптера).
    return {
      storage,
      projectStorage: storage,
      now: Temporal.Now.instant(),
      deviceId: getLocalIdentity().deviceId,
    };
  }

  function openRestoreDialog(task: Task): void {
    setDialog({ task, situation: null, hierarchyChoice: null, archivedProjectChoice: null });
    void describeRestoreSituation(task.id, restoreDeps()).then((situation) => {
      setDialog((current) =>
        current === null || current.task.id !== task.id ? current : { ...current, situation },
      );
    });
  }

  function closeDialog(): void {
    setDialog(null);
  }

  async function submitRestore(action: 'restore' | 'create_copy'): Promise<void> {
    if (dialog === null) return;
    const result = await restoreTaskCommand(
      {
        id: dialog.task.id,
        action,
        ...(dialog.hierarchyChoice !== null ? { hierarchyChoice: dialog.hierarchyChoice } : {}),
        ...(dialog.archivedProjectChoice !== null
          ? { archivedProjectChoice: dialog.archivedProjectChoice }
          : {}),
        // См. заголовок файла — буквально `false`, биллинга нет нигде в дереве
        // пакетов (тот же честный подход, что `Projects.tsx`).
        hasProEntitlement: false,
      },
      restoreDeps(),
    );
    if (result.status === 'ok') {
      closeDialog();
      const reloaded = await loadTasks();
      setTasks(reloaded);
      return;
    }
    // Любой другой исход (`rejected` — типично гейт 27/28; остальные —
    // `hierarchy_choice_required`/`archived_project_choice_required`/
    // `recurring_next_exists`/`not_recurring`/`not_found`/`not_completed` —
    // недостижимы при корректно построенном диалоге, см. заголовок файла) —
    // один и тот же честный `Toast`, диалог остаётся открытым.
    setErrorMessage(t('completed', 'errors.restoreFailed'));
  }

  const isEmpty = tasks !== null && tasks.length === 0;
  const situation = dialog?.situation ?? null;

  return (
    <div className="shagi-completed">
      <div className="shagi-completed__header">
        {/* Не обёрнут `AppShell` (см. заголовок файла) — собственная кнопка
         * «Назад», тот же жанр, что `Inbox.tsx` уже применяет для своего
         * не-главного экрана. Единственная точка входа этого пакета работ —
         * `Search.tsx`, поэтому «Назад» ведёт именно туда, не на `todayEmpty`. */}
        <IconButton
          icon="close"
          label={t('completed', 'back.label')}
          onClick={() => controller.goTo('search')}
        />
        <h1 className="shagi-completed__title">{t('completed', 'pageTitle')}</h1>
      </div>

      {errorMessage !== null && (
        <Toast
          variant="error"
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
          dismissLabel={t('completed', 'errors.dismiss')}
        />
      )}

      {isEmpty && (
        <EmptyState
          icon={<Icon name="check" size={32} />}
          title={t('completed', 'empty.title')}
          description={t('completed', 'empty.description')}
        />
      )}

      {tasks !== null && tasks.length > 0 && (
        <div className="shagi-completed__list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              checkboxLabel={task.title}
              checked
              disabled
              state="completed"
              onClick={(event) => {
                if (isInteractiveRowClick(event.target)) return;
                openRestoreDialog(task);
              }}
            />
          ))}
        </div>
      )}

      {dialog !== null && (
        <Modal open onClose={closeDialog} title={dialog.task.title}>
          {situation === null && <p>{t('completed', 'dialog.loading')}</p>}

          {situation !== null && situation.status === 'ok' && situation.recurringBlocked && (
            <div>
              <p>{t('completed', 'dialog.recurringBlocked.description')}</p>
              <Button variant="primary" onClick={() => void submitRestore('create_copy')}>
                {t('completed', 'dialog.recurringBlocked.createCopy')}
              </Button>
            </div>
          )}

          {situation !== null && situation.status === 'ok' && !situation.recurringBlocked && (
            <div>
              {situation.deletedParentAutoTopLevel && (
                <p>{t('completed', 'dialog.deletedParentAutoTopLevel')}</p>
              )}
              {situation.deletedProjectAutoInbox && (
                <p>{t('completed', 'dialog.deletedProjectAutoInbox')}</p>
              )}

              {situation.hierarchyChoiceRequired && (
                <div role="group" aria-label={t('completed', 'dialog.hierarchyChoice.groupLabel')}>
                  <p>{t('completed', 'dialog.hierarchyChoice.prompt')}</p>
                  <Filter
                    selected={dialog.hierarchyChoice === 'restore_pair'}
                    onClick={() =>
                      setDialog((current) =>
                        current === null
                          ? current
                          : { ...current, hierarchyChoice: 'restore_pair' },
                      )
                    }
                  >
                    {t('completed', 'dialog.hierarchyChoice.restorePair')}
                  </Filter>
                  <Filter
                    selected={dialog.hierarchyChoice === 'restore_as_separate_task'}
                    onClick={() =>
                      setDialog((current) =>
                        current === null
                          ? current
                          : { ...current, hierarchyChoice: 'restore_as_separate_task' },
                      )
                    }
                  >
                    {t('completed', 'dialog.hierarchyChoice.separateTask')}
                  </Filter>
                </div>
              )}

              {situation.archivedProjectChoiceRequired && (
                <div
                  role="group"
                  aria-label={t('completed', 'dialog.archivedProjectChoice.groupLabel')}
                >
                  <p>{t('completed', 'dialog.archivedProjectChoice.prompt')}</p>
                  <Filter
                    selected={dialog.archivedProjectChoice === 'restore_project'}
                    onClick={() =>
                      setDialog((current) =>
                        current === null
                          ? current
                          : { ...current, archivedProjectChoice: 'restore_project' },
                      )
                    }
                  >
                    {t('completed', 'dialog.archivedProjectChoice.restoreProject')}
                  </Filter>
                  <Filter
                    selected={dialog.archivedProjectChoice === 'restore_to_inbox'}
                    onClick={() =>
                      setDialog((current) =>
                        current === null
                          ? current
                          : { ...current, archivedProjectChoice: 'restore_to_inbox' },
                      )
                    }
                  >
                    {t('completed', 'dialog.archivedProjectChoice.restoreToInbox')}
                  </Filter>
                </div>
              )}

              <Button
                variant="primary"
                disabled={!isReadyToRestore(dialog)}
                onClick={() => void submitRestore('restore')}
              >
                {t('completed', 'dialog.restore')}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
