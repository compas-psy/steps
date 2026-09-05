/**
 * `FirstTask` — M04 (`12_SCREEN_STATE_MATRIX.md`): «creates real processed
 * Today task». `01_PRODUCT_BEHAVIOR_R1.md`: «onboarding First Task →
 * processed + today» — единственный экран каркаса E04, который реально
 * проходит через доменный командный слой (`createTaskCommand`,
 * `@shagi/core`), а не только через навигацию.
 *
 * --- Разбор введённой фразы ------------------------------------------------
 *
 * Этот экран ОБЯЗАН разбирать текст так же, как Quick Add, и по одной
 * причине: маршрут свежей установки — `Launch → welcome → firstTask`, то
 * есть первая фраза, которую печатает только что установивший человек,
 * попадает именно сюда. Раньше здесь стоял `title: trimmed` и жёстко
 * сегодняшняя дата — «9 сентября в 11:00 Сходить с мамой в МВД» целиком
 * становилось названием, хотя `parseQuickAdd` на той же строке возвращал
 * верные название/дату/время. Разбор и создание живут в общем модуле
 * `../state/create-task-from-text.js` — см. его заголовок.
 *
 * --- Композиция: `Input`+`Button`, не компактный `QuickAdd` -----------------
 *
 * Макет (`docs/spec/DESIGN/source_unpacked/ШАГИ - R1 Design.dc.html`,
 * `[R1][M][04] First task`) показывает поле ввода и отдельную полноширинную
 * кнопку «Сохранить», прижатую к низу экрана, с подписью под ней — не
 * компактную строку «поле + иконка-кнопка», которую даёт `@shagi/ui`'s
 * `QuickAdd` (её собственный заголовок прямо называет её назначение: «V01
 * Global Quick Add — D12», компактный паттерн для оверлея, а не онбординга).
 * Экран собран из `Input`+`Button` напрямую — тот же уровень примитивов,
 * что `QuickAdd` использует внутри себя, просто в другой раскладке; Enter
 * по-прежнему отправляет форму нативно (`<form onSubmit>`), тот же приём,
 * что и в `QuickAdd.tsx` (`@shagi/ui`, комментарий у её `<form>`).
 */
import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import { Button, Input, ParsingPreview, type ParsingPreviewToken } from '@shagi/ui';

import { useAppController, useStorage } from '../state/context.js';
import { getLocalIdentity } from '../state/local-identity.js';
import {
  composerNow,
  displayTitleForChips,
  parseComposerText,
  submitComposerTask,
} from '../state/create-task-from-text.js';
import { chipLabel } from './chip-label.js';
import './FirstTask.css';

export function FirstTask(): ReactElement {
  const controller = useAppController();
  const storage = useStorage();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  // Снимок часов фиксируется на монтирование экрана, а не пересчитывается на
  // каждое нажатие клавиши: иначе «сегодня» могло бы смениться посреди
  // набора фразы, и превью разошлось бы с тем, что реально сохранится.
  const now = useMemo(() => composerNow(), []);
  const parsed = useMemo(() => parseComposerText({ text, now }), [text, now]);

  const previewTitle = displayTitleForChips(text, parsed.chips);
  const tokens: ParsingPreviewToken[] = parsed.chips.map((chip, index) => ({
    id: `${chip.category}-${index}`,
    kind: chip.category,
    label: chipLabel(chip, null),
  }));

  async function handleSubmit(): Promise<void> {
    if (text.trim().length === 0 || submitting) return;

    setSubmitting(true);
    setError(false);

    const { ownerScope, deviceId } = getLocalIdentity();
    // `StoragePort` (`@shagi/storage`, что реально отдаёт `useStorage()`) —
    // структурный супертип `CommandStoragePort`, которого просит команда
    // (ADR-0003 в `packages/core/src/commands/storage-port.ts`).
    const result = await submitComposerTask(
      text,
      parsed.chips,
      {
        // `01§2`/`01§3`: онбординг First Task — сразу `processed` + сегодня,
        // это не голый Inbox-захват без контекста. Сегодняшняя дата теперь
        // ЗАПАСНАЯ: явно названную в фразе дату она не перебивает.
        captureState: 'processed',
        fallbackDate: now.date,
        // Первая задача первого локального профиля — список Today пуст по
        // определению (`rank-input.ts`).
        rank: { placement: 'empty-list' },
      },
      { storage, now: Temporal.Now.instant(), deviceId, ownerScope },
    );

    setSubmitting(false);

    if (result.status !== 'ok') {
      setError(true);
      return;
    }

    controller.goTo('nlpOnboarding');
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void handleSubmit();
  }

  return (
    <form className="shagi-first-task" onSubmit={handleFormSubmit}>
      <h1 className="shagi-first-task__heading">{t('onboarding', 'firstTask.title')}</h1>
      <p className="shagi-first-task__description">{t('onboarding', 'firstTask.description')}</p>

      <Input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(false);
        }}
        aria-label={t('onboarding', 'firstTask.inputLabel')}
        placeholder={t('onboarding', 'firstTask.placeholder')}
        disabled={submitting}
        error={error}
        {...(error ? { errorMessage: t('onboarding', 'firstTask.error') } : {})}
        autoFocus
      />

      {/* Владелец продукта: «дата и время должны быть показаны chips до
       * создания» — человек обязан увидеть, ЧТО именно поймёт продукт, до
       * того как нажмёт «Добавить», а не обнаружить это в списке задач. */}
      <ParsingPreview
        title={previewTitle}
        tokens={tokens}
        label={t('onboarding', 'firstTask.previewLabel')}
        emptyState={<p>{t('onboarding', 'firstTask.previewEmpty')}</p>}
      />

      <div className="shagi-first-task__footer">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={submitting}
          disabled={text.trim().length === 0}
        >
          {t('onboarding', 'firstTask.submitLabel')}
        </Button>
        <p className="shagi-first-task__footnote">{t('onboarding', 'firstTask.footnote')}</p>
      </div>
    </form>
  );
}
