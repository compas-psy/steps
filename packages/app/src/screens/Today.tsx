/**
 * `Today` — экран матрицы `docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`,
 * состояния M06 Today Empty и M07 Today Normal. Эпик E06 «Today: выборки,
 * группы, precedence, виртуализация», первый пакет работ — только отбор,
 * группировка и отрисовка (`selectTodayTasks`, `@shagi/core`); M08
 * (виртуализация плотного списка) и интерактивные действия
 * (Complete/Reschedule/bulk/Focus-промпты, M09–M11) — следующие пакеты
 * работ, здесь их сознательно нет (задание, раздел «Контекст»).
 *
 * `ScreenId` этого экрана — `'todayEmpty'` (заведён каркасом E04.1
 * заранее, `state/store.ts`), не переименован в `'today'`: имя уже
 * согласовано владельцем на предыдущем пакете работ. Компонент решает сам,
 * какое из двух состояний матрицы показать (по фактическому результату
 * `selectTodayTasks` — все шесть групп пусты или нет), а не по имени
 * экрана — `ScreenId` определяет МАРШРУТ, не визуальное состояние внутри
 * него.
 *
 * Загрузка — простой `useEffect`+`useState` (задание прямо просит не
 * усложнять кэшированием/react-query на этом пакете работ). Чекбокс
 * каждой строки — `disabled`: `TaskRow`/`TaskCheckbox` рендерят его как
 * часть презентационного компонента независимо от того, подключено ли к
 * нему действие, а Complete на этом экране ещё не существует — оставлять
 * его активным на вид, но неработающим по клику было бы обманом
 * интерфейса, а не просто "недоделанной фичей".
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { formatDate, formatTime, t } from '@shagi/i18n';
import { selectTodayTasks, type Task, type TodayGroup, type TodayGroups } from '@shagi/core';
import { EmptyState, Icon, TaskRow, type TaskRowState } from '@shagi/ui';

import { useStorage } from '../state/context.js';

/** Precedence `01§6` — порядок, в котором группы проверяются и рендерятся. */
const GROUP_ORDER: readonly TodayGroup[] = [
  'missed_deadline',
  'missed_plan',
  'focus',
  'timed',
  'today',
  'later',
];

/** Заголовок каждой группы — только через каталог `@shagi/i18n`
 * (namespace `today`, ТЗ §3). Каждая ветка вызывает `t` с литеральными
 * строковыми аргументами (не переменной с вычисленным ключом) — так
 * `scripts/check-i18n-catalog.mjs` (статический разбор регулярным
 * выражением, не AST) видит все шесть ключей. */
function groupLabel(group: TodayGroup): string {
  switch (group) {
    case 'missed_deadline':
      return t('today', 'groups.missedDeadline');
    case 'missed_plan':
      return t('today', 'groups.missedPlan');
    case 'focus':
      return t('today', 'groups.focus');
    case 'timed':
      return t('today', 'groups.timed');
    case 'today':
      return t('today', 'groups.today');
    case 'later':
      return t('today', 'groups.later');
  }
}

/**
 * Маппинг `TodayGroup → TaskRowState` (задание): `TaskRow` презентационный
 * и не знает про `TodayGroup` — экран сам решает визуальное состояние.
 * `timed`/`today`/`later` — визуально одинаковые обычные строки (различие
 * между ними — где они оказались, не как выглядит сама строка); из
 * девяти состояний `TaskRow` `dragging`/`selected`/`completed`/`recurring`
 * вне охвата этого пакета работ (нет drag/multi-select/повторов/чтения
 * completed-задач на этом экране).
 */
function groupRowState(group: TodayGroup): TaskRowState {
  switch (group) {
    case 'missed_deadline':
      return 'deadlineMissed';
    case 'missed_plan':
      return 'missedPlan';
    case 'focus':
      return 'focus';
    case 'timed':
    case 'today':
    case 'later':
      return 'normal';
  }
}

function isEveryGroupEmpty(groups: TodayGroups): boolean {
  return GROUP_ORDER.every((group) => groups[group].length === 0);
}

interface TodayTaskRowProps {
  readonly task: Task;
  readonly group: TodayGroup;
}

/** Слот `statusLabel` (`TaskRow`, "форматирует вызывающий код через
 * `@shagi/i18n`, компонент не трогает даты сам") — только у "По времени":
 * это единственная группа, где `01§6` явно требует видимый порядок по
 * времени, поэтому само время — минимально нужная подпись, чтобы порядок
 * строк был объясним на экране, а не только "магическим" результатом
 * сортировки. Остальные пять групп пока без `statusLabel`/`metadata` —
 * не требование этого пакета работ (только отбор/группировка/отрисовка,
 * не полный набор метаданных строки). */
function TodayTaskRow({ task, group }: TodayTaskRowProps): ReactElement {
  return (
    <TaskRow
      title={task.title}
      checkboxLabel={task.title}
      checked={false}
      disabled
      state={groupRowState(group)}
      {...(group === 'timed' && task.plannedTime !== null
        ? { statusLabel: formatTime(task.plannedTime) }
        : {})}
    />
  );
}

export function Today(): ReactElement {
  const storage = useStorage();
  const [groups, setGroups] = useState<TodayGroups | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = Temporal.Now.plainDateTimeISO();
    void selectTodayTasks(storage, now).then((result) => {
      if (!cancelled) setGroups(result);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const today = Temporal.Now.plainDateISO();

  return (
    <div>
      <h1>{t('today', 'pageTitle')}</h1>
      <p>{formatDate(today, { weekday: 'long' })}</p>

      {groups !== null && isEveryGroupEmpty(groups) && (
        <EmptyState
          icon={<Icon name="check" size={32} />}
          title={t('common', 'today.doneAll')}
          description={t('today', 'empty.description')}
        />
      )}

      {groups !== null &&
        GROUP_ORDER.filter((group) => groups[group].length > 0).map((group) => (
          <section key={group} aria-label={groupLabel(group)}>
            <h2>{groupLabel(group)}</h2>
            {groups[group].map((task) => (
              <TodayTaskRow key={task.id} task={task} group={group} />
            ))}
          </section>
        ))}
    </div>
  );
}
