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
 * --- 4. Recurrence-чип — честный вырез (нет command-слоя, эпик E11) --------
 *
 * `createTaskCommand` не принимает recurrence — нет ни одной команды
 * "создать повторяющуюся задачу" в дереве пакетов. Recurrence-чип рендерится
 * через `NLPToken` c `disabled` и пометкой `chips.recurrenceComingSoon`, его
 * `span` НИКОГДА не входит в набор "чипов на вычистку из заголовка"
 * (`spansToStrip` ниже) — функционально это тот же путь, что и
 * explicit-отклонённый кандидат: текст остаётся в заголовке, задача не
 * теряет то, что пользователь написал, без эффекта и без объяснения молча.
 * Тот же тон, что "Planning-заглушка" в `TaskDetail.tsx` до E08.2 (см. его
 * заголовок) — честно "появится в одном из следующих обновлений", не
 * притворяется рабочим полем.
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
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { formatDate, formatTime, t } from '@shagi/i18n';
import {
  Button,
  DraftIndicator,
  InheritedContextChip,
  Modal,
  NLPToken,
  ParsingPreview,
  QuickAdd as QuickAddInput,
  type ParsingPreviewToken,
} from '@shagi/ui';
import {
  attachLabelToTaskCommand,
  createLabelCommand,
  createTaskCommand,
  generateDeviceId,
  generateUuidV7,
  normalizeLabelName,
  type CreateTaskInput,
  type NewRank,
  type Project,
  type Uuid,
} from '@shagi/core';
import {
  parseQuickAdd,
  type AnyAcceptedChip,
  type ChipCategory,
  type InheritedContext,
  type NowContext,
  type ParseQuickAddResult,
  type SourceSpan,
} from '@shagi/nlp';

import { useAppController, useAppState, useStorage } from '../state/context.js';

const DRAFT_STORAGE_KEY = 'shagi:quickAdd:draft';

// --- Локальная идентичность устройства (см. заголовок файла, п.7) -----------

interface LocalIdentity {
  readonly ownerScope: Uuid;
  readonly deviceId: Uuid;
}

let cachedLocalIdentity: LocalIdentity | null = null;

function getLocalIdentity(): LocalIdentity {
  cachedLocalIdentity ??= { ownerScope: generateUuidV7(), deviceId: generateDeviceId() };
  return cachedLocalIdentity;
}

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

// --- Ключ чипа для слоя accept/reject-решений (см. заголовок, п.5) ---------

function chipKey(chip: AnyAcceptedChip): string {
  return chip.span !== null
    ? `${chip.category}:${chip.span.start}:${chip.span.end}`
    : `${chip.category}:implied`;
}

const TODAY_BADGE_KEY = 'todayBadge:implied';

/** Тот же алгоритм, что `internal/assemble.ts buildTitle` в `@shagi/nlp` —
 * см. заголовок файла, п.5, за полным обоснованием переиспользования. */
function buildDisplayTitle(rawText: string, spans: readonly SourceSpan[]): string {
  const sorted = [...spans].toSorted((a, b) => a.start - b.start);
  let result = '';
  let cursor = 0;
  for (const span of sorted) {
    result += rawText.slice(cursor, span.start);
    cursor = span.end;
  }
  result += rawText.slice(cursor);
  return result.replace(/\s+/g, ' ').trim();
}

/** Найденный чип даты (`date` ИЛИ `weekday` — обе категории несут
 * `DateChipValue`, `01§4`: только одна дата у задачи). */
function findDateChip(chips: readonly AnyAcceptedChip[]): AnyAcceptedChip | undefined {
  return chips.find((c) => c.category === 'date' || c.category === 'weekday');
}

function findChip<C extends ChipCategory>(
  chips: readonly AnyAcceptedChip[],
  category: C,
): Extract<AnyAcceptedChip, { category: C }> | undefined {
  return chips.find((c) => c.category === category) as
    Extract<AnyAcceptedChip, { category: C }> | undefined;
}

/** `switch` без `default` по `chip.category` — умышленно (тот же приём, что
 * `NlpOnboarding.tsx chipLabel`): если категория когда-нибудь вырастет, это
 * перестанет компилироваться, а не молча покажет пустой чип. */
function chipLabel(chip: AnyAcceptedChip, resolvedProject: Project | null): ReactNode {
  switch (chip.category) {
    case 'date':
    case 'weekday':
      return formatDate(chip.value.date, { weekday: 'short' });
    case 'time':
      return formatTime(chip.value.time);
    case 'deadline':
      return chip.value.time === null
        ? t('quickAdd', 'chips.deadlineDateOnly', {
            date: formatDate(chip.value.date, { weekday: 'short' }),
          })
        : t('quickAdd', 'chips.deadlineWithTime', {
            date: formatDate(chip.value.date, { weekday: 'short' }),
            time: formatTime(chip.value.time),
          });
    case 'duration':
      return t('quickAdd', 'chips.durationMinutes', { minutes: chip.value.minutes });
    case 'recurrence':
      return t('quickAdd', 'chips.recurrenceComingSoon');
    case 'project':
      return resolvedProject !== null
        ? resolvedProject.title
        : t('quickAdd', 'chips.projectNotFound', { name: chip.value.name });
    case 'label':
      return chip.value.name;
    case 'priority':
      switch (chip.value.priority) {
        case 1:
          return t('quickAdd', 'chips.priorityP1');
        case 2:
          return t('quickAdd', 'chips.priorityP2');
        case 3:
          return t('quickAdd', 'chips.priorityP3');
        case 4:
          return t('quickAdd', 'chips.priorityP4');
      }
  }
}

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
  const now: NowContext = useMemo(
    () => ({
      date: Temporal.Now.plainDateISO(),
      time: Temporal.Now.plainTimeISO(),
      timeZone: Temporal.Now.timeZoneId(),
    }),
    [],
  );
  const inherited: InheritedContext | undefined = useMemo(
    () => (origin === 'today' ? { date: now.date } : undefined),
    [origin, now.date],
  );

  const parsed: ParseQuickAddResult = useMemo(
    () => parseQuickAdd({ text: rawText, now, ...(inherited !== undefined ? { inherited } : {}) }),
    [rawText, now, inherited],
  );

  const activeChips = parsed.chips.filter((chip) => !removedKeys.has(chipKey(chip)));
  const dateChip = findDateChip(activeChips);
  const showTodayBadge =
    origin === 'today' && dateChip === undefined && !removedKeys.has(TODAY_BADGE_KEY);

  const spansToStrip: SourceSpan[] = activeChips
    .filter((chip) => chip.category !== 'recurrence' && chip.span !== null)
    .map((chip) => chip.span as SourceSpan);
  const displayTitle = buildDisplayTitle(rawText, spansToStrip);

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
      const deps = { storage, now: Temporal.Now.instant(), deviceId: identity.deviceId };

      // --- Проект: только find (см. заголовок, п.3) ------------------------
      const projectChip = findChip(activeChips, 'project');
      const resolvedProject =
        projectChip !== undefined
          ? (projects.find(
              (p) => normalizeLabelName(p.title) === normalizeLabelName(projectChip.value.name),
            ) ?? null)
          : null;

      // --- Метки: find-or-create (см. заголовок, п.3) -----------------------
      const labelChips = activeChips.filter((c) => c.category === 'label');
      const labelIds: Uuid[] = [];
      for (const labelChip of labelChips) {
        const name = labelChip.category === 'label' ? labelChip.value.name : '';
        const normalized = normalizeLabelName(name);
        const found = await storage.labels.findByNormalizedName(normalized);
        if (found !== null) {
          labelIds.push(found.id);
          continue;
        }
        const existingLabels = await storage.labels.listAll();
        const lastLabel = existingLabels.at(-1);
        const rank: NewRank =
          lastLabel === undefined
            ? { placement: 'empty-list' }
            : { placement: 'end', lastRank: lastLabel.rank };
        const createdLabel = await createLabelCommand(
          { displayName: name, colorToken: null, rank },
          deps,
        );
        if (createdLabel.status !== 'ok') {
          throw new Error('label creation rejected');
        }
        labelIds.push(createdLabel.label.id);
      }

      // --- Значения из чипов -------------------------------------------------
      const priorityChip = findChip(activeChips, 'priority');
      const timeChip = findChip(activeChips, 'time');
      const durationChip = findChip(activeChips, 'duration');
      const deadlineChip = findChip(activeChips, 'deadline');

      const plannedDate =
        dateChip !== undefined
          ? (dateChip.value as { date: Temporal.PlainDate }).date
          : showTodayBadge
            ? now.date
            : null;

      const captureState = origin === 'today' ? 'processed' : 'inbox';

      const rankQueue = await storage.tasks.listByCaptureStateAndStatus(captureState, 'active');
      const lastTask = rankQueue.at(-1);
      const rank: CreateTaskInput['rank'] =
        lastTask === undefined
          ? { placement: 'empty-list' }
          : { placement: 'end', lastRank: lastTask.rank };

      const input: CreateTaskInput = {
        ownerScope: identity.ownerScope,
        title: displayTitle,
        captureState,
        source: 'user',
        sourceChannel: 'text',
        rank,
        ...(priorityChip !== undefined ? { priority: priorityChip.value.priority } : {}),
        ...(plannedDate !== null ? { plannedDate } : {}),
        ...(timeChip !== undefined ? { plannedTime: timeChip.value.time } : {}),
        ...(durationChip !== undefined ? { durationMin: durationChip.value.minutes } : {}),
        ...(deadlineChip !== undefined
          ? { deadlineDate: deadlineChip.value.date, deadlineTime: deadlineChip.value.time }
          : {}),
        ...(resolvedProject !== null
          ? { projectId: resolvedProject.id, originalProjectNameSnapshot: resolvedProject.title }
          : {}),
      };

      const created = await createTaskCommand(input, deps);
      if (created.status !== 'ok') {
        setSubmitError(t('quickAdd', 'errors.submitFailed'));
        setSubmitting(false);
        return;
      }

      for (const labelId of labelIds) {
        await attachLabelToTaskCommand(
          { taskId: created.task.id, labelId },
          { storage, taskStorage: storage, now: deps.now, deviceId: identity.deviceId },
        );
      }

      clearDraft();
      setRawText('');
      setRemovedKeys(new Set());
      setSubmitting(false);
      controller.closeQuickAdd();
    } catch {
      setSubmitError(t('quickAdd', 'errors.submitFailed'));
      setSubmitting(false);
    }
  }

  if (quickAdd === null || origin === null) return null;

  const showDraftPrompt = !draftResolved && pendingDraftText !== null;

  // Recurrence — честный вырез (см. заголовок файла, п.4): рендерится
  // ОТДЕЛЬНО от `ParsingPreview.tokens` через `NLPToken` напрямую — форма
  // `ParsingPreviewToken` не несёт `disabled` (только `removable`), а
  // recurrence обязан быть недоступным для взаимодействия, не просто
  // "ещё одним removable-чипом".
  const recurrenceChips = activeChips.filter((chip) => chip.category === 'recurrence');
  const previewChips = activeChips.filter((chip) => chip.category !== 'recurrence');

  const tokens: ParsingPreviewToken[] = previewChips.map((chip, index) => {
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
    <Modal open onClose={handleClose} title={t('quickAdd', 'overlay.title')}>
      {showDraftPrompt ? (
        <div>
          <p>{t('quickAdd', 'draftPrompt.message')}</p>
          <Button variant="primary" onClick={handleContinueDraft}>
            {t('quickAdd', 'draftPrompt.continue')}
          </Button>
          <Button variant="secondary" onClick={handleDiscardDraft}>
            {t('quickAdd', 'draftPrompt.discard')}
          </Button>
        </div>
      ) : (
        <>
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
          {recurrenceChips.map((chip, index) => (
            <NLPToken key={`recurrence-${index}`} kind="recurrence" disabled>
              {chipLabel(chip, null)}
            </NLPToken>
          ))}
          {parsed.rejected.length > 0 && (
            <ul aria-label={t('quickAdd', 'rejected.label')}>
              {parsed.rejected.map((rejected) => (
                <li key={`${rejected.category}-${rejected.span.start}`}>
                  {t('quickAdd', 'rejected.item', { text: rejected.span.text })}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
