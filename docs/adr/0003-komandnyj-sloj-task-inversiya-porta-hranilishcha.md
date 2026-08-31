# ADR-0003. Командный слой Task в `packages/core`: инверсия порта хранения, а не импорт `StoragePort` из `packages/storage`

- Статус: принято
- Дата: 2026-08-31
- Автор: владелец требований (через агента, пакет работ E01.4)
- Отклонение от: не отклонение, а конкретизация `docs/spec/SPEC/00_MASTER_IMPLEMENTATION_TZ.md`
  §3 (монорепо: `core/ # domain entities/commands/invariants/recurrence/order`)
  — ТЗ буквально помещает команды в `core`, но не говорит, как команде
  писать в хранилище, не создавая цикл зависимостей.

## Контекст

ТЗ §3 фиксирует состав `packages/core` дословно: `# domain entities/
commands/invariants/recurrence/order`. Команды — часть `core`, не отдельный
пакет и не часть `packages/storage`. Одновременно CLAUDE.md (пункт 1 «Что
закладывается в домен с первого дня») требует: «Единая точка входа
`CreateTaskCommand` — через неё идут Quick Add, импорт и все будущие
адаптеры. Прямая запись в хранилище запрещена.» Команда обязана писать в
хранилище — иначе «прямая запись в хранилище запрещена» бессмысленно, если
сама команда не умеет писать вообще ничего.

Запись в хранилище описана типом `StoragePort`/`StorageWriteTransaction`
(`packages/storage/src/ports/storage-port.ts`) — единственный способ
мутировать хранилище согласно пакету работ E02.1. Но `packages/storage` уже
зависит от `@shagi/core`: `EntityWrite` (`packages/storage/src/ports/
transaction.ts`) прямо импортирует `Task`, `Project`, `Section`, `Label` и
другие сущности из `@shagi/core`, а методы `TaskRepository` возвращают
`TaskValidationContext`/`TaskParentSnapshot` — тоже типы `@shagi/core`. Это
однонаправленная зависимость: `storage → core`.

Если `packages/core/src/commands/` импортирует `StoragePort` из
`@shagi/storage` напрямую — зависимость становится `storage → core →
storage`. Цикл пакетов в pnpm-workspace с `moduleResolution: bundler` не
собирается (либо резолвится в неопределённом порядке, либо падает при
попытке типа `@shagi/storage` разрешиться раньше, чем сам `@shagi/storage`
успел построить граф импортов, которые включают `@shagi/core`, который в
свою очередь ждёт `@shagi/storage`). Это не гипотетическая проблема стиля —
это буквально не соберётся.

Альтернатива «физически перенести `StoragePort` в `packages/core`, раз он
всё равно нужен команде» тоже не работает: `StoragePort`/`StorageWriteTransaction`
— это форма ХРАНИЛИЩА (natively SQLite/IndexedDB, `00§2`), а не домена;
пакет работ E02.1 уже реализовал его в `packages/storage` со всем
контрактом (13 репозиториев, tombstone purge, query-порт) до этого пакета
работ, и ТЗ §3 явно относит "storage/ # repositories, adapters" к отдельному
пакету, а не к `core`. Перенос типа физически в `core` разорвал бы уже
готовую реализацию `packages/storage`, которая на него ссылается, ради
одного клиента (командного слоя), которому от полного контракта хранилища
нужна на деле лишь небольшая часть.

## Решение

**Инверсия порта.** `packages/core/src/commands/storage-port.ts` объявляет
**собственный** минимальный интерфейс `CommandStoragePort` (плюс
`CommandStorageWriteTransaction`, `CommandDomainMutation`, `CommandEntityWrite`),
пользуясь исключительно типами, которые уже есть внутри `core` (`Task`,
`TaskValidationContext`, `SyncOutboxEntry`, `Uuid`) — ничего из них не
дублируется как копия чужого типа, они и так тут "дома". Форма этого
интерфейса — **структурно** то же самое, что `StoragePort`/
`StorageWriteTransaction`/`DomainMutation`/`EntityWrite` из
`packages/storage`, но объявлена заново, без единого импорта оттуда:

| `packages/storage` (реальный контракт)                | `packages/core/commands` (порт команд)                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `StoragePort` (13 репозиториев + purge)               | `CommandStoragePort` (только `tasks: CommandTaskReader` — 2 метода из 11)                               |
| `StorageWriteTransaction` (13 репо + `applyMutation`) | `CommandStorageWriteTransaction` (`tasks` + `applyMutation`)                                            |
| `DomainMutation` (`writes`/`outbox`)                  | `CommandDomainMutation` (те же два поля, та же семантика non-empty outbox)                              |
| `EntityWrite` (union на 10 типов сущности)            | `CommandEntityWrite` (только вариант `'task'` — единственный, который пишут команды этого пакета работ) |

Ключевой механизм, ради которого это работает без единого адаптера, —
**структурная типизация TypeScript плюс бивариантность метод-синтаксиса**.
Каждый метод порта объявлен как метод интерфейса (`foo(...): ...`), а не
как свойство-стрелка (`foo: (...) => ...`). TypeScript сравнивает параметры
методов, объявленных method-синтаксисом, **бивариантно** — `strictFunctionTypes`
на это не распространяется (это официально документированное поведение
компилятора, не полагание на баг). Бивариантность означает: присваивание
разрешено, если совместимость выполняется хотя бы в одном из двух
направлений. `CommandStoragePort` — подмножество `StoragePort` (меньше
методов, меньше вариантов в union `entity`), поэтому направление
«`StoragePort` → `CommandStoragePort`» проходит: у настоящего порта есть всё,
что просит узкий, и типы совпадающих полей идентичны (оба ссылаются на одни
и те же типы `@shagi/core` — `Task`, `TaskValidationContext`,
`SyncOutboxEntry`). Значит переменной типа `CommandStoragePort` можно
присвоить объект типа `StoragePort` без единого `as`/адаптера.

**Проверено эмпирически, не только выводом на бумаге** — самостоятельный
прогон `tsc` над файлом-проверкой (вне дерева обоих пакетов, чтобы не
зависеть ни от чьего `rootDir`), импортирующим оба типа напрямую:

```ts
import type { StoragePort } from '.../packages/storage/src/ports/storage-port.js';
import type { CommandStoragePort } from '.../packages/core/src/commands/storage-port.js';

function acceptsRealPort(real: StoragePort): CommandStoragePort {
  return real; // компилируется без единой ошибки — ноль адаптеров
}
```

прошёл `tsc --noEmit --strict --exactOptionalPropertyTypes
--noUncheckedIndexedAccess` без единой ошибки. Это и есть доказательство
работоспособности решения, не просто предположение о поведении компилятора.

**Почему это не хрупкая случайность, а защищённая линия.** Если однажды
форма `DomainMutation`/`EntityWrite`/`StoragePort` в `packages/storage`
разойдётся с копией в `packages/core/commands` (переименуют поле, добавят
обязательный параметр, изменят тип `outbox`), бивариантная проверка
перестанет находить совместимость ни в одном направлении — `tsc` в
`packages/storage` (или везде, где реальный порт передаётся в команду)
покажет ошибку присваивания прямо на сборке, а не тихо разойдётся в
рантайме. Разбор конкретного механизма (какая часть перестанет
совпадать) — в комментарии `commands/storage-port.ts`.

## Последствия

**Плюсы**

- Нет цикла зависимостей `storage → core → storage` — компилируется.
- Команды физически живут в `core`, как требует ТЗ §3, а не в `storage`
  или в отдельном третьем пакете, изобретённом ради одного этого клиента.
- Тестам командного слоя не нужен настоящий `packages/storage` (ни его
  зависимостей, ни SQLite/IndexedDB) — только лёгкая in-memory реализация
  узкого `CommandStoragePort` (`test/commands/in-memory-storage-port.ts`).
- Когда `packages/app` (следующие пакеты работ) соберёт настоящий
  `StoragePort` и передаст его в `createTaskCommand`/`updateTaskCommand`/…,
  адаптер не потребуется — присваивание пройдёт по структуре, что и
  подтверждено эмпирической проверкой выше.

**Минусы и как они удержаны под контролем**

- Форма мутации задублирована текстуально (два похожих файла:
  `packages/storage/src/ports/transaction.ts` и
  `packages/core/src/commands/storage-port.ts`) — при поверхностном чтении
  выглядит как нарушение DRY. Удержано тем, что это дублирование **формы**,
  не **логики** (никакой код не скопирован дважды — только объявления
  типов), и что расхождение форм ловится компилятором на границе, а не
  тихо: см. «Почему это не хрупкая случайность» выше.
- `CommandEntityWrite` покрывает только вариант `'task'`, а не весь `EntityType`
  (`'project'`, `'section'`, `'label'`, …, 10 значений в реальном
  `EntityWrite`) — это осознанное сужение по границам пакета работ E01.4
  (Project/Section/Label/Recurrence — другие пакеты работ, не пишут
  команды здесь), не недосмотр. Когда будущий пакет работ добавит команды
  для этих сущностей, он либо расширит `CommandEntityWrite` до объединения
  (тогда стоит рассмотреть вынос общего порта в отдельный внутренний модуль,
  используемый всеми командами), либо заведёт для них свой узкий порт по
  той же схеме — оба варианта совместимы с этим ADR.
