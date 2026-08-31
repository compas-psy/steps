import type { Temporal } from '@js-temporal/polyfill';

import type { Task } from '../entities/task.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import type { CommandStoragePort } from './storage-port.js';

/**
 * Итог выполнения команды (задание E01.4 — "Продумай форму сам"). Три
 * исхода, не два: помимо успеха/отклонения валидатором, `update`/`complete`/
 * `delete` адресуют существующую задачу по `id`, а такой задачи может не
 * быть (не найдена или уже tombstone — для команд этого пакета работ
 * tombstone-задача не является допустимой целью новой мутации, см.
 * комментарий каждой команды). Это не то же самое, что "невалидная мутация"
 * — `validateDomainMutation` тут вообще не вызывается, нечего валидировать,
 * поэтому отдельный вариант, а не подмешивание в `rejected` без issues.
 *
 * `rejected` не бросает исключение (требование задания — вызывающий код,
 * NLP-preview или форма, должен уметь показать ошибку, не ловить throw) и
 * несёт весь `ValidationResult` целиком (не только "невалидно"), потому что
 * `ValidationResult.issues` уже несёт всё нужное вызывающему UI: `field` для
 * подсветки конкретного поля, `code` для стабильного текста ошибки,
 * `severity` (хотя тут все issues в `rejected` заведомо `blocking` — иначе
 * `validation.valid` было бы `true`, и команда пошла бы дальше и писала).
 */
export type TaskCommandResult =
  | { readonly status: 'ok'; readonly task: Task }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/**
 * Зависимости, общие для всех четырёх команд. `now` — значение, не функция:
 * задание требует детерминированной тестируемости ("источник времени —
 * параметр `now`, не читается из системных часов внутри функции"); один
 * `Temporal.Instant` на весь вызов команды достаточен — все временные метки,
 * которые команда проставляет за один вызов (createdAt/updatedAt/completedAt/
 * deletedAt/HLC.physical/outbox.createdAt), логически относятся к одному и
 * тому же моменту "команда выполнилась", а не к разным.
 *
 * `deviceId` — тай-брейк HLC (`hlc.ts`) и обязательное поле
 * `SyncOutboxEntry.deviceId`; здесь не default — вызывающий код (следующие
 * пакеты работ) обязан явно передать `device_id` текущего устройства,
 * молчаливого системного умолчания для него нет.
 *
 * `generateId`/`generateOpId` по умолчанию — реальный `generateUuidV7` из
 * `identity/`, но параметризуемы: тестам нужны предсказуемые id, не
 * заново сгенерированные на каждый прогон.
 */
export interface TaskCommandDeps {
  readonly storage: CommandStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}
