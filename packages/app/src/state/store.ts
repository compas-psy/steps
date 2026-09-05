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
 *
 * `quickAdd` (M20–M23, пакет работ E05.2) — сознательно НЕ седьмая строка
 * `ScreenId` по образцу `projectDetail`/`taskDetail`. D12 «Global Quick Add
 * | callable from any app route/global shortcut capability» (`01§3`)
 * означает, что Composer обязан открываться ПОВЕРХ любого текущего экрана
 * (Today, Inbox, ProjectDetail, …), не заменяя его — заводить отдельный
 * `ScreenId` означало бы терять текущий экран под низом при открытии, что
 * прямо противоречит духу "callable from any route". Поэтому `quickAdd` —
 * параллельное состояние оверлея (не `screen`): `null` — закрыт, `{origin}`
 * — открыт с конкретным унаследованным контекстом (`01§3`, таблица «Origin →
 * Inherited values» — из неё в объёме этого пакета работ только три строки:
 * `'today'` → planned_date=today, processed; `'inbox'` → inbox, без даты;
 * `'global'` → inbox, без даты/проекта, см. `screens/QuickAdd.tsx`).
 * `App.tsx` рендерит оверлей `<QuickAdd>` поверх `<Screens>`, когда
 * `quickAdd !== null` — экран под низом продолжает существовать в дереве и
 * в состоянии `AppState.screen`, не подменяется.
 *
 * `'search'` (M34 Search Empty / M35 Search Results, эпик E12 «План, поиск,
 * фильтры, завершённые», первый пакет работ E12.1) — ОБЫЧНЫЙ `ScreenId`, не
 * оверлей (в отличие от `quickAdd` выше): пользователь явно "переходит в
 * поиск" и заменяет им текущий главный экран (тот же принцип, что
 * `'projects'`), не работает поверх произвольного контекста, откуда его
 * вызвали (D12 "callable from any route" — про Quick Add, не про Search,
 * `01§3`). Не параметризован (в отличие от `'projectDetail'`/`'taskDetail'`)
 * — у Search нет «какой именно» сущности, экран сам держит текст запроса
 * локальным состоянием (`screens/Search.tsx`), поэтому обычная запись в
 * `goTo`, без отдельного метода контроллера.
 *
 * `'plan'` (M14 Plan Agenda / M15 Plan selected, эпик E12, второй пакет
 * работ E12.2) — тот же приём, что `'search'` выше: обычный `ScreenId`, не
 * оверлей («главный» экран, на который возвращаются, не шаг разового
 * потока), не параметризован (выбранная в date strip дата — локальное
 * состояние `screens/Plan.tsx`, не часть навигационного состояния
 * приложения — M15 "selected date state" не переживает уход с экрана и
 * обратно, поэтому не заслуживает поля в `AppState`, в отличие от
 * `selectedProjectId`/`selectedTaskId`, которые обязаны пережить показ и
 * скрытие `taskDetail` поверх них).
 *
 * `'completed'` (M36 «Completed», эпик E12, ПОСЛЕДНИЙ пакет работ E12.4) —
 * тот же приём, что `'search'`/`'plan'` выше: обычный `ScreenId`, не оверлей
 * — экран заменяет текущий главный, а не работает поверх произвольного
 * контекста (в отличие от `quickAdd`). Не параметризован — список завершён-
 * ных задач и состояние диалога восстановления держит локально сам
 * `screens/Completed.tsx` (тот же принцип, что `'plan'` для выбранной даты
 * в полосе). Точка входа — кнопка внутри `Search.tsx` (M34), не пятый пункт
 * `AppShell` (см. заголовок `Completed.tsx` за полным разбором исследования
 * размещения) — переход `controller.goTo('completed')` обычный, `AppShell`
 * не оборачивает этот экран (не входит в `MAIN_TAB_SCREENS`, `shell/AppShell.tsx`
 * — «Завершённые» не входит ни в одну из пяти задуманных позиций нижней
 * навигации, см. её заголовок), возврат — обычная кнопка «Назад» внутри
 * самого `Completed.tsx`, тот же жанр, что `Inbox.tsx` уже применяет для
 * своего собственного не-`AppShell` экрана.
 *
 * `'settings'` (M41 Settings Root) и `'appearance'` (M42 Appearance) —
 * пакет работ «Настройки: экран-хаб и тема оформления». `'settings'` —
 * ТРЕТИЙ параметризованный-по-возврату экран после `'taskDetail'`, но с
 * фиксированным (не переменным) источником: сейчас единственная точка
 * входа — значок-шестерёнка в заголовке `Today.tsx` (`'todayEmpty'`), в
 * отличие от `'taskDetail'`, куда ведут три разных экрана. Отдельное поле
 * `settingsReturnScreen` (не переиспользование `returnScreen` у
 * `'taskDetail'`) — те же два перехода структурно независимы: Task Detail,
 * открытый ИЗ экрана настроек в будущем, не должен путать, куда вернёт
 * «Назад» каждого из них; общий `openTask`/`closeTask` паттерн (метод
 * контроллера читает `this.#state.screen` ДО перезаписи, симметричный
 * метод закрытия возвращает на него и обнуляет память) просто повторён для
 * второй, независимой пары экрана и точки возврата.
 *
 * `'appearance'` — ОБЫЧНЫЙ `goTo('appearance')`/`goTo('settings')`, без
 * своего поля возврата: единственный вход — строка «Оформление» в
 * `Settings.tsx`, и она же единственный путь назад (задание прямо это
 * оговаривает) — заводить память под источник, у которого нет других
 * значений, кроме одного, было бы состоянием ради состояния.
 *
 * `'dataPrivacy'` (M51 Data & Privacy) — ровно тот же случай и то же
 * решение, что `'appearance'`: единственный вход — вторая строка
 * `Settings.tsx`, возврат — `goTo('settings')`, своего поля возврата нет.
 *
 * `'importData'` (M46–M48) и `'exportData'` (M49) — то же самое, только
 * вход у обоих со экрана `'dataPrivacy'`, туда же и возврат. Три экрана
 * матрицы M46/M47/M48 — ОДИН маршрут: между ними ходит разобранный план
 * импорта, значение с временем жизни в один сценарий, и класть его в это
 * состояние ради разбиения на три маршрута значило бы дать ему пережить
 * уход на другой экран (разбор — в заголовке `screens/ImportData.tsx`).
 *
 * `'legalPrivacyPolicy'` и `'legalUserAgreement'` (`05§14`) — ДВА
 * отдельных маршрута, а не один экран с параметром «какой документ».
 * Причина та же, по которой их два и в спеке: это два независимых
 * документа со своими версиями и хешами, и адрес каждого должен быть
 * самостоятельным — на него ссылаются из карточки магазина и из
 * поддержки. Параметр в состоянии дал бы один адрес на оба и пережил бы
 * уход на другой экран, как разобранный план импорта выше.
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
  | 'taskDetail'
  | 'search'
  | 'plan'
  | 'completed'
  | 'settings'
  | 'appearance'
  | 'dataPrivacy'
  | 'importData'
  | 'exportData'
  | 'legalPrivacyPolicy'
  | 'legalUserAgreement';

/** Откуда открыт Quick Add — см. блок про `quickAdd` в заголовке файла.
 * Только три из семи строк таблицы «Origin → Inherited values» (`01§3`) —
 * остальные (`Plan selected date`/`Project`/`Section`/`Board column`) вне
 * объёма этого пакета работ (нет точки входа в дереве экранов: `Plan` не
 * существует, `Project`/`Section`/`Board column` уже имеют свой собственный
 * путь добавления задачи без NLP — `InlineAddForm`, `ProjectDetail.tsx`). */
export type QuickAddOrigin = 'global' | 'today' | 'inbox';

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
  /** Экран, на который вернёт «Назад» в `Settings` (M41) — см. блок про
   * `'settings'`/`'appearance'` в заголовке файла: отдельное от
   * `returnScreen` поле, та же структура, независимая пара экрана и точки
   * возврата. `null` вне `'settings'`/`'appearance'` и до первого перехода. */
  readonly settingsReturnScreen: ScreenId | null;
  /** Оверлей Quick Add — см. блок про `quickAdd` в заголовке файла. `null`,
   * пока оверлей закрыт. НЕ влияет на `screen` — экран под низом не меняется. */
  readonly quickAdd: { readonly origin: QuickAddOrigin } | null;
  /**
   * Счётчик подтверждённых изменений данных. Растёт после каждой успешной
   * мутации из карточки задачи.
   *
   * Зачем: на десктопе карточка живёт в панели СПРАВА, а список остаётся
   * слева смонтированным (SPEC/04 §9). Экраны читают хранилище один раз при
   * монтировании, поэтому список не узнавал о правках в панели — человек
   * переименовывал задачу и видел рядом старое название. Оболочка включает
   * этот счётчик в `key` экрана-подложки, и тот перечитывает данные.
   *
   * Счётчик, а не флаг: важно КАЖДОЕ изменение, а не факт «что-то было».
   */
  readonly dataVersion: number;
}

export type AppStateListener = (state: AppState) => void;

const INITIAL_STATE: AppState = {
  screen: 'launch',
  localMode: false,
  selectedProjectId: null,
  selectedTaskId: null,
  returnScreen: null,
  settingsReturnScreen: null,
  quickAdd: null,
  dataVersion: 0,
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

  /** Клик по значку-шестерёнке (`Today.tsx`, заголовок) → Settings (M41,
   * см. заголовок файла, блок «'settings'») — запоминает текущий экран как
   * `settingsReturnScreen`, тот же приём, что `openTask`/`returnScreen`. */
  openSettings = (): void => {
    this.#setState({ screen: 'settings', settingsReturnScreen: this.#state.screen });
  };

  /** «Назад» на Settings — возвращает на `settingsReturnScreen`. Фоллбэк на
   * `'todayEmpty'` — та же оборонительная ветка, что `closeTask`: по
   * продуктовым путям `settingsReturnScreen` всегда задан, `openSettings` —
   * единственный способ попасть на `'settings'`. */
  closeSettings = (): void => {
    this.#setState({
      screen: this.#state.settingsReturnScreen ?? 'todayEmpty',
      settingsReturnScreen: null,
    });
  };

  /** Открывает оверлей Quick Add поверх текущего экрана — см. блок про
   * `quickAdd` в заголовке файла. Три реальных источника вызова:
   * `AppShell` (центральная кнопка, `origin='global'`), `Today.tsx`
   * (`origin='today'`), `Inbox.tsx` (`origin='inbox'`), плюс глобальный
   * `Ctrl/Cmd+N` (`App.tsx`, `origin='global'`) — не меняет `screen`. */
  openQuickAdd = (origin: QuickAddOrigin): void => {
    this.#setState({ quickAdd: { origin } });
  };

  /** Закрывает оверлей Quick Add (Escape/крестик/успешное создание) —
   * ТОЛЬКО навигация, тот же принцип, что `closeTask`: черновик (draft
   * safety, `01§3`) — забота самого `screens/QuickAdd.tsx`, не контроллера,
   * этот метод его не трогает и не обязан ничего о нём знать. */
  closeQuickAdd = (): void => {
    this.#setState({ quickAdd: null });
  };

  /** Сообщить оболочке, что данные изменились — см. `dataVersion`. */
  notifyDataChanged = (): void => {
    this.#setState({ dataVersion: this.#state.dataVersion + 1 });
  };

  /**
   * Возврат на один шаг назад — единая точка для аппаратной кнопки «Назад»
   * Android (`state/back-navigation.ts`) и браузерной «Назад».
   *
   * Зачем это понадобилось: навигация приложения — состояние контроллера, а
   * не история браузера, и до этого метода аппаратная «Назад» на Android
   * закрывала приложение С ЛЮБОГО экрана. Человек открывал задачу, нажимал
   * системную кнопку и оказывался не в списке, а на домашнем экране
   * телефона.
   *
   * Возвращает `false`, когда возвращаться уже некуда: это корень, и
   * системе положено обработать кнопку по-своему (свернуть или закрыть
   * приложение) — перехватывать её там было бы ловушкой, из которой нельзя
   * выйти.
   *
   * Порядок веток — порядок «наложенности» состояний, а не список экранов:
   * сначала снимается оверлей поверх экрана, потом сам экран.
   */
  goBack = (): boolean => {
    const state = this.#state;

    // Оверлей поверх любого экрана — снимается первым.
    if (state.quickAdd !== null) {
      this.closeQuickAdd();
      return true;
    }

    switch (state.screen) {
      // Экраны со своим запомненным возвратом — идём их же путём, чтобы
      // «Назад» и экранная кнопка «Готово» вели в одно место.
      case 'taskDetail':
        this.closeTask();
        return true;
      case 'settings':
        this.closeSettings();
        return true;

      case 'projectDetail':
        this.goTo('projects');
        return true;

      // Подэкраны настроек возвращаются в настройки, а не на Today: иначе
      // «Назад» из «Экспорта данных» выбрасывал бы из настроек целиком.
      case 'appearance':
      case 'dataPrivacy':
      case 'importData':
      case 'exportData':
        this.goTo('settings');
        return true;
      case 'legalPrivacyPolicy':
      case 'legalUserAgreement':
        this.goTo('dataPrivacy');
        return true;

      // Остальные «главные» и карточные экраны — на Today.
      case 'inbox':
      case 'projects':
      case 'search':
      case 'plan':
      case 'completed':
        this.goTo('todayEmpty');
        return true;

      // Корень приложения и одноразовый поток онбординга: перехватывать
      // нечего. Онбординг сознательно не отматывается назад — «Назад» на
      // первой задаче вернуло бы к приветствию уже после того, как человек
      // выбрал локальный режим.
      case 'launch':
      case 'welcome':
      case 'signIn':
      case 'firstTask':
      case 'nlpOnboarding':
      case 'todayEmpty':
        return false;
    }
  };

  /** Есть ли куда возвращаться из текущего состояния — тот же критерий, что
   * у `goBack`, но без побочного эффекта. Нужен ловушке истории
   * (`state/back-navigation.ts`), которая обязана знать это ДО нажатия. */
  canGoBack = (): boolean => {
    const state = this.#state;
    if (state.quickAdd !== null) return true;
    switch (state.screen) {
      case 'launch':
      case 'welcome':
      case 'signIn':
      case 'firstTask':
      case 'nlpOnboarding':
      case 'todayEmpty':
        return false;
      default:
        return true;
    }
  };
}

export function createAppController(initial?: Partial<AppState>): AppController {
  return new AppController(initial);
}
