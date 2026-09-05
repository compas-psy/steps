/**
 * `QuickAdd` — оверлей Contextual Quick Add, M20 Empty / M21 NLP Parsed /
 * M22 NLP Ambiguous / M23 Expanded (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`,
 * `01_PRODUCT_BEHAVIOR_R1.md` §3/§4), пакет работ E05.2. Собирает готовые
 * presentational-кирпичи `@shagi/ui/capture` (E03.7) вокруг детерминированного
 * `parseQuickAdd` (`@shagi/nlp`, E05.1) и командного слоя `@shagi/core`
 * (`createTaskCommand`/`createLabelCommand`/`attachLabelToTaskCommand`) —
 * этот файл НЕ парсит текст сам и не рисует новые примитивы, только решает,
 * что показать по результату разбора и что отправить в команду.
 *
 * НЕ отдельный `ScreenId` — оверлей поверх текущего экрана, см.
 * `state/store.ts` (блок про `quickAdd`) и `App.tsx` (рендер условно на
 * `quickAdd !== null`, рядом с `<Screens>`, не вместо них).
 *
 * --- 1. Origin → Inherited values (`01§3`) — в объёме этого пакета работ --
 *
 * Три строки таблицы из семи (см. `state/store.ts`, `QuickAddOrigin`):
 * `'today'` → `plannedDate=today, captureState='processed'`; `'inbox'`/
 * `'global'` → `captureState='inbox'`, без унаследованной даты.
 * `captureState` — ФИКСИРОВАН строкой таблицы, не пересчитывается из того,
 * что в итоге распознал парсер: "Explicit NLP/manual value always wins" в
 * `01§4` — про то, что явное значение ПОЛЯ (даты/времени/…) побеждает
 * унаследованное, а не про то, что сам факт наличия распознанной даты
 * должен "продвигать" Inbox-задачу в processed. `Inbox`/`Global` из
 * таблицы буквально говорят "inbox, no date" без всяких условий — контекст
 * происхождения задачи (голый захват без места) не меняется тем, что
 * пользователь СЕЙЧАС попутно упомянул дату в тексте.
 *
 * --- 2. Унаследованный контекст vs `ChipOrigin` парсера ---------------------
 *
 * `parseQuickAdd`'s `inherited.date` влияет на чипы ТОЛЬКО через правило
 * "Time-only без даты" (`internal/assemble.ts withSynthesizedDateChip`) —
 * если в тексте нет ни явной даты, ни явного времени, унаследованная дата
 * НИКАК не появляется в `result.chips` сама по себе. Поэтому "чип Сегодня"
 * origin=today — это чип ЭКРАНА (`InheritedContextChip`, пунктирная рамка),
 * не чип парсера: показывается всегда, пока `parsed.chips` не содержит
 * СВОЙ chip категории `date`/`weekday` (в этом случае он и есть ответ на
 * вопрос "какая дата" — неважно, explicit это набранное слово или implicit/
 * inherited синтез парсера по правилу Time-only, см. `findDateChip`
 * ниже) и пока пользователь сам не убрал экранный чип (`TODAY_BADGE_KEY`).
 * Убранный экранный чип НЕ возвращает `captureState` в `inbox` — задача
 * остаётся `processed`/undated (`01§3`, дословно).
 *
 * --- 3. Разрешение project/label-чипов -------------------------------------
 *
 * Label — find-or-create: `storage.labels.findByNormalizedName` (точное
 * совпадение по `normalizeLabelName`, `@shagi/core`), не найдено →
 * `createLabelCommand` перед `attachLabelToTaskCommand` (M33). Лимита меток
 * на аккаунт нигде не заявлено — авто-создание безопасно (см. задание).
 * Project — ТОЛЬКО find (`storage.projects.listActive()`, сравнение через
 * `normalizeLabelName` — та же нормализация НФКЦ+lowercase уместна для
 * любого пользовательского имени, не только меток, отдельной
 * `normalizeProjectName` в дереве пакетов нет и заводить её здесь — не
 * территория): не найдено → чип остаётся с честной пометкой "не найден"
 * (`chips.projectNotFound`), `projectId` не выставляется — создание проекта
 * требует доп. полей и упирается в paywall (правило 27/28), плодить второй
 * урезанный путь создания проекта из текстового чипа не нужно (задание).
 *
 * --- 4. Recurrence-чип — теперь реально создаёт повтор (эпик E11.2) --------
 *
 * Движок повторов (`@shagi/core`, эпик E11.1) уже есть — recurrence-чип
 * больше не `disabled`: при наличии активного чипа `recurrence` на момент
 * сабмита вызывается `createRecurringTaskCommand` вместо `createTaskCommand`
 * (см. `handleSubmit` ниже), его `span` теперь ВХОДИТ в набор "чипов на
 * вычистку из заголовка" (`spansToStrip`) — тот же путь, что остальные
 * категории чипов, признак того, что чип реально что-то создаёт, а не
 * просто отображается.
 *
 * `rule` — `chip.value` (`RecurrenceChipValue`, `@shagi/nlp`) передаётся В
 * `createRecurringTaskCommand` БЕЗ каста: `RecurrenceChipValue` (`unit:'day'
 * |'week'|'month'`) структурно — уже пройденный подтип `RecurrenceRuleTemplate`
 * (`@shagi/core`, `temporal/recurrence-anchor.ts`, её же заголовок это прямо
 * документирует — "не выдумывай вторую форму", CLAUDE.md).
 *
 * `anchorType: 'scheduled'` — фиксированное умолчание этого пакета работ:
 * грамматика NLP (`01§4`) не выражает выбор scheduled/completion, а формы,
 * которые она РЕАЛЬНО распознаёт ("каждый понедельник"/"каждое 5 число") по
 * буквальному смыслу — привязка к календарным СЛОТАМ, не к дате завершения
 * задачи. Полноценный выбор anchorType в UI (M30 Advanced) — отдельный,
 * ещё не начатый пакет работ (см. задание).
 *
 * `chipLabel` для категории `recurrence` (ниже) больше не показывает
 * "появится позже" — строит человекочитаемую формулировку правила
 * (`recurrenceChipLabel`) тем же приёмом, что `TaskDetail.tsx`
 * `recurrenceRuleLabel` (её же заголовок разбирает решения по формулировкам
 * подробно) — узкое дублирование между двумя экранами, не общий модуль вне
 * разрешённой территории этого пакета работ, тот же принцип, что уже
 * применён для `DatePicker`-хелперов этого файла (см. блок ниже).
 *
 * --- 5. Rejected-чип — восстановление исходного текста ----------------------
 *
 * Модель состояния: `rawText` — сырой текст поля ввода, единственный
 * источник истины, разбор (`parseQuickAdd`) пересчитывается заново на
 * КАЖДОЕ его изменение (`useMemo` по `rawText`/`now`/`inherited`). Решения
 * accept/reject живут ОТДЕЛЬНО, поверх свежего результата — `removedKeys:
 * Set<string>`, ключ чипа = `category:span.start:span.end` (у чипов без
 * `span`, т.е. `origin !== 'explicit'`, — синтетический ключ `category:implied`,
 * у экранного today-badge — свой отдельный ключ). НЕ мутирует `title.text`
 * вручную и НЕ перевызывает `parseQuickAdd` на изменённой строке (та могла
 * бы больше не совпасть с оригиналом, если поле уже отредактировано) —
 * вместо этого `buildDisplayTitle` (ниже) splice'ит `rawText` по спанам
 * ЕЩЁ активных (не снятых пользователем, кроме recurrence) чипов и
 * схлопывает пробелы — ТОТ ЖЕ алгоритм, что `internal/assemble.ts
 * buildTitle` внутри `@shagi/nlp` (splice возрастающих спанов +
 * `replace(/\s+/g,' ')` + `normalizeTitleWhitespace`), не импортированный
 * оттуда (`internal/` не публичный API пакета) — узкое переиспользование
 * общего маленького алгоритма "вычистить диапазоны и схлопнуть пробелы", не
 * разбора/грамматики. Когда `removedKeys` пуст, результат совпадает с
 * `parsed.title.text` буквально (тот же набор спанов, тот же алгоритм).
 * Чипы без `span` (`origin!=='explicit'`) снять-с-восстановлением нельзя —
 * снятие просто исключает их значение из финального патча команды.
 *
 * --- 6. Draft safety (`01§3`) -----------------------------------------------
 *
 * Один ключ `localStorage` на устройство (`DRAFT_STORAGE_KEY`) — черновик
 * НЕ идёт через `@shagi/storage`/sync ("never syncs across devices").
 * Сохраняется на каждое непустое изменение `rawText`, стирается когда поле
 * становится пустым ИЛИ после успешного создания задачи. Escape (закрытие
 * оверлея, `controller.closeQuickAdd()`) НЕ трогает черновик — контроллер
 * ничего о нём не знает (см. `store.ts`). При монтировании (не в эффекте, а
 * в инициализаторе `useState` — важно успеть до первого рендера, чтобы не
 * мигнуть пустым полем перед подсказкой) читается сохранённый черновик:
 * если он непустой — показывается ОДИН РАЗ подсказка «Продолжить/Удалить»
 * вместо самого поля, не подставляется молча. Компонент перемонтируется
 * при каждом открытии оверлея (родитель рендерит его условно, `App.tsx`),
 * поэтому "один раз за открытие" получается естественно, без отдельного
 * "уже показывали" флага.
 *
 * --- 7. Локальная идентичность (ownerScope/deviceId) ------------------------
 *
 * Тот же узкий компромисс, что уже дважды в дереве пакетов (`FirstTask.tsx`,
 * `Today.tsx`/`Inbox.tsx` — см. их заголовки): персистентного порта
 * идентичности профиля/устройства ещё нет, поэтому — закэшированная на
 * время жизни модуля пара `ownerScope`/`deviceId` через `generateUuidV7`/
 * `generateDeviceId` (`@shagi/core`). Дублирование этого узкого куска (а не
 * импорт приватной функции `FirstTask.tsx`) — то же сознательное решение,
 * что уже задокументировано там.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import {
  BottomSheet,
  Button,
  DraftIndicator,
  InheritedContextChip,
  ParsingPreview,
  QuickAdd as QuickAddInput,
  type ParsingPreviewToken,
} from '@shagi/ui';
import { normalizeLabelName, type NewRank, type Project } from '@shagi/core';
import type {
  AnyAcceptedChip,
  InheritedContext,
  NowContext,
  ParseQuickAddResult,
} from '@shagi/nlp';

import { useAppController, useAppState, useStorage } from '../state/context.js';
import { getLocalIdentity } from '../state/local-identity.js';
import {
  chipKey,
  composerNow,
  displayTitleForChips,
  findDateChip,
  parseComposerText,
  submitComposerTask,
} from '../state/create-task-from-text.js';
import { chipLabel } from './chip-label.js';
import './QuickAdd.css';

const DRAFT_STORAGE_KEY = 'shagi:quickAdd:draft';

// --- Draft safety (см. заголовок файла, п.6) --------------------------------
// `localStorage` может бросить (приватный режим/заблокированное хранилище) —
// защитно обёрнуто, черновик — удобство, не критичная функциональность.

function readDraft(): string | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === 'string' && parsed.text.length > 0 ? parsed.text : null;
  } catch {
    return null;
  }
}

function saveDraft(text: string): void {
  try {
    if (text.length === 0) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ text }));
  } catch {
    // Черновик — удобство, не критичная функциональность (см. заголовок).
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // См. `saveDraft`.
  }
}

const TODAY_BADGE_KEY = 'todayBadge:implied';

export function QuickAdd(): ReactElement | null {
  const { quickAdd } = useAppState();
  const controller = useAppController();
  const storage = useStorage();

  // См. заголовок файла, п.6 — читается ДО первого рендера, не в эффекте.
  const [pendingDraftText] = useState<string | null>(() => readDraft());
  const [draftResolved, setDraftResolved] = useState(pendingDraftText === null);
  const [rawText, setRawText] = useState('');
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(new Set());
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const origin = quickAdd?.origin ?? null;

  useEffect(() => {
    let cancelled = false;
    void storage.projects.listActive().then((result) => {
      if (!cancelled) setProjects(result);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // `now`/`inherited` — зафиксированы на момент открытия оверлея (`01§4`:
  // Composer получает `now` один раз при открытии), не пересчитываются на
  // каждое изменение текста — тот же приём, что `NlpOnboarding.tsx`.
  const now: NowContext = useMemo(() => composerNow(), []);
  const inherited: InheritedContext | undefined = useMemo(
    () => (origin === 'today' ? { date: now.date } : undefined),
    [origin, now.date],
  );

  const parsed: ParseQuickAddResult = useMemo(
    () =>
      parseComposerText({ text: rawText, now, ...(inherited !== undefined ? { inherited } : {}) }),
    [rawText, now, inherited],
  );

  const activeChips = parsed.chips.filter((chip) => !removedKeys.has(chipKey(chip)));
  const dateChip = findDateChip(activeChips);
  const showTodayBadge =
    origin === 'today' && dateChip === undefined && !removedKeys.has(TODAY_BADGE_KEY);

  // `recurrence` больше не исключён (эпик E11.2, см. заголовок файла, п.4) —
  // теперь реально создаёт повтор, его текст вычищается из заголовка тем же
  // путём, что остальные категории.
  const displayTitle = displayTitleForChips(rawText, activeChips);

  function handleChangeText(value: string): void {
    setRawText(value);
    saveDraft(value);
  }

  function handleRemoveChip(chip: AnyAcceptedChip): void {
    setRemovedKeys((prev) => new Set(prev).add(chipKey(chip)));
  }

  function handleRemoveTodayBadge(): void {
    setRemovedKeys((prev) => new Set(prev).add(TODAY_BADGE_KEY));
  }

  function handleContinueDraft(): void {
    const text = pendingDraftText ?? '';
    setRawText(text);
    setDraftResolved(true);
  }

  function handleDiscardDraft(): void {
    clearDraft();
    setDraftResolved(true);
  }

  function handleClose(): void {
    // Черновик НЕ трогается — Escape/закрытие сохраняет его (см. заголовок,
    // п.6); `closeQuickAdd` — чисто навигация (`store.ts`).
    controller.closeQuickAdd();
  }

  async function handleSubmit(): Promise<void> {
    if (origin === null || rawText.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const identity = getLocalIdentity();
      const captureState = origin === 'today' ? 'processed' : 'inbox';

      const rankQueue = await storage.tasks.listByCaptureStateAndStatus(captureState, 'active');
      const lastTask = rankQueue.at(-1);
      const rank: NewRank =
        lastTask === undefined
          ? { placement: 'empty-list' }
          : { placement: 'end', lastRank: lastTask.rank };

      // Сборка команды из чипов живёт в `../state/create-task-from-text.js` —
      // общем модуле всех точек входа (см. его заголовок за разбором того,
      // почему у экранов больше нет своих версий этой логики).
      const result = await submitComposerTask(
        rawText,
        activeChips,
        {
          captureState,
          rank,
          projects,
          // `01§3`, таблица «Origin → Inherited values»: с Today задача
          // заводится НА СЕГОДНЯ, если в самой фразе даты нет; человек мог
          // снять и этот подразумеваемый бейдж.
          fallbackDate: showTodayBadge ? now.date : null,
        },
        {
          storage,
          now: Temporal.Now.instant(),
          deviceId: identity.deviceId,
          ownerScope: identity.ownerScope,
        },
      );

      if (result.status !== 'ok') {
        setSubmitError(t('quickAdd', 'errors.submitFailed'));
        setSubmitting(false);
        return;
      }

      clearDraft();
      setRawText('');
      setRemovedKeys(new Set());
      setSubmitting(false);
      controller.closeQuickAdd();
    } catch (error) {
      // Найдено разбором провала Android-смоука: бесследно проглоченная
      // ошибка здесь однажды спрятала настоящий дефект (`jsonToSql` падал
      // на `bigint` в `patchJson` серии повтора — `@shagi/storage`) за
      // одинаковым «Не удалось создать задачу» для любой причины. Здесь —
      // не заголовок/описание задачи (SPEC/05 §6): каждый throw этой цепочки
      // — либо фиксированная строка, либо инфраструктурное сообщение
      // драйвера/IPC, которое подставляет только ШАБЛОН SQL.
      // eslint-disable-next-line no-console -- диагностика инфраструктурного сбоя команды, не пользовательский контент (см. комментарий выше)
      console.error('QuickAdd.handleSubmit', error instanceof Error ? error.message : error);
      setSubmitError(t('quickAdd', 'errors.submitFailed'));
      setSubmitting(false);
    }
  }

  if (quickAdd === null || origin === null) return null;

  const showDraftPrompt = !draftResolved && pendingDraftText !== null;

  // Recurrence — больше не отдельный путь (эпик E11.2, см. заголовок файла,
  // п.4): рендерится через обычный `ParsingPreview.tokens`, как любая другая
  // категория — снимаемый (`removable`), реально влияющий на создание.
  const tokens: ParsingPreviewToken[] = activeChips.map((chip, index) => {
    const resolvedProject =
      chip.category === 'project'
        ? (projects.find(
            (p) => normalizeLabelName(p.title) === normalizeLabelName(chip.value.name),
          ) ?? null)
        : null;
    const removeLabel = t('quickAdd', 'chips.removeLabel', {
      text: chip.span?.text ?? String(chipLabel(chip, resolvedProject)),
    });
    return {
      id: `${chip.category}-${index}`,
      kind: chip.category,
      label: chipLabel(chip, resolvedProject),
      removable: true,
      removeLabel,
      onRemove: () => handleRemoveChip(chip),
    };
  });

  return (
    <BottomSheet open onClose={handleClose} title={t('quickAdd', 'overlay.title')}>
      {showDraftPrompt ? (
        <div className="shagi-quick-add-overlay__body">
          <p>{t('quickAdd', 'draftPrompt.message')}</p>
          <Button variant="primary" onClick={handleContinueDraft}>
            {t('quickAdd', 'draftPrompt.continue')}
          </Button>
          <Button variant="secondary" onClick={handleDiscardDraft}>
            {t('quickAdd', 'draftPrompt.discard')}
          </Button>
        </div>
      ) : (
        <div className="shagi-quick-add-overlay__body">
          {rawText.trim().length > 0 && (
            <DraftIndicator label={t('quickAdd', 'draft.indicatorLabel')} />
          )}
          <QuickAddInput
            value={rawText}
            onChange={handleChangeText}
            onSubmit={() => void handleSubmit()}
            label={t('quickAdd', 'input.label')}
            submitLabel={t('quickAdd', 'input.submitLabel')}
            placeholder={t('quickAdd', 'input.placeholder')}
            icon="add"
            loading={submitting}
            error={submitError !== null}
            {...(submitError !== null ? { errorMessage: submitError } : {})}
            autoFocus
          />
          {showTodayBadge && (
            <InheritedContextChip
              icon="calendar"
              removable
              removeLabel={t('quickAdd', 'chips.todayRemoveLabel')}
              onRemove={handleRemoveTodayBadge}
            >
              {t('quickAdd', 'chips.today')}
            </InheritedContextChip>
          )}
          <ParsingPreview
            title={displayTitle}
            tokens={tokens}
            label={t('quickAdd', 'preview.label')}
            emptyState={
              rawText.trim().length === 0 ? <p>{t('quickAdd', 'preview.empty')}</p> : undefined
            }
          />
          {parsed.rejected.length > 0 && (
            <ul aria-label={t('quickAdd', 'rejected.label')}>
              {parsed.rejected.map((rejected) => (
                <li key={`${rejected.category}-${rejected.span.start}`}>
                  {t('quickAdd', 'rejected.item', { text: rejected.span.text })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
