# ШАГИ
## MASTER PRODUCT + PRODUCTION UX/UI SPECIFICATION

**Версия:** 4.0 FINAL / FROZEN
**Основание:** v3.0 Fable + финальный CPO-аудит: устранение противоречий контекстного capture/Inbox, нормализация Today/Focus/sorting, temporal constraints, recurrence restore, local→account merge, R1.3 Shared и future integration surface; реестр решений — Приложение A
**Назначение:** единое ТЗ для Claude Design
**Статус:** FINAL PRODUCT SPECIFICATION / CLAUDE DESIGN READY / PRODUCT SCOPE FROZEN
**Продукт:** ШАГИ · **Экосистема:** СИМПАС · **Категория:** Personal Task Manager / Daily Planner
**Аудитория:** B2C · **Язык первого рынка:** русский
**Первый релиз:** самостоятельное приложение без голосового ввода, без AI-зависимости и без обязательной связи с другими продуктами СИМПАС. Core task operations и NLP-разбор текста обязаны быть детерминированными и работать офлайн; network-bound функции (sync, account, cloud attachment upload, external auth) должны корректно деградировать и никогда не блокировать локальную работу.

---

# 0. ИНСТРУКЦИЯ CLAUDE DESIGN

Это не brainstorming brief. Необходимо создать **production-ready UX/UI-систему**, пригодную для передачи разработке.

Проектируется не только R1, а **конечная архитектура продукта**. Каждый экран и future-компонент имеет release marker:

- `R1 CORE`
- `R1.1 PLANNING`
- `R1.2 SMART`
- `R1.3 SHARED`
- `R2 SIMPAS`
- `R3 VECTOR`

Главное правило:

> **Проектировать конечный продукт сразу, реализовывать поэтапно.**

Запрещено:

- проектировать R1 так, чтобы R1.1–R3 потребовали менять базовую navigation architecture, Task Detail, Task Composer или Task Object;
- самостоятельно расширять продукт корпоративными функциями, CRM, Gantt, сложной аналитикой и сущностями, не описанными в этом документе;
- оставлять неопределённости: если данный документ не задаёт правило, поведение выбирается по разделу 88 (приоритет при конфликте), а выбор фиксируется в README дизайн-файла.

При выборе между эффектностью и понятностью — выбирать понятность.

---

# 1. ПРОДУКТОВАЯ ИДЕЯ

ШАГИ — персональная система управления делами, построенная вокруг вопроса:

> **Что мне делать дальше?**

Это не система учёта задач ради учёта. Последовательность ценности:

**зафиксировать → понять → организовать → спланировать → выполнить**

---

# 2. ПОЗИЦИОНИРОВАНИЕ

ШАГИ находятся между двумя крайностями:

- **Слишком простые приложения** — быстро записывают дела, но плохо помогают управлять ими.
- **Слишком сложные системы** — предлагают десятки функций, но требуют самостоятельно строить methodology.

ШАГИ должны обладать: глубиной Todoist; визуальным спокойствием Things; развитой temporal-моделью; календарной реалистичностью Sunsama; smart-возможностями следующего поколения; собственной идентичностью СИМПАС.

---

# 3. КЛЮЧЕВОЕ ОБЕЩАНИЕ

R1:

> **Записать быстро. Понять день сразу. Сделать вовремя.**

Конечная версия:

> **ШАГИ сокращают расстояние между намерением человека и выполненным действием.**

---

# 4. ЧЕМ ШАГИ НЕ ЯВЛЯЮТСЯ

Не проектировать продукт как: Jira; Asana; CRM; ERP; Notion clone; корпоративную систему поручений; habit tracker; Pomodoro-приложение; AI-чат; календарь, к которому случайно добавили задачи.

---

# 5. АУДИТОРИИ

## 5.1. Primary — B2C

Люди 20–55 лет, управляющие личными и рабочими делами: специалисты, менеджеры, предприниматели, фрилансеры, студенты, родители; пользователи Todoist / Things / TickTick / SingularityApp; пользователи обычных reminders, которым их уже недостаточно.

## 5.2. Secondary

Пользователи ЗАПИСОК, МОМЕНТОВ и других продуктов СИМПАС. Интеграция — `R2`.

## 5.3. Tertiary

Психологи, менторы и специалисты помогающих профессий, использующие ПРАКТИКУ. Интеграция — `R2`.

---

# 6. ГЛАВНЫЕ PRODUCT PRINCIPLES

- **P1. Capture first.** От мысли до сохранённой задачи — несколько секунд. Квантификация: с экрана Сегодня «+» → текст → сохранить = не более 3 действий; от холодного запуска нового пользователя до первой сохранённой задачи — не более 3 экранов.
- **P2. Today first.** Главный экран — Сегодня. Не Inbox, не Projects, не Dashboard.
- **P3. Progressive disclosure.** Задача «Купить хлеб» не требует формы. Сложность показывается только по запросу пользователя.
- **P4. Calm power.** Функционально мощный, визуально спокойный.
- **P5. Tasks + Time.** Задача — не только строка списка, но потенциально часть реального времени человека.
- **P6. Human control.** Smart-функции предлагают. Пользователь решает.
- **P7. Standalone first.** ШАГИ хороши даже для человека, никогда не слышавшего о СИМПАС.
- **P8. Ecosystem later.** СИМПАС усиливает ШАГИ, но не является условием их работы.

---

# 7. КЛЮЧЕВАЯ ОСОБЕННОСТЬ: МОДЕЛЬ ВРЕМЕНИ

В большинстве task managers разные понятия времени смешаны. В ШАГАХ это разные сущности.

---

# 8. TEMPORAL MODEL

## 8.1. Available From — «Доступно с»

Когда задача становится актуальной. Пример: «Подать документы можно начиная с 5 сентября».

До наступления даты задача: существует; доступна через Search; видна внутри проекта в future-состоянии (приглушённая, с датой доступности); видна в Плане на своей дате с маркером «станет доступна»; не попадает в Сегодня и не мешает рабочему списку.

## 8.2. Planned Date — «Запланировано»

В какой день пользователь собирается заниматься задачей.

## 8.3. Planned Time

Во сколько пользователь планирует начать. Может отсутствовать.

## 8.4. Duration — «Длительность»

Сколько времени пользователь планирует потратить. Может существовать без Planned Time. Пример: «Сделать отчёт · 45 мин · сегодня». Хранится в минутах.

## 8.5. Deadline — «Срок»

Момент, после которого задача объективно просрочена. Deadline ≠ Planned Date.

Тип: дата с опциональным временем. Без указанного времени deadline трактуется как конец дня (23:59 локального времени).

## 8.6. Reminder — «Напоминание»

Когда уведомить пользователя. Не обязан совпадать ни с planned time, ни с deadline. В R1 — одно напоминание на задачу (модель хранит массив; UI ограничивает). Несколько напоминаний — R1.1.

## 8.7. Recurrence — «Повтор»

Правило создания/возобновления следующих occurrences. Архитектура — раздел 18.

## 8.8. Temporal constraints — допустимые комбинации

Temporal-модель должна позволять восстановление после сорванного срока, но не создавать логически невозможные состояния.

Нормативные правила:

- `planned_date < available_from` — **запрещено**. Показать inline-conflict и предложить изменить «Запланировано» или «Доступно с».
- `deadline < available_from` — **запрещено**: задача не может стать доступной после объективного срока.
- `planned_date > deadline` — **разрешено с явным предупреждением** «План позже срока». Это необходимо для перепланирования уже просроченной задачи без переписывания истории срока.
- если Planned Time + Duration известны и рассчитанное окончание позже Deadline — разрешить с предупреждением «Не помещается до срока».
- Reminder может быть раньше Planned/Available From. Reminder позже Deadline допускается, но UI показывает предупреждение.
- Duration без Planned Time — валидна.
- Deadline без Planned Date — валиден.
- Available From без Planned Date — валиден.
- отсутствие всех temporal-полей — валидная задача.

Нужен системный state `Temporal conflict` (ST19), а в M28/D11 должны быть показаны запрещённый и warning-варианты.

## 8.9. Locale, timezone и граница дня

Для первого рынка:

- locale default: `ru-RU`;
- неделя начинается с понедельника;
- формат времени по умолчанию — 24-часовой;
- Today переключается в локальную полночь устройства;
- task date/time в R1 имеют semantics **floating local time**: «09:00» остаётся 09:00 по текущему локальному времени пользователя после смены часового пояса;
- scheduled recurrence следует локальной календарной дате/времени;
- deadline без времени = 23:59 локального дня;
- reminders следуют локальной task date/time;
- Focus привязан к конкретной локальной дате;
- ручной per-task timezone — future, не R1.

---

# 9. ДВА РАЗНЫХ ВИДА ПРОСРОЧКИ (обязательная часть UX)

## Planned Date passed — «Не по плану»

Задачу планировали вчера, deadline ещё не наступил. Семантика: **не выполнено по плану**. Не использовать агрессивное critical-red состояние. Основной action: **Перепланировать**.

Размещение: отдельная сворачиваемая группа **«Не по плану»** в верхней части экрана Сегодня; если существует группа «Просрочен срок», «Не по плану» располагается сразу под ней и над «Главное». Группа имеет счётчик, bulk-действия «Перенести всё на сегодня / на завтра» и per-task действие «Перепланировать». Задача остаётся в группе, пока не будет выполнена или перепланирована; сама дата не «переползает» автоматически.

## Deadline passed — «Просрочен срок»

Объективный срок прошёл. Отображается сильнее (акцентный цвет + текстовый маркер + иконка — не только цветом). Задача с прошедшим deadline поднимается в Сегодня независимо от своей planned date. Действия: перепланировать / изменить срок / выполнить.

## Запрещено

Визуально смешивать missed plan и missed deadline.

---

# 10. ПРИМЕР TEMPORAL MODEL

**Подготовить презентацию** — Available from: 8 сентября · Planned: 10 сентября 14:00 · Duration: 1 час · Deadline: 12 сентября 18:00 · Reminder: 10 сентября 13:45.

---

# 11. RELEASE MODEL

## R1 CORE — самостоятельные ШАГИ

Включает **полную базовую модель задачи**: Available From; Planned Date; Planned Time; Duration; Deadline; Reminder (одно); Recurrence (оба anchor-режима). Эти сущности НЕ переносятся в R1.1.

Внутренние инженерные вехи (ориентир для разработки; **не меняют дизайн-скоуп** — проектируется весь R1 целиком):

- **R1a** — capture, Сегодня, Входящие, Проекты (List), даты/время/срок/напоминание, поиск, офлайн, гостевой режим;
- **R1b** — recurrence, Board, длительность в UI, attachments/links, sync + аккаунт, импорт/экспорт, виджеты, command palette, multi-select.

## R1.1 PLANNING

Полноценные Day / Week / Month; time blocking; внешние календари; advanced filters; advanced reminders; activity history; дополнительные planning-инструменты.

## R1.2 SMART

AI-assisted planning.

## R1.3 SHARED

Персональная совместная работа в выбранных проектах: share project, invite, members, assignment, comments и activity. Это standalone-возможность ШАГОВ и не зависит от СИМПАС. Не превращать её в корпоративные workspaces/enterprise administration.

## R2 SIMPAS

Связи между продуктами.

## R3 VECTOR

Multimodal intent layer.

## Future integration surface — extension point

Архитектура Capture и Settings должна предусматривать без редизайна будущие подключения: Telegram capture; MAX capture; email → task; OS Share Extension; watch/wearables; public API; automation/webhooks. Эти интеграции не входят в R1 и не требуют отдельных production-макетов сейчас, но в `Settings → Integrations` должен существовать расширяемый extension point.

---

# 12. TASK OBJECT

```text
Task
├── id
├── title
├── description
├── status
├── project_id
├── section_id
├── parent_task_id          // R1 UX поддерживает 1 уровень; data model не должен запрещать более глубокую future-вложенность
├── sort_order
│
├── priority                // P1–P4
├── focus_date              // date | null; до 3 задач на конкретную локальную дату
├── day_bucket              // default | later; presentation-атрибут текущего planned_date
│                           // later = «Когда будет время»; всегда сбрасывается при изменении planned_date
│
├── available_from
├── planned_date
├── planned_time
├── duration                // минуты
├── deadline                // дата + опциональное время
├── recurrence_rule
├── recurrence_anchor       // scheduled | completion
├── series_id               // связь occurrence → серия (см. раздел 18)
├── reminders[]             // R1: UI ограничивает одним
│
├── labels[]
├── subtasks[]              // полноценные Task через parent_task_id
├── checklist_items[]       // строки: {text, done}; без дат и приоритетов
├── attachments[]
├── links[]
│
├── created_at
├── updated_at
├── completed_at
├── future: archived_at       // reserved only; не используется R1 Task UX
│
├── future: actual_duration
├── future: estimated_duration
├── future: linked_objects[]
├── future: collaborators[]
├── future: assignee_id
├── future: comments[]
├── future: location
└── future: smart_metadata
```

## 12.1. Подзадачи vs чек-лист — семантический водораздел (обязателен)

- **Подзадача** — полноценная Task: имеет собственные даты, приоритет, напоминания; появляется в Сегодня/Плане на своей дате (со ссылкой на родителя как контекстом); участвует в поиске. В R1 UI вложенность — максимум один уровень: подзадача не может создавать подзадачу через интерфейс. При этом data model и component architecture не должны делать будущую глубину >1 технически невозможной.
- **Элемент чек-листа** — лёгкая строка внутри задачи: только текст и отметка; не имеет дат; нигде вне Task Detail не появляется.
- Правило для UI-подсказки: «Нужна дата или напоминание у пункта — превратите его в подзадачу» (действие конверсии checklist item → subtask обязательно; обратная конверсия допустима, метаданные при этом отбрасываются с предупреждением).
- В Task Detail оба блока раздельны и подписаны: «Подзадачи», «Чек-лист».

---

# 13. TASK STATUS

R1: `active`, `completed`.

`archived` не является R1-статусом Task. Secondary-раздел «Архив» в R1 относится к архивированным Projects. Индивидуальная Task либо active, либо completed, либо удалена с Undo.

Отдельными статусами НЕ являются: overdue; missed plan; recurring; today focus; «когда будет время». Это вычисляемые признаки или presentation-атрибуты.

---

# 14. PROJECT OBJECT

```text
Project
├── id
├── title
├── description
├── icon/color marker
├── sections[]
├── default_view            // list | board
├── sort_order
├── favorite
├── archived
└── future: shared settings
```

Архивированные проекты доступны из секции Архив (secondary navigation); frame — в составе M16/Settings.

---

# 15. SECTION OBJECT

Section — организационная часть проекта. Пример: проект «Запуск сайта», sections «Идеи / Сделать / В работе / Финал».

В Board View sections становятся columns. Это одна сущность, а не две независимые системы. Задачи без section в Board отображаются в первой колонке **«Без раздела»**; колонка показывается только если непуста.

---

# 16. PRIORITY

Четыре уровня: **P1** — критично; **P2** — важно; **P3** — обычно; **P4** — без специального приоритета (значение по умолчанию).

В интерфейсе допустимы более человеческие названия, но data model остаётся P1–P4. Приоритет не влияет на группировку Сегодня и **по умолчанию не переставляет задачи автоматически**. Он является визуальным атрибутом и доступным критерием `Sort by`. Ручной порядок пользователя сохраняется. Правила default-сортировки Today заданы в разделе 22.1.

---

# 17. TODAY FOCUS — «Главное»

Пользователь выбирает до **3 главных задач конкретного дня** (`focus_date = date`). Это НЕ Priority: P1 — «задача вообще критична»; Focus — «именно в этот день я сознательно выбираю её одной из главных».

Правила:

- Focus активен, когда `focus_date == today`.
- Если задача без Planned Date помечается как «Главное», система назначает `planned_date = today` после компактного подтверждения.
- Если задача запланирована на другую дату, действие «В Главное сегодня» предлагает перенести её на сегодня.
- При изменении `planned_date` на другой день `focus_date` очищается.
- В локальную полночь вчерашний Focus не превращается в сегодняшнее Главное автоматически.
- Попытка выбрать четвёртую задачу: спокойная подсказка «Главных задач может быть три» + предложение заменить одну из трёх текущих.

---

# 18. RECURRENCE MODEL

## 18.1. Два anchor-режима (оба обязательны в R1)

- **Scheduled recurrence** — относительно календаря: «каждый понедельник».
- **Completion recurrence** — относительно момента выполнения: «через 30 дней после выполнения».

UI обязан объяснять разницу (в advanced-пикере — по одной поясняющей строке с примером на каждый режим).

## 18.2. Архитектура серии

Повтор реализуется как **серия (правило) + материализованный текущий occurrence**:

- серия хранит recurrence_rule, recurrence_anchor и шаблон задачи;
- в списках всегда существует ровно один активный occurrence — реальная запись Task с series_id;
- при выполнении occurrence создаётся следующий (по правилу и якорю); выполненный остаётся реальной записью — история и экран Завершённые работают без дополнительной логики;
- при создании нового occurrence подзадачи и чек-лист пересоздаются в невыполненном состоянии.

## 18.3. Область изменения (обязательный UX)

Любое редактирование повторяющейся задачи, затрагивающее поля серии (title, правило, время, срок и т.п.), вызывает выбор области: **«Это повторение» / «Вся серия»**. Изменение только текущей записи (например, перенос одного occurrence) серию не трогает. Удаление — тот же выбор. Молча применять изменение ко всей серии запрещено.

## 18.4. Recurrence + Deadline

Каждый occurrence — самостоятельное выполнение серии. Deadline может быть фиксированным внутри occurrence или относительным к Planned Date. Сложный rule builder не выносится на главный экран; advanced recurrence находится глубже (M30).

## 18.5. Restore completed recurrence

После выполнения occurrence следующий occurrence уже может быть создан. Поэтому обычное восстановление не должно молча создавать две активные записи одной серии.

Нормативное поведение:

- если следующий occurrence **ещё не создан**, допускается действие «Отметить снова невыполненной»;
- если следующий occurrence уже существует, completed occurrence считается частью истории серии и не возвращается в active-series;
- вместо Restore предлагается **«Создать отдельную копию»** — создаётся обычная non-recurring Task с теми же пользовательскими данными;
- история выполненного occurrence не переписывается.

FLOW 19 обязан показать этот сценарий.

---

# 19. INFORMATION ARCHITECTURE

```text
Primary:
Сегодня
План
Входящие
Проекты
Поиск

Secondary:
Фильтры
Метки
Завершённые
Архив
Настройки
```

---

# 20. MOBILE NAVIGATION

Bottom navigation: **Сегодня** (рабочий день) · **План** (будущие задачи и календарное планирование) · **+** (центральный primary capture action) · **Проекты** (структура) · **Поиск** (глобальный поиск).

Отдельной постоянной вкладки Inbox нет. Точки входа во Входящие:

1. иконка-лоток в header экрана Сегодня со счётчиком неразобранных (появляется только при непустом Inbox);
2. закреплённая строка «Входящие» в верхней части экрана Проекты;
3. системный shortcut / quick action приложения.

### Семантика Входящих

Inbox membership — **не отдельный status** и не зависит от наличия даты.

Нормативное правило:

`Task находится во Входящих, если project_id == null.`

Следовательно, одна Task может одновременно находиться во Входящих как ещё не организованная и отображаться в Сегодня/Плане по своей Planned Date. Назначение Project выводит Task из Inbox.

Toast **«Сохранено во Входящие»** показывается для contextless capture (system quick action / global shortcut / widget), когда пользователь не выбрал Project. При capture из Сегодня/Плана toast не нужен: контекст экрана уже объясняет результат.

---

# 21. DESKTOP NAVIGATION

Sidebar:

```text
Сегодня
План
Входящие
────────
Проекты
  Работа
  Дом
  Личное
────────
Избранное / Фильтры
Метки
────────
Завершённые
```

Bottom/sidebar architecture не обязаны быть буквальными копиями друг друга.

---

# 22. TODAY — СТРУКТУРА

Главный экран продукта.

### Header
«Суббота, 29 августа» + secondary metadata при необходимости; иконка Входящих со счётчиком (см. 20).

### Просрочен срок — условная группа
Появляется только при наличии Task с прошедшим Deadline и status=active. Это самый сильный temporal-state экрана Today. Группа отдельна от «Не по плану», сворачиваемая, без bulk-сдвига срока по умолчанию. Per-task actions: выполнить / перепланировать / изменить срок.

### Не по плану — условная группа
Появляется только при missed-plan задачах: Planned Date прошла, но Deadline не прошёл. Закреплена сразу под «Просрочен срок»; сворачиваемая; имеет bulk «Перенести всё на сегодня / завтра». Deadline-missed задачи сюда не попадают.

### Главное
До трёх focus tasks текущей даты.

### По времени
Задачи с Planned Time.

### Сегодня
Задачи на сегодня без конкретного времени.

### Когда будет время
Опциональные задачи дня. Попадание — **только вручную**: drag задачи в группу или контекстное действие «Когда будет время». Хранится как `day_bucket=later`; атрибут сбрасывается при любом изменении Planned Date. Это не статус и не приоритет. Группа скрыта, пока пуста.

## 22.1. Default sorting внутри Today

1. **Просрочен срок** — Deadline ASC; одинаковый срок → manual `sort_order`.
2. **Не по плану** — исходная Planned Date ASC; внутри даты → manual `sort_order`.
3. **Главное** — manual `sort_order`.
4. **По времени** — Planned Time ASC; одинаковое время → manual `sort_order`.
5. **Сегодня** — manual `sort_order`.
6. **Когда будет время** — manual `sort_order`.

Priority по умолчанию не переставляет задачи. Пользователь может явно выбрать `Sort by Priority`; возврат к manual восстанавливает пользовательский порядок.

---

# 23. TODAY — ПЕРЕГРУЖЕННОЕ СОСТОЯНИЕ

Уже в R1 интерфейс корректно работает при 5 / 15 / 50 задачах. AI-анализ загрузки — только R1.2, но layout R1 не ломается до этого (группы сворачиваемы, виртуализация списка, счётчики в заголовках групп).

---

# 24. INBOX — «Входящие»

Назначение: **быстрая фиксация без обязательной организации**. Входящие — derived-view всех active Task с `project_id == null`. Такая задача может иметь Planned Date, Planned Time, Priority и одновременно отображаться в Today/Plan. Присвоение Project выводит её из Входящих.

Режим **«Разобрать входящие»**: показывает задачи последовательно, по одной. Для каждой: Сегодня; дата; Проект; Удалить; Пропустить. На desktop весь режим управляется с клавиатуры (D05).

---

# 25. PLAN — «План»

**R1:** будущие дни; agenda; calendar date navigation; задачи без конкретного времени; drag между датами там, где платформа позволяет; задачи с Available From показаны на дате доступности с маркером «станет доступна».

**R1.1:** полноценный visual calendar; Day; Week; Month; time blocking; external events.

---

# 26. PROJECT VIEWS

**R1:** List; Board. **R1.1+:** Timeline может быть добавлен позднее; в R1 не проектировать как обязательный.

---

# 27. QUICK ADD — ОСНОВНАЯ МЕХАНИКА

Минимальный composer:

```text
Что нужно сделать?
```

Под полем: Дата · Проект · Приоритет · Ещё. Открытие composer'а сразу даёт фокус в поле ввода — без промежуточного шага (M20).

## 27.1. Context inheritance — обязательное правило

Composer наследует контекст точки вызова:

- из **Сегодня** → default `planned_date = today`;
- из **План / выбранная дата** → default `planned_date = selected_date`;
- из **Проекта** → default `project_id = current_project`;
- из **Section** → current_project + current_section;
- из **Board column** → current_project + соответствующая section;
- из **Входящих** → `project_id = null`; дата не назначается автоматически;
- из global shortcut / widget / OS quick action → contextless capture, `project_id = null`, дата отсутствует;
- явно введённый NLP-токен или вручную выбранное поле **всегда сильнее inherited context**.

Inherited values видимы как editable chips — никакой скрытой магии.

Следствие: FLOW 01 из Today создаёт «Купить хлеб» на сегодня без явного ввода даты; если Project не задан, эта же Task остаётся во Входящих как неорганизованная.

Composer архитектурно расширяем: в R3 добавятся Voice / File / Image входы без смены базовой компоновки (см. раздел 55).

---

# 28. NLP TEXT INPUT (R1, обязательно)

## 28.1. Природа парсера

Детерминированный **rule-based парсер русского языка**, работающий локально и офлайн. Никакой AI-зависимости в R1 (см. шапку документа). LLM-возможности поверх — только R1.2+.

## 28.2. Грамматика токенов R1

- **Дата:** «сегодня», «завтра», «послезавтра», дни недели («в пятницу»), «через N дней/недель», календарные даты («5 сентября», «05.09»), «выходные», «следующая неделя».
- **Время:** «в 11», «в 18:00», «в 9:30»; части дня «утром / днём / вечером» → suggestion с настраиваемым временем по умолчанию (Настройки → «Утро/День/Вечер»).
- **Срок (deadline):** маркер **«до <дата/время>»** — «отчёт 12 сентября до 14 сентября» → Planned 12.09, Deadline 14.09.
- **Повтор:** «каждый понедельник», «каждое 5 число», «каждый день», «раз в неделю».
- **Проект:** префикс `#` с autocomplete. **Метка:** префикс `@` с autocomplete.
- **Длительность:** «45 мин», «1 час», «полтора часа».
- **Приоритет:** явные служебные токены `!1`, `!2`, `!3`, `!4` с autocomplete; свободные слова «важно/срочно» в R1 не преобразуются автоматически, чтобы не искажать title.

## 28.3. Parsing UX

Распознанные значения визуально подтверждаются во время ввода:

```text
Купить цветы [завтра] [18:00]
```

- смысловые tokens выделяются chip'ами и редактируемы до сохранения (tap/клик по chip открывает соответствующий picker; на desktop chips доступны с клавиатуры);
- любой chip можно отклонить — текст остаётся частью title;
- **при сохранении принятые служебные токены удаляются из title** (title = «Купить цветы»);
- запрещено молча интерпретировать неоднозначный ввод.

## 28.4. Ambiguity

Пример: «вечером» при ненастроенном preferred time → suggestion **«Вечером · 19:00»**. Пользователь может принять; изменить; оставить только дату без времени. То же для любых неоднозначных дат («в пятницу» на границе недели → chip показывает конкретную дату «пт, 5 сен» до сохранения).

---

# 29. TASK DETAIL — INFORMATION HIERARCHY

- **Level 1:** Title · Complete · Project
- **Level 2:** Description
- **Level 3 — Planning:** Когда делать · Длительность · Срок · Напоминание · Повтор · Доступно с
- **Level 4 — Organization:** Приоритет · Метки · Подзадачи · Чек-лист
- **Level 5:** Attachments / Links
- **Level 6:** Activity / future linked objects

---

# 30. DATE CONTROL

Primary date picker shortcuts: Сегодня · Завтра · Выходные · Следующая неделя · Без даты. Далее: Calendar. Advanced (progressive disclosure): Время · Длительность · Срок · Доступно с · Напоминание.

---

# 31. DESKTOP TASK DETAIL

Inspector / Side Panel. Открытие задачи не выбрасывает пользователя из текущего списка.

---

# 32. MOBILE TASK DETAIL

Первое открытие: Bottom Sheet / compact detail. Дальнейшее раскрытие: Full-screen Task Detail. Не размещать все advanced fields в маленьком sheet.

---

# 33. TASK ROW

Базовый вид:

```text
○ Подготовить презентацию
  14:00 · 45 мин
```

Дополнительная информация — только при необходимости. Не показывать одновременно project, 4 labels, priority icon, reminder, repeat, attachment, deadline, duration, если это превращает строку в шум.

---

# 34. METADATA PRIORITY

Порядок важности metadata в строке: 1) missed deadline; 2) planned time; 3) deadline approaching; 4) duration; 5) project, если контекст требует; 6) recurrence; 7) labels.

---

# 35. DEADLINE UX

Planned: **«Вт, 10 сен»**. Deadline: **«до 12 сен»**. Разные visual semantics; различие не кодировать только цветом (форма chip'а/предлог «до»/иконка).

---

# 36. AVAILABLE FROM UX

Advanced function. Название «Доступно с» (или человеческий аналог после copy testing). Не выводить в обычную строку задачи без необходимости.

---

# 37. SEARCH

**R1** ищет: title; description; project; labels; completed tasks; future-available tasks. **R2:** linked SIMPAS objects.

---

# 38. FILTERS

**R1 system filters:**

- Без даты;
- P1 / Критичные;
- Не по плану;
- Просрочен срок;
- Повторяющиеся.

Это готовые system views, не пользовательский query language. **R1.1:** custom filter builder. **R1.2:** natural-language filter creation.

---

# 39. COMPLETED — «Завершённые»

Выполненные задачи: доступны; searchable; восстановимы; grouped by date. Каждый выполненный occurrence повторяющейся серии — отдельная запись в истории. Completion animation спокойная.

---

# 40. DELETE MODEL

Обычная задача: Delete → immediate + Undo, без confirmation modal. Permanent bulk destructive action: confirmation (ST18). Повторяющаяся задача: выбор области (18.3).

---

# 41. OFFLINE-FIRST UX

Без соединения пользователь может: смотреть локальные задачи; создавать; изменять; выполнять. При восстановлении связи — sync.

---

# 42. ACCOUNT MODEL

Первое использование не требует регистрации. Onboarding: **«Начать»** (локально) / **«Войти»**. Sync между устройствами требует бесплатного аккаунта.

---

# 43. ACCOUNT CREATION TRIGGER

При включении Sync: «Сохраните ШАГИ между устройствами» → Email OTP; Яндекс ID; другие способы позднее. Регистрация не используется как onboarding-wall.

## 43.1. Local → existing account merge

Если пользователь уже создал локальные задачи и затем входит в аккаунт, где существуют облачные данные, запрещено молча заменять один набор другим.

UX:

> На этом устройстве 40 локальных задач. В аккаунте уже есть данные.

Actions:

- **Объединить** — default: локальные данные добавляются в аккаунт; сомнительные дубликаты сохраняются обе;
- **Не добавлять локальные** — облачный аккаунт открывается, локальный набор остаётся доступным до явного решения/экспорта;
- destructive discard локальных данных требует отдельного подтверждения.

Нужен state ST21 и FLOW 20.

---

## 43.2. DATA & PRIVACY — R1 UX REQUIREMENTS

В Settings должен существовать самостоятельный раздел **«Данные и конфиденциальность»**. Claude Design обязан предусмотреть:

- статус хранения: «Только на этом устройстве» / «Синхронизируется с аккаунтом»;
- ссылки на актуальные Пользовательское соглашение и Политику конфиденциальности;
- управление диагностикой/аналитикой, если такая обработка используется;
- экспорт данных;
- удаление локальных данных;
- удаление аккаунта и облачных данных с ясным описанием последствий;
- управление выданными разрешениями/интеграциями там, где платформа это позволяет;
- future R1.2: управление Smart/AI processing и понятное указание, когда данные уходят на удалённую обработку;
- future R3: управление голосовыми/мультимодальными данными.

Юридические тексты и конкретные consent-формулировки утверждаются отдельной юридической проверкой; дизайн не должен заставлять команду использовать dark patterns или объединять обязательное согласие с необязательным маркетинговым/аналитическим согласием.

---

# 44. MIGRATION (обязательная часть product design)

**R1:** Todoist export/import; generic CSV; structured backup import. **Future:** direct integrations.

Import flow: 1) источник → 2) файл → 3) analyse → 4) preview (Projects / Tasks / Labels / completed optionally) → 5) warnings → 6) import → 7) result summary. Нельзя импортировать молча без preview.

---

# 45. EXPORT / DATA OWNERSHIP

R1 Settings: **«Экспорт данных»** — переносимый формат. Это не Pro-функция.

## 45.1. Attachments & Links — R1b

R1b поддерживает:

- URL/link attachment;
- file/image attachment;
- открыть / скачать / удалить;
- pending upload при offline;
- retry / cancel для failed upload.

Link сохраняется локально сразу. Файл при offline отображается в Task Detail как локально добавленный с состоянием **«Ожидает загрузки»**; задача остаётся полностью редактируемой.

Comments не входят в R1 и появляются вместе с R1.3 Shared.

---

# 46. SYNC UX

При нормальной работе sync невидим. Статус показывается только при: sync pending слишком долго; conflict; server unavailable; authentication issue.

---

# 47. CONFLICT UX

Безопасный автоматический merge — молча. Если версии несовместимы: Device A version; Device B version; choose; preserve both при необходимости.

---

# 48. WIDGETS R1

Минимум concepts: **Today Widget** (ближайшие задачи); **Quick Add** (capture); **Focus Widget** (три главные задачи). Не проектировать десятки variants.

---

# 49. NOTIFICATIONS

**R1:** task reminder (одно на задачу); deadline approaching; deadline missed. **R1.1:** multiple reminders; advanced relative reminders. **R1.2:** smart planning suggestions.

Принцип: не отправлять уведомление просто потому, что приложение может. Каждый notification type отключается отдельно.

---

# 50. FREE / PRO PRINCIPLE

Free — полноценный задачник. Pro — усиление. Нельзя ухудшать базовый capture, sync или data ownership ради paywall.

## 50.1. Preliminary Free

Unlimited tasks; sync; Входящие; Сегодня; План; 10 active projects; sections; subtasks; чек-листы; basic labels; priorities; полная temporal-модель; recurrence; basic reminder; List; Board; basic internal calendar/agenda; search; NLP text input; widgets; import/export.

## 50.2. Preliminary Pro

Unlimited projects; advanced calendar; external calendar integration; advanced filters; advanced reminders; extensive history; advanced widgets; backup/version history; R1.2 Smart features; advanced themes; future location reminders. Тарифный состав может меняться без изменения IA.

## 50.3. Paywall Design

Contextual. Не использовать: постоянные banners; fake urgency; fake discounts; блокировку базовой задачи.

---

# 51. R1.1 — ADVANCED PLANNING

Добавляет: Calendar Day/Week/Month; drag task → timeline; resize duration; external calendars; unscheduled area; advanced filters; multiple reminders; advanced history; richer planning controls.

## 51.1. Calendar Entity Distinction

Task и external Calendar Event — разные сущности. Event имеет fixed calendar semantics; Task может быть completed. Различие мгновенное и не только цветом.

## 51.2. Time Blocking

Task: drag → calendar timeline → получает planned date + planned time + duration. Resize меняет duration; move меняет planned time/date. Undo обязателен.

## 51.3. Unscheduled Area

В Calendar Day/Week — зона «Без времени»: задачи выбранного дня без Planned Time.

---

# 52. R1.2 SMART

AI не становится отдельным главным разделом; появляется там, где у пользователя есть конкретная задача.

**Smart actions:** Break into steps; Next step; Estimate duration; Realistic Day; Unload Day; Plan My Day; Weekly Review.

**Smart rule:** до применения — preview. Основная кнопка «Применить», вторичная «Изменить».

**Realistic Day:** «На задачи запланировано 7 ч 40 мин. Реально свободно около 4 ч 20 мин.» CTA «Разгрузить день». Без accusatory tone.

## 52.1. Capacity model для Smart Planning

Чтобы число «реально свободно» не было магическим, R1.2 использует прозрачные источники:

1. пользовательский planning window по дням недели (настраиваемый; при первом Smart Planning предлагается простой default, который пользователь подтверждает);
2. внешние Calendar Events из R1.1, если интеграция включена;
3. уже time-blocked Tasks;
4. duration задач;
5. future: configurable buffers.

Если planning window не настроен и календарь не подключён, Smart не показывает псевдоточную свободную ёмкость: сначала предлагает настроить границы дня. Экран Smart Proposal должен уметь раскрыть короткое объяснение «Как посчитано».

**Weekly Review:** действия, а не только статистика (выполнено 31; 7 задач переносились больше двух раз; 12 без даты; 3 давно не менялись → к каждому пункту action).

---

# 53. R1.3 SHARED — PERSONAL COLLABORATION

R1.3 добавляет совместную работу **только на уровне явно выбранных проектов**. Это B2C/personal collaboration, а не корпоративная platform model.

## 53.1. Scope

- Share Project;
- invite по email и/или share-link;
- список участников;
- роли `Owner` и `Member`;
- один assignee у Task;
- comments в Task;
- activity внутри shared project;
- leave project;
- revoke invite / remove member;
- granular notification settings по shared project.

## 53.2. Не входит

Enterprise workspace, organization admin, departments, complex RBAC, timesheets, workload management, approvals, corporate dashboards.

## 53.3. Privacy boundary

По умолчанию все проекты private. Sharing включается только явным действием пользователя и действует только на выбранный Project. Остальные данные аккаунта не становятся видимыми участникам.

## 53.4. Data extension

```text
Project
├── sharing_mode        // private | shared
├── owner_id
├── members[]
└── invites[]

Task
├── assignee_id
├── comments[]
└── activity[]
```

## 53.5. Required concept frames

| ID | Frame | Acceptance criteria |
|---|---|---|
| SH01 | Share Project | Понятно, что делится только этот проект |
| SH02 | Invite | Email/link, pending state, revoke |
| SH03 | Members | Owner/Member различимы без enterprise-сложности |
| SH04 | Task / Assignee | Assignment не перегружает personal Task Detail |
| SH05 | Task / Comments | Comments вторичны относительно самой задачи |
| SH06 | Shared Activity | Полезная история без информационного шума |
| SH07 | Leave / Remove member | Последствия ясны до подтверждения |

---

# 54. R2 SIMPAS

Связанные объекты: Note; Client; Session; Moment; future entity.

**Task Detail R2** — секция «Связано»: «📝 Сессия 12 сентября · ЗАПИСКИ», «👤 Иван П. · ПРАКТИКА».

**Privacy for ПРАКТИКА:** sensitive actions требуют отдельной UX-модели; silent fuzzy matching запрещён: если существует несколько Иванов — пользователь выбирает конкретного.

---

# 55. R3 VECTOR

ВЕКТОР — не часть Task Manager Core, а общая capability экосистемы.

Pipeline: Input (voice / text / image / document / share) → Intent → Entity extraction → Router → Target app/action.

**Voice** отсутствует в R1, но Composer R1 не должен быть архитектурно тупиковым: future composer имеет Text / Voice / File / Image. Базовый ASR для русского голосового слоя ВЕКТОРА — **GigaAM**; это implementation choice и не должно визуально брендироваться в пользовательском UI. Дизайн voice-state должен поддерживать streaming/partial transcript.

Privacy-by-default для R3: исходное аудио не сохраняется после успешного распознавания, если пользователь отдельно не выбрал сохранение исходного вложения/голосовой заметки. Ошибка распознавания не должна приводить к скрытому долговременному хранению записи.

**Confidence model:** high — выполнить + Undo; medium — preview; low — короткое уточнение (только один необходимый вопрос).

---

# 56. DESIGN CHARACTER

ШАГИ: взрослые; лёгкие; технологичные; спокойные; премиальные; человеческие; быстрые; не стерильные.

**Не делать:** красный Todoist clone; Things clone; огромные gradients ради красоты; glassmorphism как основной UI; excessive cards; dashboard tiles; rainbow project overload; childish illustrations; confetti; gamification-first UI.

---

# 57. BRAND EXPRESSION

Название ШАГИ предполагает движение. Метафора движения — тонко: transition; completion; progress; sequencing. Не рисовать буквально следы ног или ступеньки по всему продукту.

---

# 58. COMPLETION MOTION

```text
○ → ✓
```

после чего задача мягко сворачивается/уходит. Ориентир 150–250 ms. Reduced Motion поддерживается.

---

# 59. TYPOGRAPHY

Task title — главный информационный объект. Metadata — secondary. Не использовать декоративный display font для рабочих списков.

---

# 60. DENSITY

Mobile: одна оптимальная density. Desktop: Comfortable; Compact.

---

# 61. ACCESSIBILITY

Обязательно: WCAG-совместимый contrast; keyboard focus; screen reader semantics; scalable type; touch targets минимум 44×44 logical px; reduced motion; color-independent semantics.

---

# 62. RESPONSIVE MODEL

Breakpoints: Mobile `< 600` · Tablet `600–1023` · Desktop `≥ 1024`.

## Canonical design frames

- **Mobile Primary:** 390 × 844.
- **Mobile Validation:** 360 × 800 (малый Android); 412 × 915 (крупный Android); 393 × 852 (современный iPhone class).
- **Tablet:** 834 × 1194 portrait; 1194 × 834 landscape validation.
- **Desktop Primary:** 1440 × 1024. **Desktop Minimum:** 1280 × 800. **Desktop Wide Validation:** 1920 × 1080.

---

# 63. GRID

**Mobile:** 16 px outer margins; spacing grid 4 / 8 / 12 / 16 / 24 / 32.

**Desktop:** Sidebar ≈ 240–280 px; task content — оптимальная readable width (не растягивать строки на весь 1920 px); Inspector ≈ 360–440 px. Точные значения определяются через component constraints.

---

# 64. DESIGN SYSTEM HIERARCHY

```text
00 Foundations
├── Colors · Typography · Spacing · Radius · Elevation · Motion · Icons · Breakpoints

01 Primitives
├── Button · IconButton · Input · Checkbox · Radio · Switch · Chip · Avatar · Divider · Tooltip

02 Navigation
├── MobileBottomNav · DesktopSidebar · TopBar · Breadcrumb · Tabs · CommandPalette

03 Task
├── TaskCheckbox · TaskRow · TaskMetadata · TaskFocusMarker · TaskDetail
├── SubtaskRow · ChecklistItem · TaskContextMenu

04 Planning
├── DateChip · TimeChip · DurationChip · DeadlineChip · ReminderChip · RecurrenceChip
├── DatePicker · CalendarTask · CalendarEvent · UnscheduledArea

05 Organization
├── ProjectRow · ProjectHeader · Section · BoardColumn · Label · Priority · Filter

06 Capture
├── QuickAdd · Composer · NLPToken · ParsingPreview

07 Overlay
├── BottomSheet · Modal · SideInspector · Menu · Popover

08 Feedback
├── Toast · UndoToast · EmptyState · Loading · ErrorState · OfflineState · SyncState

09 Account & Data
├── SyncStatus · LocalCloudStatus · PermissionRow · ConsentRow · DataExport · DestructiveDataAction

10 Smart — Future
11 Shared — Future
12 SIMPAS — Future
13 Vector — Future
```

---

# 65. COMPONENT NAMING

Системный naming: `Task/Row`, `Task/Row/Compact`, `Task/Checkbox`, `Task/Metadata/Deadline`, `Task/Metadata/Duration`, `Input/QuickAdd`, `Input/NLPToken`, `Navigation/Sidebar`, `Navigation/BottomNav`, `Calendar/TaskBlock`, `Calendar/EventBlock`.

Запрещены названия вида `Rectangle 245`, `Frame Copy 9`.

---

# 66. REQUIRED COMPONENT STATES

Для interactive components: Default · Hover · Pressed · Focus · Selected · Disabled · Loading · Error.

## Task Row states (отдельно)

Normal · Today · Focus · Missed Plan · Deadline Soon · Deadline Missed · Recurring · Completed · Selected · Dragging.

---

# 67. DESIGN FILE STRUCTURE

```text
00_README            // включая реестр принятых по ходу решений (см. раздел 0)
01_FOUNDATIONS
02_COMPONENTS
03_R1_MOBILE
04_R1_DESKTOP
05_R1_TABLET
06_R1_STATES
07_R1_PROTOTYPES
08_R1.1_PLANNING
09_R1.2_SMART
10_R1.3_SHARED
11_R2_SIMPAS
12_R3_VECTOR
13_RELEASE_MAP
14_HANDOFF
```

## Frame naming

```text
[R1][M][01] Today / Default
[R1][D][03] Inbox / Processing
[R1.1][D][02] Calendar / Week
[R1.2][M][01] Smart / Realistic Day
```

---

# 68. R1 MOBILE PRODUCTION FRAMES

| ID | Frame | Acceptance criteria |
|---|---|---|
| M01 | Launch / Local loading | Нет лишнего onboarding; загрузка спокойна; offline launch предусмотрен |
| M02 | Welcome | Видны «Начать» и «Войти»; регистрация не wall |
| M03 | Sign in | Email OTP + Яндекс ID; ошибка и loading предусмотрены |
| M04 | First task onboarding | Пользователь сразу создаёт реальную задачу |
| M05 | NLP onboarding | Понятно, что можно написать «врач завтра в 11» |
| M06 | Today / Empty | Дата, Quick Add, спокойное empty state |
| M07 | Today / Normal | Focus + timed + untimed читаются без шума |
| M08 | Today / Dense | 20+ задач остаются управляемыми; default-sort не ломает manual order |
| M09 | Today / Missed plan | Отдельная группа «Не по плану» под deadline-group; bulk «Перенести всё» |
| M10 | Today / Deadline missed | Отдельная верхняя группа «Просрочен срок»; не смешана с «Не по плану» |
| M11 | Focus selection | Выбор/снятие до 3 focus tasks; поведение 4-й попытки (замена) |
| M12 | Inbox / Default | Captured tasks без обязательной структуры; вход через header-иконку Today |
| M13 | Inbox / Process mode | Одна задача → Дата / Проект / Сегодня / Удалить / Пропустить |
| M14 | Plan / Agenda | Будущие дни легко сканируются; Available-From задачи с маркером |
| M15 | Plan / Date selected | Видны задачи выбранного дня |
| M16 | Projects / List | Открыть, создать, reorder; доступ к архиву проектов |
| M17 | Project / List view | Sections + tasks + Quick Add работают вместе |
| M18 | Project / Board | Sections = columns; колонка «Без раздела» при необходимости |
| M19 | Project / Empty | Понятный CTA создать первую задачу |
| M20 | Quick Add / Empty | От открытия до ввода нет лишнего шага; inherited context видим и редактируем |
| M21 | Quick Add / NLP parsed | Date/time/project tokens визуально распознаны и редактируемы |
| M22 | Quick Add / Ambiguous | Нет скрытого выбора; suggestion показан |
| M23 | Quick Add / Expanded | Advanced metadata доступна, не мешая простому capture |
| M24 | Task Detail / Simple | Простая задача не выглядит сложной |
| M25 | Task Detail / Full | Все temporal fields с ясной hierarchy; блоки «Подзадачи» и «Чек-лист» раздельны |
| M26 | Task Detail / Recurring | Recurrence semantics видна; диалог «Это повторение / Вся серия» |
| M27 | Date Picker | Сегодня/Завтра/Выходные shortcuts + calendar |
| M28 | Planning Advanced | Время + Длительность + Срок + Доступно с — progressive disclosure; показаны warning/blocking temporal conflicts |
| M29 | Recurrence Picker / Basic | Частые сценарии одним tap |
| M30 | Recurrence Picker / Advanced | Calendar vs completion anchor понятно различаются |
| M31 | Reminder Picker | Reminder семантически отделён от planned time |
| M32 | Priority Picker | P1–P4 понятно и компактно |
| M33 | Labels Picker | Search/create/select не перегружены |
| M34 | Search / Empty | Search сразу доступен |
| M35 | Search / Results | Tasks/projects/completed различимы |
| M36 | Completed | История читаема; обычные задачи restore; recurring occurrence соблюдает §18.5 и не создаёт двойную активную серию |
| M37 | Multi-select | Bulk actions без хаоса |
| M38 | Context Menu | Частые действия выше редких; destructive отделено; «Когда будет время» присутствует |
| M39 | Offline | Понятно, что локальная работа продолжается |
| M40 | Sync issue | Понятно, что не синхронизировано и что делать; attachment pending не блокирует Task |
| M41 | Settings / Root | Логичная структура; настройка «Утро/День/Вечер» для NLP |
| M42 | Appearance | Light/Dark/System + density where applicable |
| M43 | Notifications | Granular controls |
| M44 | Account / Local mode | Понятно, какие данные локальны |
| M45 | Enable Sync | Польза аккаунта ясна; это не paywall; предусмотрен local→existing-account merge |
| M46 | Import / Source | Todoist / CSV ясно представлены |
| M47 | Import / Preview | Объекты и предупреждения видны до import |
| M48 | Import / Result | Импортировано/пропущено — понятно |
| M49 | Export | Data ownership очевиден; не paywalled |
| M50 | Pro / Contextual | Конкретная ценность, без dark patterns |
| M51 | Data & Privacy | Local/cloud status, export, permissions, legal links и analytics controls понятны |
| M52 | Delete Account / Data | Последствия разделены: удалить локальные данные / удалить аккаунт; destructive action подтверждается |

---

# 69. R1 DESKTOP PRODUCTION FRAMES

| ID | Frame | Acceptance criteria |
|---|---|---|
| D01 | Today / Default | Sidebar + list + optional inspector — цельная workspace |
| D02 | Today / Compact density | Больше информации без шума |
| D03 | Today / Focus | Focus отличается от Priority |
| D04 | Inbox | Capture и processing без navigation churn |
| D05 | Inbox / Process | Полный keyboard workflow |
| D06 | Plan / Agenda | Будущее читается при большой плотности |
| D07 | Projects | Sidebar не конкурирует с content |
| D08 | Project / List | Sections, reorder, inline add |
| D09 | Project / Board | Columns используют sections |
| D10 | Task Inspector / Simple | Не закрывает основной контекст |
| D11 | Task Inspector / Full | Temporal model полностью доступна; conflicts/warnings и attachments/links предусмотрены |
| D12 | Quick Add / Global | Вызывается из любого места |
| D13 | Quick Add / Parsed | NLP tokens и inherited context редактируемы клавиатурой |
| D14 | Global Search | Без ухода с текущего экрана |
| D15 | Command Palette | Единая command model |
| D16 | Multi-select | Bulk actions ясны |
| D17 | Completed | История searchable |
| D18 | Import Preview | Большой объём данных хорошо сравнивается |
| D19 | Settings | Не растянутый mobile |
| D20 | Offline / Sync conflict | Решается без потери контекста |

---

# 70. TABLET PRODUCTION CHECK

Не дублировать каждый mobile frame. Обязательно: T01 Today Portrait · T02 Today Landscape · T03 Project + Inspector · T04 Board Landscape · T05 Task Detail · T06 Plan.

Критерий: tablet использует дополнительную площадь, а не увеличивает mobile UI.

---

# 71. R1.1 PLANNING FRAMES

| ID | Frame | Acceptance criteria |
|---|---|---|
| P01 | Calendar / Day | Task и Event мгновенно различаются |
| P02 | Calendar / Week | 5–7 дней читаемы |
| P03 | Calendar / Month | Month не превращается в микротекст |
| P04 | Unscheduled Area | Untimed tasks легко перетянуть на timeline |
| P05 | Drag to Calendar | Drop preview показывает новое время |
| P06 | Resize Task | Duration меняется очевидно |
| P07 | External Calendar Setup | Понятно, какие календари подключаются |
| P08 | Calendar Conflict | Overlap визуально понятен |
| P09 | Advanced Filters | Builder понятен без языка запросов |
| P10 | Multiple Reminders | Несколько reminders читаемы и управляемы |

---

# 72. R1.2 SMART CONCEPT FRAMES

High-fidelity concept-ready, но не implementation scope R1.

| ID | Frame | Acceptance criteria |
|---|---|---|
| S01 | Realistic Day | Показывает проблему без осуждения |
| S02 | Unload Day | Каждое изменение видно до применения |
| S03 | Plan My Day | Preview расписания обязателен |
| S04 | Break Into Steps | AI-result редактируем перед save |
| S05 | Next Step | Один конкретный следующий action |
| S06 | Estimate Duration | Recommendation не выглядит как факт |
| S07 | Weekly Review | Из статистики следуют actions |
| S08 | Smart Filter | Natural language → понятный filter preview |

---

# 73. R2 SIMPAS CONCEPT FRAMES

| ID | Frame | Acceptance criteria |
|---|---|---|
| E01 | Task / Linked Objects | SIMPAS objects не перегружают задачу |
| E02 | Link Object Picker | Понятен тип объекта и приложение-источник |
| E03 | Linked Note | Переход в ЗАПИСКИ очевиден |
| E04 | Linked Practice Client | Sensitive object визуально отличается |
| E05 | Ambiguous Client | Silent fuzzy selection невозможен |
| E06 | SIMPAS Settings | Connections включаются/отключаются независимо |

---

# 74. R3 VECTOR CONCEPT FRAMES

| ID | Frame | Acceptance criteria |
|---|---|---|
| V01 | Composer / Multimodal | Text остаётся простым после новых inputs |
| V02 | Voice Listening | Видно, что recording активен |
| V03 | Live Parsing | Intent/entities без перегруза |
| V04 | High Confidence Result | Быстро + Undo |
| V05 | Medium Confidence Preview | Можно исправить target/date/object |
| V06 | Low Confidence Clarification | Только один необходимый вопрос |
| V07 | Cross-App Result | Ясно, что объект создан в другом продукте |

---

# 75. SYSTEM STATE FRAMES

```text
ST01 Loading             ST12 Account expired
ST02 Empty               ST13 Import partial failure
ST03 Offline             ST14 Long title
ST04 Reconnecting        ST15 50 tasks in Today
ST05 Sync pending        ST16 200 projects desktop
ST06 Sync conflict       ST17 No search results
ST07 Error recoverable   ST18 Destructive confirmation
ST08 Error unrecoverable ST19 Temporal conflict / warning
ST09 Permission denied   ST20 Attachment upload pending / failed
ST10 Notification permission
ST11 Calendar permission ST21 Local + existing account merge
```

---

# 76. REQUIRED PROTOTYPE FLOWS

- **FLOW 01 — First task.** Launch → Start locally → Today → «+» → «Купить хлеб» → task в Сегодня за счёт inherited context. Acceptance: не более 3 экранов от холодного запуска до первой сохранённой задачи.
- **FLOW 02 — NLP Capture.** Quick Add «Позвонить врачу завтра в 11» → parser identifies date/time → preview → save (токены удалены из title).
- **FLOW 03 — Complex task.** Quick Add → дата → длительность → срок → проект → save.
- **FLOW 04 — Inbox Zero.** Входящие → Разобрать → Сегодня / Проект / удалить лишнее → пустой Inbox.
- **FLOW 05 — Today Execution.** Сегодня → открыть → выполнить → Undo.
- **FLOW 06 — Missed Plan.** Вчерашняя задача → группа «Не по плану» → перенос на сегодня/завтра (per-task и bulk).
- **FLOW 07 — Deadline Missed.** Deadline прошёл → явно иное состояние → перепланировать / изменить срок / выполнить.
- **FLOW 08 — Project Planning.** Проект → section → задача → подзадача → reorder.
- **FLOW 09 — Board.** List → Board → drag между sections → возврат в List с теми же данными.
- **FLOW 10 — Search.** Поиск → старая выполненная задача → открыть → восстановить.
- **FLOW 11 — Migration.** Settings/Onboarding → Todoist import → preview → import → result.
- **FLOW 12 — Enable Sync.** Локальный пользователь → включить sync → создать аккаунт → успешный sync.
- **FLOW 13 — R1.1 Time Blocking.** Unscheduled task → drag calendar → resize → Undo.
- **FLOW 14 — R1.2 Smart.** Перегруженный день → Разгрузить → preview изменений → approve.
- **FLOW 15 — R2 Linked Object.** Задача → Link → ЗАПИСКИ → Note.
- **FLOW 16 — R3 Vector.** Voice → intent parse → create Task → result + Undo.
- **FLOW 17 — Recurring edit.** Повторяющаяся задача → изменить время → диалог «Это повторение / Вся серия» → результат в обоих случаях.
- **FLOW 18 — Contextual Quick Add.** Создать задачу из Сегодня / выбранной даты Плана / Проекта / global shortcut → inherited chips различаются предсказуемо → явное поле пользователя переопределяет context.
- **FLOW 19 — Recurring completed action.** Выполнить occurrence → создан следующий → открыть старый в Завершённых → вместо unsafe Restore предложено «Создать отдельную копию».
- **FLOW 20 — Local → existing account.** Создать локальные задачи → войти в аккаунт с облачными данными → экран merge → «Объединить» → оба набора доступны без потери.

---

# 77. KEYBOARD DESKTOP REQUIREMENTS

Actions для: Quick Add; complete task; open task; move selection; search; command palette; date assignment; project move; cancel; save. Shortcuts не показываются постоянно; hints — contextual.

---

# 78. COMMAND PALETTE

`Cmd/Ctrl + K`. Capabilities: Go to Today; Open Project; Search Task; New Task; Move Task; Change Date; Complete; Settings. R1.

---

# 79. COPY STYLE

Коротко. По-человечески. Без корпоративного языка.

**Хорошо:** «На сегодня всё.» · «Перенести на завтра?» · «Нет соединения. Изменения сохранятся на устройстве.» · «Не удалось синхронизировать. Попробуем снова автоматически.»

**Плохо:** «No pending actionable items.» · «Task rescheduling operation.» · «Synchronization error #4932.»

## Глоссарий (модель ↔ русский UI)

| Модель | UI |
|---|---|
| Today | Сегодня |
| Plan | План |
| Inbox | Входящие |
| Today Focus | Главное |
| Planned Date/Time | Запланировано |
| Duration | Длительность |
| Deadline | Срок («до …») |
| Available From | Доступно с |
| Reminder | Напоминание |
| Recurrence | Повтор |
| Missed Plan | Не по плану |
| Missed Deadline | Просрочен срок |
| Subtask | Подзадача |
| Checklist | Чек-лист |
| Completed | Завершённые |
| Shared Project | Общий проект / Совместный проект (финальный copy — после теста) |

Названия могут уточняться copy testing, но пары «Срок ≠ Запланировано» и «Не по плану ≠ Просрочен срок» неприкосновенны.

---

# 80. EMPTY STATES

Не злоупотреблять иллюстрациями. Примеры: Сегодня → «На сегодня всё.»; Входящие → «Входящие разобраны.»; Проект → «Здесь пока нет задач.» CTA конкретный.

---

# 81. MICROINTERACTIONS

Обязательно показать: task completion; undo; drag; reorder; Quick Add expand; inspector opening; NLP token recognition; time block resize; focus selection.

---

# 82. PERFORMANCE PERCEPTION

Не использовать patterns, создающие ощущение медленного приложения: unnecessary full-screen loaders; heavy transitions; ожидание после каждого локального действия. Local interaction выглядит мгновенной.

---

# 83. LEGAL / IP CONSTRAINT

Можно использовать распространённые UX-patterns: Inbox; Today; boards; calendar; quick add; NLP input; drag & drop.

Нельзя воспроизводить один-в-один: Todoist UI; Things UI; proprietary iconography; фирменные animations; уникальную visual composition конкурента; branded terminology.

Критерий: пользователь Todoist должен сразу понимать ШАГИ, но не воспринимать их как перекрашенный Todoist.

---

# 84. DESIGN REVIEW CHECKLIST

**Architecture:** все R1 сущности имеют UI; нет тупиков для R1.1–R3; Task Detail расширяем; Composer расширяем; Navigation расширяема.

**Logic:** Planned Date ≠ Deadline; Reminder ≠ Planned Time; Priority ≠ Today Focus; Inbox = project_id=null; Focus привязан к дате; Section = Board Column representation; Event ≠ Task; missed plan ≠ missed deadline; подзадача ≠ чек-лист; context inheritance видим; temporal constraints соблюдены.

**UX:** простая задача остаётся простой; advanced task возможна; 50 задач не ломают Сегодня; offline не блокирует работу; guest mode существует; local→account merge безопасен; migration существует; recurring edit имеет выбор области; completed recurring occurrence не создаёт двойной active occurrence.

**Design:** light/dark; compact desktop; keyboard focus; accessibility; mobile/tablet/desktop; no competitor clone.

---

# 85. R1 DEFINITION OF DONE — DESIGN

R1 Design завершён только если:

1. Есть все M01–M52.
2. Есть все D01–D20.
3. Есть T01–T06.
4. Есть system states ST01–ST21.
5. Есть reusable component library.
6. Есть Light и Dark.
7. Есть clickable critical flows (минимум FLOW 01–12 и FLOW 17–20).
8. Есть responsive rules.
9. Есть design tokens.
10. Есть component states.
11. Нет необъяснённых placeholders.
12. Нет `TBD`.
13. Все R1.1/R1.2/R1.3/R2/R3 extension points проверены concept screens.
14. Каждый frame имеет release tag.
15. Каждый interactive element использует системный component.
16. Layout проверен минимум на canonical + minimum viewport.

---

# 86. R1 DEFINITION OF SUCCESS — PRODUCT

Одна система обслуживает троих:

- **Пользователь A** использует только Сегодня, Входящие, «+» — и продукт кажется простым.
- **Пользователь B** использует Проекты, Sections, повторы, сроки, длительность — и продукт кажется достаточно мощным.
- **Пользователь C** использует клавиатуру, фильтры, календарь, time blocking, Smart — и продукт не кажется упрощённым consumer todo list.

Продуктовые метрики для валидации (не дизайн-требования, но дизайн не должен им мешать): время capture с экрана Сегодня ≤ 5 секунд; время «открыл утром → понял день» ≤ 10 секунд; доля задач, созданных через NLP-токены, — растущая.

---

# 87. NORTH STAR TEST

Для любого элемента интерфейса:

> Помогает ли это быстрее зафиксировать действие, понять план или выполнить задачу?

Если нет — элементу нужна очень веская причина существовать.

---

# 88. ПРИОРИТЕТ ПРИ ДИЗАЙНЕРСКОМ КОНФЛИКТЕ

По убыванию: 1) ясность; 2) скорость; 3) когнитивная лёгкость; 4) consistency; 5) accessibility; 6) functional depth; 7) aesthetics; 8) wow-effect.

---

# 89. ФИНАЛЬНАЯ DESIGN FORMULA

Не создавать «Todoist для России». Создать:

> **ШАГИ — самостоятельный современный персональный инструмент, который делает сложное управление делами визуально простым.**

**Things-level calmness × Todoist-level capture speed × Sunsama-level respect for real time × SIMPAS-level future intelligence = ШАГИ**

---

# 90. ГЛАВНЫЙ КРИТЕРИЙ

Утром пользователь открывает ШАГИ и через несколько секунд понимает: **«Вот что мне нужно делать сегодня.»** Днём новая мысль попадает в систему за несколько секунд. Вечером приложение не требует «обслуживать систему». Это ощущение — главный продуктовый результат дизайна.

---

# ПРИЛОЖЕНИЕ A. РЕЕСТР ПРИНЯТЫХ РЕШЕНИЙ (v2.0 → v4.0 FINAL)

Каждое решение приводится с рассмотренными вариантами. Решения нормативны; изменение любого из них требует пересмотра связанных разделов.

## A1. Подзадачи и чек-лист (§12.1)

Проблема: v2.0 содержала обе сущности без определения различия — прямой источник путаницы.
Варианты: (а) только подзадачи (модель Todoist); (б) только чек-лист (модель Things); (в) обе с жёстким водоразделом.
Решение: **(в)**. Подзадача = полноценная Task (даты, приоритет, появление в Сегодня), **R1 UX** ограничен одним уровнем; data model не запрещает future-глубину. Чек-лист = строки без метаданных внутри задачи; конверсия item → subtask обязательна. Обоснование: покрывает и «декомпозицию проекта» (B-пользователь), и «список покупок внутри задачи» (A-пользователь), не заставляя лёгкий сценарий платить сложностью.

## A2. Группа «Когда будет время» (§22)

Проблема: правило попадания не было определено; автопривязка к P4 невозможна (P4 — приоритет по умолчанию).
Варианты: (а) убрать из R1; (б) автоправило по приоритету; (в) только ручное попадание через presentation-атрибут дня.
Решение: **(в)**: `day_bucket=later`, установка drag'ом или контекстным действием, сброс при смене Planned Date, группа скрыта пока пуста. Не статус и не приоритет — соблюдён запрет v2.0.

## A3. Архитектура recurrence (§18.2–18.3)

Проблема: не определено, являются ли occurrences реальными записями; отсутствовал UX области изменения.
Варианты: (а) виртуальные повторения, генерируемые на лету; (б) серия + материализованный текущий occurrence.
Решение: **(б)** — история и Завершённые работают без спецлогики, выполненный occurrence неизменяем. Добавлен обязательный диалог «Это повторение / Вся серия» и FLOW 17. Подзадачи/чек-лист пересоздаются в новом occurrence невыполненными.

## A4. Размещение missed plan (§9, §22)

Проблема: состояние требовалось (FLOW 06), место на экране — нет.
Варианты: (а) вперемешку с сегодняшними задачами с маркером; (б) отдельная закреплённая группа вверху Сегодня; (в) отдельный экран.
Решение: **(б)** — «Не по плану» остаётся отдельной нейтральной группой с bulk-переносом. В v4.0 задачи с прошедшим Deadline вынесены в самостоятельную группу «Просрочен срок» выше неё; два состояния не смешиваются.

## A5. Вход во Входящие на mobile (§20)

Проблема: «через Today» без конкретики.
Решение: header-иконка с бейджем на Сегодня (только при непустом Inbox) + закреплённая строка в Проектах + системный shortcut. Inbox определяется `project_id == null`; toast «Сохранено во Входящие» используется только при contextless capture без Project.

## A6. Природа и грамматика NLP (§28)

Проблема: «без AI-зависимости» в шапке не было связано с NLP-разделом; грамматика и судьба токенов в title не определены.
Решение: детерминированный rule-based парсер, работающий офлайн; явная грамматика токенов (в т.ч. маркер «до …» = deadline, `#` = проект, `@` = метка); принятые токены **удаляются из title при сохранении**; неоднозначность всегда → suggestion, никогда → скрытый выбор.

## A7. Типы и лимиты полей

- Deadline = дата с опциональным временем; без времени = конец дня (§8.5).
- Reminder в R1 — один на задачу; массив в модели сохранён под R1.1 (§8.6, §49).
- Duration — минуты (§8.4).

## A8. Board «Без раздела» (§15)

Задачи без section — первая колонка «Без раздела», видимая только при непустоте.

## A9. Четвёртая focus-задача (§17)

Спокойная подсказка + предложение замены; автосброс focus при переносе даты.

## A10. Квантификация capture (§6 P1, FLOW 01)

«Минимально необходимое число действий» заменено измеримым: ≤ 3 действия с экрана Сегодня; ≤ 3 экрана от холодного запуска.

## A11. Скоуп R1 (§11)

Авторское решение v2.0 (полная temporal-модель в R1) **сохранено** — оно явно фиксирует исправление противоречия предыдущего brief. Риск объёма купирован внутренними вехами R1a/R1b, не меняющими дизайн-скоуп.

## A12. Глоссарий терминов (§79)

Введён нормативный словарь модель ↔ русский UI; пары «Срок ≠ Запланировано» и «Не по плану ≠ Просрочен срок» зафиксированы как неизменяемые.

## A13. Контекстный Quick Add и семантика Inbox

Проблема: v3.0 одновременно требовала, чтобы «+» без даты/проекта уходил во Входящие, и чтобы FLOW 01 создавал первую простую задачу в Сегодня.
Решение: Composer наследует контекст точки вызова; Inbox определяется исключительно `project_id == null`. Поэтому Task может одновременно быть во Входящих и отображаться в Сегодня/Плане.

## A14. Deadline-group отдельно от «Не по плану»

Проблема: v3.0 визуально различала два состояния, но могла помещать их в одну верхнюю группу.
Решение: две отдельные условные группы. «Просрочен срок» выше, «Не по плану» ниже. Bulk-перенос существует только у «Не по плану».

## A15. Focus привязан к дате

`is_today_focus` заменён на `focus_date`. Это устраняет некорректное состояние после полуночи и делает day-planning однозначным.

## A16. Default sorting Today

Priority не переставляет задачи автоматически. У каждой группы определён default-order; ручной `sort_order` сохраняется. Priority — явный alternate sort.

## A17. Temporal constraints

Зафиксированы невозможные комбинации, warning-комбинации и ST19. Planned after Deadline остаётся допустимым с предупреждением, поскольку это необходимо для перепланирования уже просроченной задачи.

## A18. R1.3 Shared

Совместная работа возвращена в конечную концепцию как самостоятельный B2C-слой ШАГОВ, независимый от СИМПАС. Scope ограничен shared projects, members, assignment, comments/activity; enterprise work-management исключён.

## A19. Attachments / Links

Attachments и Links получили явный scope: R1b. Offline file upload имеет pending/failed state; comments появляются только с R1.3.

## A20. Recurrence restore

Completed occurrence не может молча возвращаться в active-series, если следующий occurrence уже создан. В этом случае предлагается создать отдельную non-recurring копию.

## A21. Locale / timezone

R1 использует ru-RU, Monday-first, 24h и floating local task time. Today/Focus переключаются по локальной полуночи.

## A22. Local → existing account merge

Вход в существующий аккаунт после локального использования не имеет destructive default. Основное действие — «Объединить»; локальные данные нельзя молча потерять.

## A23. Future integration surface

Capture/Settings должны расширяться под Telegram, MAX, email, OS Share, wearables, API и webhooks без изменения базовой IA; эти интеграции не входят в R1.

## A24. Подзадачи: UX-лимит ≠ архитектурный лимит

R1 UI ограничивает вложенность одним уровнем, но data model/component architecture не должны навечно запрещать большую глубину.

## A25. Task Archive semantics

R1 не имеет индивидуального archived-статуса Task: active / completed / delete+Undo. «Архив» относится к Projects. Это устраняет неописанное состояние задачи и лишний UX.

## A26. R1 offline boundary

Офлайн обязательны core task operations и deterministic NLP. Sync, account, external auth и cloud upload объективно network-bound и должны деградировать, а не блокировать локальную работу.

## A27. Smart capacity transparency

Realistic Day считает свободное время только из явно известных источников: planning window, Calendar Events, time blocks и durations. При недостатке данных Smart сначала просит настройку, а не показывает псевдоточную оценку.

## A28. Data & Privacy UX

R1 получает отдельный Settings-раздел для local/cloud status, export/delete, legal links и controls обработки данных. Future AI/Vector обязаны расширять этот раздел, а не создавать скрытые data flows.

## A29. VECTOR ASR baseline

Для русского voice-layer принят GigaAM. Это не брендовая UI-фича, а implementation baseline; Voice UI проектируется под streaming partial transcript и privacy-by-default без хранения исходного аудио после успешного распознавания.

