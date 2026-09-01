/**
 * `NlpOnboarding` — M05 (`12_SCREEN_STATE_MATRIX.md`): «demonstrates local
 * Russian natural input, not AI marketing». Никакого «ИИ»/«AI»/«умный» ни в
 * коде, ни в каталоге строк (`onboarding.json`) — только честное «обычный
 * русский текст» (`nlpOnboarding.title`/`.description`).
 *
 * Presentational-демонстрация: поле ввода + живой разбор через
 * `parseQuickAdd` (`@shagi/nlp`, чистая синхронная функция, вызывается на
 * каждое изменение поля — сети/асинхронности здесь нет) + предпросмотр
 * через уже принятые `capture/ParsingPreview`/`capture/NLPToken` (второй —
 * внутри первого, здесь напрямую не используется). Задача уже реально
 * создана на предыдущем шаге (M04 FirstTask) — этот экран ничего не пишет в
 * хранилище, только показывает, что парсер понимает без подключения к
 * интернету.
 *
 * Значение поля по умолчанию — не выдуманный пример, а буквально кейс
 * `combined-01` золотого корпуса `@shagi/nlp`
 * (`packages/nlp/src/corpus/golden-corpus.ts`: «шесть категорий сразу в
 * одном реалистичном тексте») — так демонстрация с первого кадра показывает
 * дату, время, длительность, проект, метку и приоритет одновременно, не
 * дожидаясь, пока пользователь наберёт что-то похожее сам.
 *
 * Дальше по матрице идёт M06 Today Empty — эпик E06, не E04, поэтому на
 * момент E04 «Понятно» не вела никуда (`ScreenId`/`SCREENS` ещё не знали
 * `'todayEmpty'`). E06 завёл экран `Today` (сам решает по данным, показать
 * M06 Empty или M07 Normal — `screens/index.ts`), но так и не вернулся
 * дописать переход отсюда: без этой правки КАЖДЫЙ запуск приложения
 * (`store.ts`: начальный экран всегда `'launch'`, навигационное состояние
 * не персистентно) необратимо упирался в этот экран — заведённые дальше
 * Today/Inbox/Projects/Search/Plan/TaskDetail были недостижимы вообще
 * никаким путём в интерфейсе. Найдено и исправлено при ручной проверке
 * M26 в браузере (E11) — `controller.goTo('todayEmpty')` тем же приёмом,
 * что уже использует `Welcome.tsx` («Начать»/«Войти»).
 */
import { useMemo, useState, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { formatDate, formatTime, t } from '@shagi/i18n';
import { Button, Input, ParsingPreview, type ParsingPreviewToken } from '@shagi/ui';
import {
  parseQuickAdd,
  type AcceptedChip,
  type AnyAcceptedChip,
  type NowContext,
} from '@shagi/nlp';

import { useAppController } from '../state/context.js';

const DEMO_TEXT = 'Позвонить маме завтра в 15:00 #семья @важное !2 на 20 мин';

/** Три словоформы (`01§4`, `RecurrenceUnit`) — отдельный ключ каталога на
 * каждую, ICU-плюрал внутри считает число (`день/дня/дней` и т.д.). */
function recurrenceLabel(value: AcceptedChip<'recurrence'>): string {
  switch (value.value.unit) {
    case 'day':
      return t('onboarding', 'nlp.chip.recurrence.day', { interval: value.value.interval });
    case 'week':
      return t('onboarding', 'nlp.chip.recurrence.week', { interval: value.value.interval });
    case 'month':
      return t('onboarding', 'nlp.chip.recurrence.month', { interval: value.value.interval });
  }
}

/**
 * `switch` по `chip.category` без `default` — умышленно: `AnyAcceptedChip`
 * дискриминирован по `category` (`@shagi/nlp` `types.ts`), и если та
 * категория когда-нибудь вырастет, здесь перестанет компилироваться
 * (`tsc --noEmit`), а не молча пропустит новый вид чипа демонстрации.
 */
function chipLabel(chip: AnyAcceptedChip): string {
  switch (chip.category) {
    case 'date':
    case 'weekday':
      return formatDate(chip.value.date, { weekday: 'short' });
    case 'time':
      return formatTime(chip.value.time);
    case 'deadline':
      return chip.value.time === null
        ? t('onboarding', 'nlp.chip.deadlineDateOnly', {
            date: formatDate(chip.value.date, { weekday: 'short' }),
          })
        : t('onboarding', 'nlp.chip.deadlineWithTime', {
            date: formatDate(chip.value.date, { weekday: 'short' }),
            time: formatTime(chip.value.time),
          });
    case 'duration':
      return t('onboarding', 'nlp.chip.duration', { minutes: chip.value.minutes });
    case 'recurrence':
      return recurrenceLabel(chip);
    case 'project':
      return t('onboarding', 'nlp.chip.project', { name: chip.value.name });
    case 'label':
      return t('onboarding', 'nlp.chip.label', { name: chip.value.name });
    case 'priority':
      return t('onboarding', 'nlp.chip.priority', { level: chip.value.priority });
  }
}

export function NlpOnboarding(): ReactElement {
  const controller = useAppController();
  const [text, setText] = useState(DEMO_TEXT);

  // Зафиксировано на момент монтирования — демонстрация, не живые часы:
  // повторный разбор при каждом изменении текста не обязан пересчитывать
  // "сейчас" ещё и по времени, точно так же, как `Composer` получает `now`
  // один раз при открытии (`01§4`).
  const now: NowContext = useMemo(
    () => ({
      date: Temporal.Now.plainDateISO(),
      time: Temporal.Now.plainTimeISO(),
      timeZone: Temporal.Now.timeZoneId(),
    }),
    [],
  );

  const result = useMemo(() => parseQuickAdd({ text, now }), [text, now]);

  const tokens: ParsingPreviewToken[] = result.chips.map((chip, index) => ({
    id: `${chip.category}-${index}`,
    kind: chip.category,
    label: chipLabel(chip),
  }));

  return (
    <div>
      <h1>{t('onboarding', 'nlpOnboarding.title')}</h1>
      <p>{t('onboarding', 'nlpOnboarding.description')}</p>

      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label={t('onboarding', 'nlpOnboarding.inputLabel')}
        placeholder={t('onboarding', 'nlpOnboarding.placeholder')}
      />

      <ParsingPreview
        title={result.title.text}
        tokens={tokens}
        label={t('onboarding', 'nlpOnboarding.previewLabel')}
        emptyState={<p>{t('onboarding', 'nlpOnboarding.emptyState')}</p>}
      />

      <Button type="button" variant="primary" onClick={() => controller.goTo('todayEmpty')}>
        {t('onboarding', 'nlpOnboarding.continueLabel')}
      </Button>
    </div>
  );
}
