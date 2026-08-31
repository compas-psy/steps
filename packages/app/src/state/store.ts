/**
 * `AppController` — единственный держатель состояния навигации продукта.
 *
 * Референс архитектуры — `compas-psy/zapiski` (`packages/app/src/state/
 * store.ts`, соседний продукт СИМПАС, тот же стек — CLAUDE.md требует
 * ориентироваться на его конвенции без причины не расходиться): там нет
 * URL-роутера, экран — поле состояния, не путь. ШАГИ следует тому же
 * решению по той же причине — offline-first оболочка без сервера в R1a,
 * которой нечего резолвить по URL, кроме глубоких ссылок конкретных
 * действий (те заведёт `DeepLinkPort`, когда появится сценарий).
 *
 * Эпик E04 «Навигация, онбординг, локальный режим» — только каркас с
 * экранами матрицы M01–M06 (`docs/spec/SPEC/12_SCREEN_STATE_MATRIX.md`):
 * Launch, Welcome, Sign in, First task, NLP onboarding, Today Empty.
 * Остальные экраны (`today`, `inbox`, `plan`, …) заводятся эпиками,
 * которым они принадлежат (E06+) — `ScreenId` растёт по мере поступления
 * экранов, не декларируется наперёд списком, который никто не реализует.
 * `'projects'` добавлен эпиком E09 (M16 «Projects» — список всех проектов
 * пользователя с доступом к созданию/архиву, `12_SCREEN_STATE_MATRIX.md`).
 *
 * `'projectDetail'` (M17 List / M18 Board / M19 Project Empty, пакет работ
 * E09.3) — первый ПАРАМЕТРИЗОВАННЫЙ экран: одного `screen` недостаточно,
 * нужно ещё и «какой именно проект открыт» — `selectedProjectId` ниже.
 * Именно поэтому это не просто седьмая строка в `ScreenId` с записью в
 * `goTo`, а отдельный метод `openProject` (по образцу `continueLocally` —
 * тоже переход, меняющий больше одного поля состояния разом одной
 * атомарной операцией, не два последовательных вызова `goTo`+сеттер).
 *
 * `'taskDetail'` (M24 Simple / M25 Full, пакет работ E10.2) — ВТОРОЙ
 * параметризованный экран, но с отличием от `'projectDetail'`: у Task
 * Detail нет фиксированного «откуда открыли» (Projects всегда открывает
 * `projectDetail`, а `taskDetail` открывают Today, Inbox и сам
 * `projectDetail` — три разных источника). Поэтому вместо жёстко зашитого
 * `goTo('projects')` внутри самого экрана (как у `ProjectDetail.tsx`, кнопка
 * «Назад») здесь `returnScreen` — экран-источник, запомненный В МОМЕНТ
 * перехода (`openTask`, `this.#state.screen` ДО перезаписи), а `closeTask`
 * возвращает именно на него. `Готово` в Task Detail закрывает экран, не
 * сохраняет (`01§17`, дословно: "`Готово` closes, not saves") — сохранение
 * уже случилось автосейвом по ходу редактирования полей, кнопка только
 * навигация, поэтому `closeTask` не принимает и не проверяет никаких данных.
 */
import type { Uuid } from '@shagi/core';

export type ScreenId =
  | 'launch'
  | 'welcome'
  | 'signIn'
  | 'firstTask'
  | 'nlpOnboarding'
  | 'todayEmpty'
  | 'inbox'
  | 'projects'
  | 'projectDetail'
  | 'taskDetail';

/**
 * `localMode` — пользователь выбрал «Начать локально» (M02 Welcome) без
 * входа в аккаунт. ТЗ §1.3/§11.1: продукт обязан работать полностью без
 * сети и аккаунта — это не временное состояние «ещё не вошёл», а
 * равноправный режим работы, поэтому явный флаг, а не производное от
 * отсутствия сессии (которое совпадало бы с «загрузка ещё не завершена»).
 */
export interface AppState {
  readonly screen: ScreenId;
  readonly localMode: boolean;
  /** Проект, открытый на экране `projectDetail` (см. блок про `openProject`
   * выше) — `null` вне этого экрана и до первого перехода. */
  readonly selectedProjectId: Uuid | null;
  /** Задача, открытая на экране `taskDetail` (см. блок про `'taskDetail'`
   * выше) — `null` вне этого экрана и до первого перехода. */
  readonly selectedTaskId: Uuid | null;
  /** Экран, на который вернёт «Готово» в Task Detail — см. блок про
   * `'taskDetail'` выше. `null` вне этого экрана и до первого перехода. */
  readonly returnScreen: ScreenId | null;
}

export type AppStateListener = (state: AppState) => void;

const INITIAL_STATE: AppState = {
  screen: 'launch',
  localMode: false,
  selectedProjectId: null,
  selectedTaskId: null,
  returnScreen: null,
};

/**
 * Внешний store для `useSyncExternalStore` (React 19) — не Redux/Zustand:
 * состояние навигации этого пакета работ — два поля, отдельная библиотека
 * была бы зависимостью ради синтаксиса, не ради возможностей.
 */
export class AppController {
  #state: AppState;
  readonly #listeners = new Set<AppStateListener>();

  constructor(initial: Partial<AppState> = {}) {
    this.#state = { ...INITIAL_STATE, ...initial };
  }

  getState = (): AppState => this.#state;

  subscribe = (listener: AppStateListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #setState(patch: Partial<AppState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener(this.#state);
  }

  goTo = (screen: ScreenId): void => {
    this.#setState({ screen });
  };

  /** M02 Welcome → «Начать» локально (без входа) — ТЗ §1.3. */
  continueLocally = (): void => {
    this.#setState({ localMode: true, screen: 'firstTask' });
  };

  /** Клик по строке проекта (`Projects.tsx`, `ProjectRow.onClick`) → экран
   * проекта M17/M18/M19 — см. блок про `'projectDetail'` в заголовке файла. */
  openProject = (projectId: Uuid): void => {
    this.#setState({ screen: 'projectDetail', selectedProjectId: projectId });
  };

  /** Клик по строке/карточке задачи (Today/Inbox/ProjectDetail) → Task
   * Detail (M24/M25, пакет работ E10.2) — запоминает и задачу, и текущий
   * экран как `returnScreen` (см. заголовок файла, блок «'taskDetail'»). */
  openTask = (taskId: Uuid): void => {
    this.#setState({
      screen: 'taskDetail',
      selectedTaskId: taskId,
      returnScreen: this.#state.screen,
    });
  };

  /** «Готово» на Task Detail — ТОЛЬКО навигация (`01§17`: "closes, not
   * saves"), возвращает на `returnScreen`. Фоллбэк на `'todayEmpty'` —
   * оборонительная ветка (см. заголовок файла): по продуктовым путям
   * `returnScreen` всегда задан, потому что `openTask` — единственный
   * способ попасть на `taskDetail`. */
  closeTask = (): void => {
    this.#setState({
      screen: this.#state.returnScreen ?? 'todayEmpty',
      selectedTaskId: null,
      returnScreen: null,
    });
  };
}

export function createAppController(initial?: Partial<AppState>): AppController {
  return new AppController(initial);
}
