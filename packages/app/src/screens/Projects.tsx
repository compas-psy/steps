/**
 * `Projects` — M16 «Projects» (`12_SCREEN_STATE_MATRIX.md`: «create/reorder/
 * archive access; Free limit safe») и M19 «Project Empty» (`12_...md`:
 * «direct first-task CTA»), эпик E09, пакет работ E09.2. M19 трактован шире
 * буквального прочтения (задание пакета работ): не «первая задача внутри
 * уже созданного проекта» (экрана проекта M17/M18 ещё нет), а пустой список
 * проектов вообще — «первая задача» здесь означает «первый проект».
 *
 * Территория этого пакета работ — ТОЛЬКО список проектов (M16) и его пустое
 * состояние (M19) плюс форма создания. Экран одного проекта (Список/Доска
 * задач внутри проекта, M17/M18) — следующий пакет работ: клик по строке
 * проекта здесь сознательно БЕЗ `onClick` (`ProjectRow.onClick` —
 * необязательный проп) — вести пока действительно некуда, честная заглушка
 * вместо изобретения временного экрана-затычки.
 *
 * Тот же паттерн, что уже установлен `Today.tsx`/`Inbox.tsx`: список грузится
 * `useEffect` при монтировании, провал команды не проглатывается (`Toast`),
 * после успешной команды список ПЕРЕЗАПРАШИВАЕТСЯ (`refreshProjects`), не
 * мутируется вручную — производный результат хранилища, вторая копия на
 * клиенте рисковала бы рассинхронизацией.
 *
 * --- Свотчи цвета (`colorToken`, `01§12` «Create/edit») -------------------
 *
 * `01§12`, дословно: "small marker color from controlled token palette, no
 * arbitrary hex". Контролируемая палитра — `MarkerColor` (`@shagi/ui`,
 * `organization/internal/markerColor.ts`): ровно 7 значений — `forest`,
 * `gold`, `blue`, `violet`, `orange`, `red`, `neutral` (`04_UI_DESIGN_SYSTEM.md`
 * §4.1 «R1 Project marker palette»). Публичная точка входа пакета
 * (`@shagi/ui/src/index.ts`, `components/index.ts`) реэкспортирует только
 * ТИП `MarkerColor`, не сам список значений (`MARKER_COLORS` объявлен в
 * `internal/`, глубокий импорт запрещён границей пакетов, CLAUDE.md
 * «Границы пакетов») — `PROJECT_COLOR_OPTIONS` ниже копирует ровно тот же
 * список значений заново, тем же узким приёмом, что уже применён в
 * `Today.tsx`/`Inbox.tsx` для `getDeviceId`/конвертации `DatePicker`
 * (задокументированное дублирование вместо рефакторинга вне разрешённой
 * территории — если палитра `@shagi/ui` когда-нибудь изменится, эта копия
 * молча разойдётся, известный компромисс единой точки входа пакета).
 *
 * Каждый свотч — маленькая кнопка: цветной маркер переиспользует ГОТОВЫЙ
 * CSS-класс `shagi-project-row__marker--<color>` (`ProjectRow.css`, уже
 * принят) вместо нового класса в `packages/app` (у которого своих стилей
 * вообще нет — весь визуал несут компоненты `@shagi/ui`, задание прямо
 * запрещает территорию `packages/ui/src/**`). Выбранный свотч отмечен
 * `aria-pressed` (минимальный паттерн выбора без нового компонента) плюс
 * видимой галочкой (`Icon name="check"`) — состояние никогда не только
 * цветом (тот же принцип, что «state never color-only», §11).
 *
 * --- `rank` нового проекта --------------------------------------------
 *
 * `NewRank` (`@shagi/core`, `commands/project-rank.ts`): `{placement:
 * 'empty-list'}`, когда список ещё пуст, иначе `{placement: 'end', lastRank:
 * <ранг последнего>}`. `storage.projects.listActive()` уже возвращает
 * проекты по возрастанию ранга (оба адаптера — `ORDER BY rank ASC` у SQLite,
 * `.toSorted(compareRank)` у in-memory/IndexedDB, `packages/storage`), значит
 * последний элемент массива — проект с максимальным рангом, ровно то, что
 * просит `resolveRank({placement:'end'})` внутри самой команды (эта функция
 * не вызывается здесь напрямую — `createProjectCommand` уже вызывает её
 * сама, `project-create.ts`).
 *
 * --- Free-лимит (`01§12`, дословно: «At 10 active projects, ordinary
 * attempt 11 → contextual Pro paywall; no partial project created») --------
 *
 * `createProjectCommand` возвращает `status:'rejected'` с `validation.issues`
 * — у лимитного правила (27 Free-потолок 10 / 28 технический потолок 500,
 * `validation/project.ts` `checkProjectLimits`) код ОДИН и тот же на обе
 * ветки — `'PROJECT_LIMIT_REACHED'` (`error-codes.ts`). Экран не различает
 * их дальше: `01§12` не описывает разного поведения для двух разных чисел,
 * у обоих один и тот же честный ответ — контекстный paywall. Любой другой
 * `rejected` (пустой title, правило 22) — обычный `Toast`, тот же приём, что
 * `Today.tsx`/`Inbox.tsx` (`errors.actionFailed` там, `errors.createFailed`
 * здесь).
 *
 * `hasProEntitlement: false` — буквально, без притворства: биллинга нет
 * нигде в дереве пакетов (`.ultraplan/plan.md`, R1a без сервера) — тот же
 * честный подход, что `SignIn.tsx` уже применяет для входа по аккаунту.
 *
 * --- `Entitlement.onCta` без биллинга -------------------------------------
 *
 * CTA «Улучшить план» остаётся кликабельным (не `ctaDisabled`) — тот же
 * выбор, что `SignIn.tsx` уже сделал для email/Yandex входа: клик — РЕАЛЬНАЯ
 * попытка пользователя, честнее ответить явным сообщением «оплата появится в
 * одном из следующих обновлений» (`limit.upgradeUnavailable`, дословно та же
 * формула, что `onboarding.signIn.unavailableError`/`shell.bottomNav.
 * quickAddUnavailable`), чем `disabled`-кнопка, которая выглядела бы
 * сломанной, а не «пока недоступной осознанно». `AppShell`-кнопка Quick Add,
 * для сравнения, `disabled` НЕ потому что честность требует одного решения
 * на все случаи, а потому что там нет вообще никакого UI Quick Add, на
 * который можно было бы нажать по-настоящему (см. заголовок `AppShell.tsx`)
 * — здесь кнопка настоящая и клик — настоящее пользовательское действие,
 * то же рассуждение решает по-разному в двух разных ситуациях.
 *
 * --- Локальная идентичность устройства ------------------------------------
 *
 * Тот же узкий приём с тем же обоснованием, что `Today.tsx`/`Inbox.tsx`:
 * персистентного порта идентичности устройства ещё нет
 * (`packages/platform`/`packages/storage` его не заводят), `deviceId` —
 * только тай-брейк HLC, `ownerScope` не нужен (создаётся новая сущность, но
 * `createProjectCommand` не принимает `ownerScope` вовсе — контракт
 * `ProjectCommandDeps`, `project-port.ts`).
 */
import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import { Temporal } from '@js-temporal/polyfill';

import { t } from '@shagi/i18n';
import {
  createProjectCommand,
  generateDeviceId,
  type NewRank,
  type Project,
  type ProjectDefaultView,
  type Uuid,
} from '@shagi/core';
import {
  Button,
  Entitlement,
  EmptyState,
  Icon,
  Input,
  Modal,
  ProjectRow,
  SegmentedControl,
  Switch,
  Textarea,
  Toast,
  type MarkerColor,
} from '@shagi/ui';

import { useStorage } from '../state/context.js';

/** См. заголовок файла, блок «Свотчи цвета» — копия палитры `MarkerColor`,
 * не импорт (публичная точка входа `@shagi/ui` не экспортирует значения). */
const PROJECT_COLOR_OPTIONS: readonly MarkerColor[] = [
  'forest',
  'gold',
  'blue',
  'violet',
  'orange',
  'red',
  'neutral',
];

/** Подпись свотча — только через литеральные вызовы `t()` (не вычисляемый
 * ключ по `color`): `scripts/check-i18n-catalog.mjs` — статический разбор
 * регулярным выражением, видит только литеральные строковые аргументы (тот
 * же приём, что `groupLabel` в `Today.tsx`). */
function colorSwatchLabel(color: MarkerColor): string {
  switch (color) {
    case 'forest':
      return t('projects', 'form.color.forest');
    case 'gold':
      return t('projects', 'form.color.gold');
    case 'blue':
      return t('projects', 'form.color.blue');
    case 'violet':
      return t('projects', 'form.color.violet');
    case 'orange':
      return t('projects', 'form.color.orange');
    case 'red':
      return t('projects', 'form.color.red');
    case 'neutral':
      return t('projects', 'form.color.neutral');
  }
}

/**
 * `Project.colorToken` непрозрачен на уровне домена (`entities/project.ts`:
 * «конкретный каталог токенов — собственность @shagi/ui, здесь непрозрачный
 * ключ») — ни `entities/project.ts`, ни `validation/project.ts` не проверяют
 * его содержимое, значит значение из хранилища НЕ гарантированно входит в
 * `MarkerColor` (например тестовая фикстура `makeProject`,
 * `@shagi/storage/contract`, использует `'accent.default'`, не входящий в
 * палитру — обнаружено чтением обоих типов, как просило задание). Безопасное
 * преобразование с откатом к дефолту самого `ProjectRow` (`forest`, §4.1
 * «Default forest») — не падать и не молча просить компонент отрисовать
 * несуществующий модификатор класса на проекте с унаследованным/чужим
 * значением `colorToken`.
 */
function toMarkerColor(colorToken: string): MarkerColor {
  return (PROJECT_COLOR_OPTIONS as readonly string[]).includes(colorToken)
    ? (colorToken as MarkerColor)
    : 'forest';
}

// --- Локальная идентичность устройства (см. заголовок файла) -----------------

let cachedDeviceId: Uuid | null = null;

function getDeviceId(): Uuid {
  cachedDeviceId ??= generateDeviceId();
  return cachedDeviceId;
}

/** См. заголовок файла, блок «rank нового проекта». */
function computeNewRank(projects: readonly Project[]): NewRank {
  const lastProject = projects.at(-1);
  return lastProject === undefined
    ? { placement: 'empty-list' }
    : { placement: 'end', lastRank: lastProject.rank };
}

interface ProjectFormState {
  readonly title: string;
  readonly description: string;
  readonly colorToken: MarkerColor;
  readonly defaultView: ProjectDefaultView;
  readonly favorite: boolean;
}

const INITIAL_FORM_STATE: ProjectFormState = {
  title: '',
  description: '',
  colorToken: 'forest',
  defaultView: 'list',
  favorite: false,
};

export function Projects(): ReactElement {
  const storage = useStorage();
  const [projects, setProjects] = useState<readonly Project[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProjectFormState>(INITIAL_FORM_STATE);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** См. заголовок файла, блок «Free-лимит» — отдельная ветка отображения от
   * обычного `Toast`: контекстный paywall (`Entitlement`), не текст ошибки. */
  const [limitReached, setLimitReached] = useState(false);

  const titleFieldId = useId();
  const descriptionFieldId = useId();

  useEffect(() => {
    let cancelled = false;
    void storage.projects.listActive().then((next) => {
      if (!cancelled) setProjects(next);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  /** Перезапрашивает `listActive()` после успешной команды — тот же приём,
   * что `refreshGroups`/`refreshTasks` в `Today.tsx`/`Inbox.tsx`: список —
   * производный результат хранилища, не мутируется локально вручную. */
  async function refreshProjects(): Promise<void> {
    const next = await storage.projects.listActive();
    setProjects(next);
  }

  function openForm(): void {
    setForm(INITIAL_FORM_STATE);
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const rank = computeNewRank(projects ?? []);
    const result = await createProjectCommand(
      {
        title: form.title,
        description: form.description,
        colorToken: form.colorToken,
        defaultView: form.defaultView,
        favorite: form.favorite,
        hasProEntitlement: false,
        rank,
      },
      { storage, now: Temporal.Now.instant(), deviceId: getDeviceId() },
    );

    if (result.status === 'ok') {
      setFormOpen(false);
      setToastMessage(null);
      setLimitReached(false);
      await refreshProjects();
      return;
    }

    // `rejected`/`not_found` — форма закрывается в обоих случаях: ни один из
    // них не «поправимое поле», по которому имеет смысл держать диалог
    // открытым (Free-лимит решается не полем формы, `not_found` здесь вообще
    // недостижим при create — общий тип результата унаследован от команд
    // update/archive, см. `ProjectCommandResult`, `project-port.ts`).
    setFormOpen(false);

    if (
      result.status === 'rejected' &&
      result.validation.issues.some((issue) => issue.code === 'PROJECT_LIMIT_REACHED')
    ) {
      setLimitReached(true);
      setToastMessage(null);
      return;
    }

    setLimitReached(false);
    setToastMessage(t('projects', 'errors.createFailed'));
  }

  /** См. заголовок файла, блок «Entitlement.onCta без биллинга». */
  function handleUpgradeCta(): void {
    setToastMessage(t('projects', 'limit.upgradeUnavailable'));
  }

  const isEmpty = projects !== null && projects.length === 0;
  const isNonEmpty = projects !== null && projects.length > 0;

  return (
    <div>
      <h1>{t('projects', 'pageTitle')}</h1>

      {toastMessage !== null && (
        <Toast
          variant="error"
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
          dismissLabel={t('projects', 'errors.dismiss')}
        />
      )}

      {limitReached && (
        <Entitlement
          title={t('projects', 'limit.title')}
          description={t('projects', 'limit.description')}
          ctaLabel={t('projects', 'limit.cta')}
          onCta={handleUpgradeCta}
          onDismiss={() => setLimitReached(false)}
          dismissLabel={t('projects', 'limit.dismiss')}
        />
      )}

      {/* M19 Project Empty (трактовка шире — пустой список проектов вообще,
       * см. заголовок файла) — CTA внутри самого `EmptyState`, не отдельная
       * кнопка сверху (та рендерится только в непустом состоянии ниже). */}
      {isEmpty && (
        <EmptyState
          icon={<Icon name="folder" size={32} />}
          title={t('projects', 'empty.title')}
          description={t('projects', 'empty.description')}
          action={
            <Button variant="primary" onClick={openForm}>
              {t('projects', 'actions.create')}
            </Button>
          }
        />
      )}

      {/* Кнопка «Создать проект» видима и в непустом состоянии тоже, не
       * только в Empty (задание пакета работ) — обычная кнопка над списком. */}
      {isNonEmpty && projects !== null && (
        <>
          <Button variant="primary" onClick={openForm}>
            {t('projects', 'actions.create')}
          </Button>
          <ul aria-label={t('projects', 'list.ariaLabel')}>
            {projects.map((project) => (
              // Клик по строке — сознательно без `onClick` (см. заголовок
              // файла): экрана проекта (M17/M18) в дереве пакетов ещё нет.
              <ProjectRow
                key={project.id}
                name={project.title}
                color={toMarkerColor(project.colorToken)}
              />
            ))}
          </ul>
        </>
      )}

      <Modal open={formOpen} onClose={closeForm} title={t('projects', 'form.title')}>
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          noValidate
        >
          <label htmlFor={titleFieldId}>{t('projects', 'form.titleLabel')}</label>
          <Input
            id={titleFieldId}
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />

          <label htmlFor={descriptionFieldId}>{t('projects', 'form.descriptionLabel')}</label>
          <Textarea
            id={descriptionFieldId}
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />

          <div role="group" aria-label={t('projects', 'form.colorLabel')}>
            {PROJECT_COLOR_OPTIONS.map((color) => {
              const selected = form.colorToken === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setForm((current) => ({ ...current, colorToken: color }))}
                >
                  <span
                    aria-hidden="true"
                    className={`shagi-project-row__marker shagi-project-row__marker--${color}`}
                  />
                  {colorSwatchLabel(color)}
                  {selected && <Icon name="check" size={12} />}
                </button>
              );
            })}
          </div>

          <SegmentedControl<ProjectDefaultView>
            label={t('projects', 'form.viewLabel')}
            value={form.defaultView}
            onChange={(value) => setForm((current) => ({ ...current, defaultView: value }))}
            options={[
              { value: 'list', label: t('projects', 'form.viewList') },
              { value: 'board', label: t('projects', 'form.viewBoard') },
            ]}
          />

          <Switch
            label={t('projects', 'form.favoriteLabel')}
            checked={form.favorite}
            onChange={(event) =>
              setForm((current) => ({ ...current, favorite: event.target.checked }))
            }
          />

          <Button type="submit" variant="primary">
            {t('projects', 'form.submit')}
          </Button>
          <Button type="button" variant="secondary" onClick={closeForm}>
            {t('projects', 'form.cancel')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
