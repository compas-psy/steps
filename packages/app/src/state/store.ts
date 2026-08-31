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
 */

export type ScreenId =
  'launch' | 'welcome' | 'signIn' | 'firstTask' | 'nlpOnboarding' | 'todayEmpty';

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
}

export type AppStateListener = (state: AppState) => void;

const INITIAL_STATE: AppState = {
  screen: 'launch',
  localMode: false,
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
}

export function createAppController(initial?: Partial<AppState>): AppController {
  return new AppController(initial);
}
