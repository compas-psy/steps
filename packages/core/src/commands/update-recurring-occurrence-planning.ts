import type { Uuid } from '../values.js';
import { deriveRecurrenceOccurrenceTemplate } from './recurrence-template.js';
import { updateSeriesOccurrenceTemplateCommand } from './update-series-template.js';
import { updateTaskCommand, type UpdateTaskPatch } from './update-task.js';
import type { TaskCommandDeps, TaskCommandResult } from './types.js';

/**
 * M26 «Recurring detail — current/series scope chooser»
 * (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`, `01§11.6` "Template edit →
 * Это повторение / Вся серия"). Единая точка, через которую UI (`Task
 * Detail`) коммитит Planning-патч recurring-задачи ПОСЛЕ того, как
 * пользователь выбрал область применения в диалоге — сама эта команда не
 * решает, показывать ли диалог (это дело UI), она реализует уже сделанный
 * выбор.
 *
 * `scope: 'occurrence'` ("Это повторение") и `scope: 'series'` ("Вся
 * серия") ОБЕ патчат ТЕКУЩИЙ occurrence одинаково (`01§11.6`, дословно:
 * "Вся серия" = "current + future" — правка current не выбор, а данность
 * обоих scope). Разница — только в том, просачивается ли патч в шаблон
 * серии, откуда его читает `generateNextOccurrence`
 * (`complete-occurrence.ts`) при генерации СЛЕДУЮЩЕГО occurrence:
 * `scope:'occurrence'` не трогает `RecurrenceSeries` вообще, `scope:'series'`
 * пересчитывает `RecurrenceOccurrenceTemplate` из уже применённого патча и
 * записывает его через `updateSeriesOccurrenceTemplateCommand`.
 */
export interface UpdateRecurringOccurrencePlanningInput {
  readonly id: Uuid;
  readonly scope: 'occurrence' | 'series';
  /**
   * Тот же `UpdateTaskPatch`, что принимает `updateTaskCommand` — не
   * изобретается новый тип патча. Патчить имеет смысл только Planning-поля
   * (`availableFrom`/`plannedDate`/`plannedTime`/`durationMin`/
   * `deadlineDate`/`deadlineTime`) — только они попадают в
   * `RecurrenceOccurrenceTemplate` при `scope:'series'`. Эта команда не
   * валидирует состав патча (UI — единственный вызывающий код, и обязан
   * передавать только Planning-поля); прочие поля (`title`/`priority`/...)
   * применятся к текущему occurrence как обычно через `updateTaskCommand`,
   * но НЕ попадут в шаблон серии ни при каком `scope` — на шаг 4 (см.
   * реализацию) идут только Planning-поля, читаемые из уже обновлённого
   * `Task`, а не из `patch` буквально.
   */
  readonly patch: UpdateTaskPatch;
}

export type UpdateRecurringOccurrencePlanningResult = TaskCommandResult;

/**
 * 1. Загружает occurrence по `id` — если его нет или это не recurring
 *    top-level occurrence (`seriesId === null`), это ошибка вызывающего
 *    кода (UI обязан вызывать эту команду только для recurring top-level
 *    задачи, тот же приём "недостижимо при валидном вызывающем", что уже
 *    применяет `generateNextOccurrence` в `complete-occurrence.ts`) — throw,
 *    не `ValidationResult` (это не пользовательская ошибка ввода).
 * 2. Патчит ТЕКУЩИЙ occurrence через уже готовый `updateTaskCommand` — оба
 *    scope делают это одинаково (`01§11.6`).
 * 3. Если патч отклонён/задача не найдена — возвращает результат как есть,
 *    дальше не идёт (не пишет в серию, если сам occurrence не обновился).
 * 4. Только при `scope:'series'` — пересчитывает `RecurrenceOccurrenceTemplate`
 *    из полей УЖЕ ОБНОВЛЁННОГО occurrence (`result.task`, а не повторное
 *    чтение хранилища — `updateTaskCommand` при `status:'ok'` уже возвращает
 *    финальный `Task`, второе чтение было бы тем же значением ценой лишнего
 *    похода в хранилище) и записывает его в серию.
 */
export async function updateRecurringOccurrencePlanningCommand(
  input: UpdateRecurringOccurrencePlanningInput,
  deps: TaskCommandDeps,
): Promise<UpdateRecurringOccurrencePlanningResult> {
  const task = await deps.storage.tasks.findById(input.id);
  if (task === null || task.seriesId === null) {
    throw new Error(
      'updateRecurringOccurrencePlanningCommand: задача не найдена или task.seriesId===null — ' +
        'эта команда предназначена только для top-level occurrence recurring-задачи; ' +
        'вызывающий UI обязан проверять это перед вызовом (не ValidationResult — не ' +
        'пользовательская ошибка ввода).',
    );
  }
  const seriesId = task.seriesId;

  const result = await updateTaskCommand({ id: input.id, patch: input.patch }, deps);
  if (result.status !== 'ok') {
    return result;
  }

  if (input.scope === 'series') {
    const updatedTask = result.task;
    const occurrenceTemplate = deriveRecurrenceOccurrenceTemplate({
      plannedDate: updatedTask.plannedDate,
      plannedTime: updatedTask.plannedTime,
      durationMin: updatedTask.durationMin,
      deadlineDate: updatedTask.deadlineDate,
      deadlineTime: updatedTask.deadlineTime,
      availableFrom: updatedTask.availableFrom,
    });
    const seriesResult = await updateSeriesOccurrenceTemplateCommand(
      { seriesId, occurrenceTemplate },
      deps,
    );
    if (seriesResult.status === 'not_found') {
      // Тот же приём, что `completeOrSkipOccurrenceCommand`
      // (`complete-occurrence.ts`, "нарушение ссылочной целостности") —
      // `task.seriesId` уже проверен непустым выше, серии не существовать не
      // должно; occurrence УЖЕ обновлён (шаг 2) — молча проигнорировать
      // отсутствие серии значило бы тихо потерять "Вся серия" половину
      // операции, поэтому throw, а не тихий возврат `result` как есть.
      throw new Error(
        `updateRecurringOccurrencePlanningCommand: task.seriesId=${seriesId} не указывает на ` +
          'существующую RecurrenceSeries — нарушение ссылочной целостности.',
      );
    }
  }

  return result;
}
