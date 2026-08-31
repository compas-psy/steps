import type { IconDefinition, IconPrimitive } from './types.js';

/**
 * Реестр контуров (E03.0). Источники:
 *
 * - Первые 15 записей (`search` … `list`) — геометрия взята из бандла
 *   СИМПАС (`docs/spec/DESIGN/ШАГИ-handoff_design_v2.zip` →
 *   `_ds/.../_ds_bundle.js`, компонент `components/icons/Icon.jsx`,
 *   таблица `P`), это именно то подмножество, которое `.ultraplan/
 *   research/02-ui.md` §2.2 называет пригодным для задачника
 *   («add, search, filter, archive, delete, close, back, more, share,
 *   import, export, save, attach, list, tags, sync» — из них взято всё,
 *   кроме `save`: у него нет ни одного места в матрице экранов, «Сохранить»
 *   в прототипе — текст на кнопке, не иконка). Координаты скопированы
 *   как есть, `more` и `list` — с поправкой: точки-акценты в бандле были
 *   залиты (`fill: currentColor, stroke: none`), здесь они нарисованы
 *   штрихом нулевой длины с круглым концом (`line` из точки в ту же
 *   точку) — тот же визуальный результат без единой заливки, что и
 *   требует §12 (линейное семейство) и гейт адгезии.
 * - Остальные — дорисованы заново под ШАГИ (открытый вопрос 7 в
 *   `02-ui.md` §10: этих глифов в бандле нет вовсе). Ни один контур не
 *   скопирован из чужого набора иконок (ТЗ §14) — геометрия посчитана
 *   с нуля под сетку 24×24 и толщину 1.75 этого реестра.
 *
 * Комментарий у каждой записи — экран(ы) матрицы (`02-ui.md` §3), где
 * иконка нужна, не пересказ фигуры.
 */
export const ICON_DEFINITIONS = [
  // ── Взято из бандла СИМПАС ──────────────────────────────────────────
  {
    // Поиск: M34 Search Empty, M35 Search Results, D14 Search.
    name: 'search',
    primitives: [
      { tag: 'circle', cx: 10.5, cy: 10.5, r: 6.5 },
      { tag: 'line', x1: 15.5, y1: 15.5, x2: 21, y2: 21 },
    ],
  },
  {
    // Быстрое добавление: FAB на Today (M07), инлайн-добавление в
    // проекте (M17), Global Quick Add (D12).
    name: 'add',
    primitives: [
      { tag: 'circle', cx: 12, cy: 12, r: 9 },
      { tag: 'line', x1: 12, y1: 8, x2: 12, y2: 16 },
      { tag: 'line', x1: 8, y1: 12, x2: 16, y2: 12 },
    ],
  },
  {
    // Сохранённые фильтры: пункт sidebar «Фильтры» (04 §9, D01).
    name: 'filter',
    primitives: [{ tag: 'polygon', points: '3 4 21 4 14 12.5 14 18 10 20 10 12.5 3 4' }],
  },
  {
    // M46 Import Source, M47 Import Preview, D18 Import Preview.
    name: 'import',
    primitives: [
      { tag: 'path', d: 'M12 3v12' },
      { tag: 'polyline', points: '8 11 12 15 16 11' },
      { tag: 'path', d: 'M4 19h16' },
    ],
  },
  {
    // M49 Export (полный backup + CSV).
    name: 'export',
    primitives: [
      { tag: 'path', d: 'M12 15V3' },
      { tag: 'polyline', points: '8 7 12 3 16 7' },
      { tag: 'path', d: 'M4 19h16' },
    ],
  },
  {
    // Передача экспортированного файла через OS share sheet — платформенный
    // `SharePort` (`00_MASTER_IMPLEMENTATION_TZ.md` §4), кнопка «Отправить»
    // на M49 Export.
    name: 'share',
    primitives: [
      { tag: 'circle', cx: 6, cy: 12, r: 2.5 },
      { tag: 'circle', cx: 18, cy: 6, r: 2.5 },
      { tag: 'circle', cx: 18, cy: 18, r: 2.5 },
      { tag: 'line', x1: 8.3, y1: 10.9, x2: 15.7, y2: 7.1 },
      { tag: 'line', x1: 8.3, y1: 13.1, x2: 15.7, y2: 16.9 },
    ],
  },
  {
    // Архивирование (не путать с папкой проекта — `folder`): пункт
    // ProjectArchive/Delete sheet (§2.1), M38 Context Menu.
    name: 'archive',
    primitives: [
      { tag: 'rect', x: 2, y: 3, width: 20, height: 5, rx: 1 },
      { tag: 'path', d: 'M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' },
      { tag: 'line', x1: 10, y1: 13, x2: 14, y2: 13 },
    ],
  },
  {
    // M37 Multi-select, M38 Context Menu, M52 Delete Data/Account.
    name: 'delete',
    primitives: [
      { tag: 'path', d: 'M4 6h16' },
      { tag: 'path', d: 'M6 6v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6' },
      { tag: 'path', d: 'M9 3h6' },
      { tag: 'line', x1: 10, y1: 10, x2: 10, y2: 16 },
      { tag: 'line', x1: 14, y1: 10, x2: 14, y2: 16 },
    ],
  },
  {
    // Закрытие оверлеев/шитов: M13 Inbox Process, M23 Quick Add Expanded.
    name: 'close',
    primitives: [
      { tag: 'line', x1: 6, y1: 6, x2: 18, y2: 18 },
      { tag: 'line', x1: 18, y1: 6, x2: 6, y2: 18 },
    ],
  },
  {
    // Навигация назад: M24/M25 Task Detail, M51 Data & Privacy, D19 Settings.
    name: 'back',
    primitives: [{ tag: 'polyline', points: '14 18 8 12 14 6' }],
  },
  {
    // Вложения: M25 Task Detail Full («attachments/links»).
    name: 'attach',
    primitives: [
      {
        tag: 'path',
        d: 'M15.5 3.5a3.5 3.5 0 0 1 0 5l-9 9a2.5 2.5 0 0 1-3.5-3.5l9-9a1.5 1.5 0 0 1 2 2l-7 7',
      },
    ],
  },
  {
    // Метки: M33 Labels, чипы меток на M25 Task Detail Full.
    name: 'tags',
    primitives: [
      { tag: 'path', d: 'M3 6.5V3h3.5L20 16.5 16.5 20 3 6.5Z' },
      { tag: 'circle', cx: 7, cy: 7, r: 1.5 },
    ],
  },
  {
    // Меню действий (overflow): M38 Context Menu, D10 Inspector.
    name: 'more',
    primitives: [
      { tag: 'line', x1: 12, y1: 5, x2: 12, y2: 5 },
      { tag: 'line', x1: 12, y1: 12, x2: 12, y2: 12 },
      { tag: 'line', x1: 12, y1: 19, x2: 12, y2: 19 },
    ],
  },
  {
    // Статус синхронизации: M40 Sync Issue, M45 Enable Sync, D20 Offline/Conflict.
    name: 'sync',
    primitives: [
      { tag: 'polyline', points: '4 10 1 7 4 4' },
      { tag: 'path', d: 'M1 7h15a5 5 0 0 1 5 5' },
      { tag: 'polyline', points: '20 14 23 17 20 20' },
      { tag: 'path', d: 'M23 17H8a5 5 0 0 1-5-5' },
    ],
  },
  {
    // Список/переключатель List-Board: вкладка «Сегодня» в нижней
    // навигации, M17 Project List vs M18 Project Board.
    name: 'list',
    primitives: [
      { tag: 'line', x1: 9, y1: 6, x2: 20, y2: 6 },
      { tag: 'line', x1: 9, y1: 12, x2: 18, y2: 12 },
      { tag: 'line', x1: 9, y1: 18, x2: 20, y2: 18 },
      { tag: 'line', x1: 5, y1: 6, x2: 5, y2: 6 },
      { tag: 'line', x1: 5, y1: 12, x2: 5, y2: 12 },
      { tag: 'line', x1: 5, y1: 18, x2: 5, y2: 18 },
    ],
  },

  // ── Дорисовано под ШАГИ (в бандле СИМПАС этих глифов нет) ───────────
  {
    // Повтор: M26 Recurring detail, M29 Recurrence Basic, M30 Recurrence
    // Advanced, бейдж повторяющейся задачи на Today. Один непрерывный
    // виток с одной стрелкой — отличать от `sync` (два витка, две
    // стрелки, другой процесс) при общем «циклическом» языке.
    name: 'repeat',
    primitives: [
      { tag: 'path', d: 'M19 12A7 7 0 1 1 12 5' },
      { tag: 'polyline', points: '8 2 13 5 8 8' },
    ],
  },
  {
    // Приоритет P1–P4: M32 Priority, бейдж приоритета на Task Detail.
    // Флажок-вымпел с вырезом — отличать по силуэту от `deadline`
    // (прямоугольный флаг с клеткой), тот же способ «флаг = флаг на
    // древке», что и ниже.
    name: 'priority',
    primitives: [
      { tag: 'line', x1: 6, y1: 3, x2: 6, y2: 21 },
      { tag: 'path', d: 'M6 4h11l-4 4 4 4H6Z' },
    ],
  },
  {
    // Флаг дедлайна: усиленное «Просрочен срок» (M10 Deadline Missed),
    // бейдж дедлайна на Task Detail. Клетчатый прямоугольный флаг —
    // финишная клетка, читается как «срок», а не «важность» (`priority`).
    name: 'deadline',
    primitives: [
      { tag: 'line', x1: 6, y1: 3, x2: 6, y2: 21 },
      { tag: 'rect', x: 6, y: 4, width: 12, height: 8 },
      { tag: 'line', x1: 10, y1: 4, x2: 10, y2: 12 },
      { tag: 'line', x1: 14, y1: 4, x2: 14, y2: 12 },
      { tag: 'line', x1: 6, y1: 8, x2: 18, y2: 8 },
    ],
  },
  {
    // Календарь и выбор даты — один и тот же глиф (M27 Date Picker,
    // «Добавить дату» на Task Detail, вкладка «План» в нижней
    // навигации, D06 Plan Agenda): показывать «то же самое» одним
    // способом, а не заводить почти неотличимый второй вариант ради
    // формальной пары «календарь / выбор даты» из ТЗ на пакет работ.
    name: 'calendar',
    primitives: [
      { tag: 'rect', x: 4, y: 5, width: 16, height: 15, rx: 2 },
      { tag: 'line', x1: 8, y1: 3, x2: 8, y2: 7 },
      { tag: 'line', x1: 16, y1: 3, x2: 16, y2: 7 },
      { tag: 'line', x1: 4, y1: 10, x2: 20, y2: 10 },
    ],
  },
  {
    // Напоминание отдельно от планового времени: M31 Reminder, M43
    // Notifications.
    name: 'bell',
    primitives: [
      { tag: 'path', d: 'M6 9a6 6 0 0 1 12 0v4l2 4H4l2-4Z' },
      { tag: 'path', d: 'M10 21a2 2 0 0 0 4 0' },
    ],
  },
  {
    // Ручка перетаскивания: reorder в M17 Project List, D08 Project
    // List, порядок правил в Recurrence.
    name: 'dragHandle',
    primitives: [
      { tag: 'line', x1: 9, y1: 6, x2: 9, y2: 6 },
      { tag: 'line', x1: 9, y1: 12, x2: 9, y2: 12 },
      { tag: 'line', x1: 9, y1: 18, x2: 9, y2: 18 },
      { tag: 'line', x1: 15, y1: 6, x2: 15, y2: 6 },
      { tag: 'line', x1: 15, y1: 12, x2: 15, y2: 12 },
      { tag: 'line', x1: 15, y1: 18, x2: 15, y2: 18 },
    ],
  },
  {
    // Заголовок секции «Подзадачи / чек-лист» на M25 Task Detail Full —
    // сам переключатель одного пункта рисуется парой `check`/
    // `circleIncomplete` на уровне строки, это только иконка раздела.
    name: 'checklist',
    primitives: [
      { tag: 'rect', x: 4, y: 4, width: 4, height: 4, rx: 1 },
      { tag: 'line', x1: 11, y1: 6, x2: 20, y2: 6 },
      { tag: 'rect', x: 4, y: 10, width: 4, height: 4, rx: 1 },
      { tag: 'line', x1: 11, y1: 12, x2: 20, y2: 12 },
      { tag: 'rect', x: 4, y: 16, width: 4, height: 4, rx: 1 },
      { tag: 'line', x1: 11, y1: 18, x2: 20, y2: 18 },
    ],
  },
  {
    // Галочка: завершённая задача/подзадача (M36 Completed), быстрые
    // действия отметки «выполнено».
    name: 'check',
    primitives: [{ tag: 'polyline', points: '5 13 10 18 19 7' }],
  },
  {
    // Круг незавершённой задачи: ведущий переключатель строки задачи на
    // Today (M07) и везде, где задача показана в списке.
    name: 'circleIncomplete',
    primitives: [{ tag: 'circle', cx: 12, cy: 12, r: 8 }],
  },
  {
    // Плановое время: секция temporal на M25 Task Detail Full, M28
    // Advanced planning.
    name: 'clock',
    primitives: [
      { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
      { tag: 'line', x1: 12, y1: 7, x2: 12, y2: 12 },
      { tag: 'line', x1: 12, y1: 12, x2: 15.3, y2: 9.8 },
    ],
  },
  {
    // Длительность задачи: M28 Advanced planning. Прямые линии, без
    // кривых — читается как песочные часы тем же линейным штрихом, что
    // и остальной набор.
    name: 'duration',
    primitives: [
      { tag: 'line', x1: 6, y1: 4, x2: 18, y2: 4 },
      { tag: 'line', x1: 6, y1: 20, x2: 18, y2: 20 },
      { tag: 'line', x1: 7.5, y1: 4.5, x2: 12, y2: 12 },
      { tag: 'line', x1: 16.5, y1: 4.5, x2: 12, y2: 12 },
      { tag: 'line', x1: 7.5, y1: 19.5, x2: 12, y2: 12 },
      { tag: 'line', x1: 16.5, y1: 19.5, x2: 12, y2: 12 },
    ],
  },
  {
    // Просрочено: M10 Deadline Missed (усиленный сигнал, красный кружок
    // с «!» в прототипе — здесь тот же смысл контуром, цвет снаружи).
    name: 'overdue',
    primitives: [
      { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
      { tag: 'line', x1: 12, y1: 7.5, x2: 12, y2: 13 },
      { tag: 'line', x1: 12, y1: 16.5, x2: 12, y2: 16.5 },
    ],
  },
  {
    // Отметка «Главное»: M11 Focus (секция «Главное» на Today, max 3).
    name: 'star',
    primitives: [
      {
        tag: 'path',
        d: 'M12 2l2.9 6.9 7.5.6-5.7 5 1.7 7.4-6.4-4-6.4 4 1.7-7.4-5.7-5 7.5-.6L12 2Z',
      },
    ],
  },
  {
    // Папка проекта: M16 Projects, M17 Project List, вкладка «Проекты»
    // в нижней навигации (замена реюза `archive` из прототипа —
    // открытый вопрос 7 в `02-ui.md` §10).
    name: 'folder',
    primitives: [
      {
        tag: 'path',
        d: 'M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z',
      },
    ],
  },
  {
    // Раздел внутри проекта: заголовки секций на M17/M18, D07/D08/D09.
    name: 'section',
    primitives: [
      { tag: 'rect', x: 3, y: 4, width: 18, height: 16, rx: 2 },
      { tag: 'line', x1: 3, y1: 9, x2: 21, y2: 9 },
    ],
  },
  {
    // Доска (колонки): M18 Project Board, D09 Board.
    name: 'board',
    primitives: [
      { tag: 'rect', x: 3, y: 4, width: 18, height: 16, rx: 2 },
      { tag: 'line', x1: 9, y1: 4, x2: 9, y2: 20 },
      { tag: 'line', x1: 15, y1: 4, x2: 15, y2: 20 },
    ],
  },
  {
    // Перенос на сегодня: bulk-действие на M09 Missed Plan / M37
    // Multi-select. Стрелка к упору слева — «вернуть к текущему дню»;
    // зеркальная пара с `moveToTomorrow` тем же способом рисовать
    // стрелку, что и везде в наборе (`back`, `import`/`export`).
    name: 'moveToToday',
    primitives: [
      { tag: 'line', x1: 5, y1: 6, x2: 5, y2: 18 },
      { tag: 'line', x1: 19, y1: 12, x2: 9, y2: 12 },
      { tag: 'polyline', points: '13 7 8 12 13 17' },
    ],
  },
  {
    // Перенос на завтра: bulk-действие на M09 Missed Plan / M37
    // Multi-select — зеркало `moveToToday` по вертикальной оси.
    name: 'moveToTomorrow',
    primitives: [
      { tag: 'line', x1: 19, y1: 6, x2: 19, y2: 18 },
      { tag: 'line', x1: 5, y1: 12, x2: 15, y2: 12 },
      { tag: 'polyline', points: '11 7 16 12 11 17' },
    ],
  },
  {
    // Раскрытие/сворачивание группы: M08 Today Dense («collapsible
    // groups»), секции sidebar на D01. Один глиф, направление —
    // поворотом через CSS `transform` у потребителя, а не отдельные
    // иконки на каждую сторону.
    name: 'chevron',
    primitives: [{ tag: 'polyline', points: '6 9 12 15 18 9' }],
  },
  {
    // Входящие: M12 Inbox, M13 Inbox Process, D04/D05 Inbox.
    name: 'inbox',
    primitives: [
      {
        tag: 'path',
        d: 'M4 4h16a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z',
      },
      { tag: 'polyline', points: '3 13 8 13 10 16 14 16 16 13 21 13' },
    ],
  },
  {
    // Настройки: M41 Settings Root, D19 Settings.
    name: 'settings',
    primitives: [
      { tag: 'circle', cx: 12, cy: 12, r: 6 },
      { tag: 'circle', cx: 12, cy: 12, r: 2.2 },
      { tag: 'line', x1: 18, y1: 12, x2: 20.6, y2: 12 },
      { tag: 'line', x1: 15, y1: 17.2, x2: 16.3, y2: 19.45 },
      { tag: 'line', x1: 9, y1: 17.2, x2: 7.7, y2: 19.45 },
      { tag: 'line', x1: 6, y1: 12, x2: 3.4, y2: 12 },
      { tag: 'line', x1: 9, y1: 6.8, x2: 7.7, y2: 4.55 },
      { tag: 'line', x1: 15, y1: 6.8, x2: 16.3, y2: 4.55 },
    ],
  },
  {
    // Ссылка: «attachments/links» на M25 Task Detail Full — URL-ссылка
    // отдельно от файла-вложения (`attach`).
    name: 'link',
    primitives: [
      {
        tag: 'rect',
        x: 2.5,
        y: 13.5,
        width: 11,
        height: 5,
        rx: 2.5,
        transform: 'rotate(45 8 16)',
      },
      {
        tag: 'rect',
        x: 10.5,
        y: 5.5,
        width: 11,
        height: 5,
        rx: 2.5,
        transform: 'rotate(45 16 8)',
      },
      { tag: 'line', x1: 9.5, y1: 14.5, x2: 14.5, y2: 9.5 },
    ],
  },
  {
    // Предупреждение: temporal-конфликты (D11 Inspector Full, ST19),
    // общие recoverable/unrecoverable-состояния (ST07/ST08). Треугольник
    // с «!» — отличать по силуэту от `overdue` (тот же смысл «!», но
    // круг: конкретно просроченный срок, а не общий конфликт/ошибка).
    name: 'warning',
    primitives: [
      { tag: 'path', d: 'M12 3.5L21.5 20H2.5Z' },
      { tag: 'line', x1: 12, y1: 9.5, x2: 12, y2: 14.5 },
      { tag: 'line', x1: 12, y1: 17.5, x2: 12, y2: 17.5 },
    ],
  },
] as const satisfies readonly IconDefinition[];

export type IconName = (typeof ICON_DEFINITIONS)[number]['name'];

/** Реестр для O(1)-доступа по имени; `ICON_DEFINITIONS` остаётся
 * каноническим источником (по нему проверяется уникальность имён — см.
 * `test/icons/registry.test.ts`).
 *
 * Строится обычным `reduce`, а не `Object.fromEntries(...) as Record<...>`
 * — после `as const satisfies` каждый примитив в `ICON_DEFINITIONS`
 * сохраняет свой узкий литеральный тип (без опциональных полей,
 * которых нет буквально в исходнике), и `fromEntries` в паре с приведением
 * типа скрыла бы это несоответствие через `as`. `reduce` с явно
 * типизированным аккумулятором присваивает каждый контур в поле объявленного
 * типа `IconPrimitive[]`, так что виджет получает единообразно широкий тип
 * без промежуточного `as unknown`. */
export const ICON_REGISTRY: Readonly<Record<IconName, readonly IconPrimitive[]>> =
  ICON_DEFINITIONS.reduce<Record<IconName, readonly IconPrimitive[]>>(
    (acc, def) => {
      acc[def.name] = def.primitives;
      return acc;
    },
    {} as Record<IconName, readonly IconPrimitive[]>,
  );

export const ICON_NAMES: readonly IconName[] = ICON_DEFINITIONS.map((def) => def.name);
