/**
 * Общие обёртки харнесса (E03 «харнесс a11y и визрегрессии»,
 * `docs/spec/SPEC/06_TESTING_ACCEPTANCE.md` §7). Не часть публичного API
 * `@shagi/ui` — internal-код каталога `dev/`, см. заголовок `../main.tsx`.
 *
 * Три уровня разметки: `HarnessSection` — категория (`<h2>`,
 * `data-testid="section-<slug>"`), `Example` — один задокументированный
 * пример состояния внутри категории (`<h3>`, `data-testid="example-<slug>"`)
 * — оба testid нужны Playwright для точечных локаторов (a11y-скан по
 * секциям, визрегрессия по примерам, не одним гигантским скриншотом всей
 * страницы). `Frame` — контейнер фиксированного размера для компонентов,
 * которые сами позиционируются `position: fixed`/`absolute` (Modal,
 * BottomSheet, CommandPalette, Menu-подобные): `transform` на `Frame`
 * создаёт containing block для `position: fixed`-потомков (CSS Position
 * §6.1 — трансформированный предок становится точкой отсчёта для fixed,
 * не viewport), поэтому оверлей, показанный здесь открытым постоянно, не
 * перекрывает всю страницу харнесса целиком, а остаётся внутри своей
 * рамки-примера.
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react';

export interface HarnessSectionProps {
  readonly testId: string;
  readonly title: string;
  readonly children: ReactNode;
}

export function HarnessSection({ testId, title, children }: HarnessSectionProps): ReactElement {
  return (
    <section className="dev-section" data-testid={testId}>
      <h2 className="dev-section__title">{title}</h2>
      <div className="dev-section__grid">{children}</div>
    </section>
  );
}

export interface ExampleProps {
  readonly testId: string;
  readonly label: string;
  readonly wide?: boolean;
  readonly children: ReactNode;
}

export function Example({ testId, label, wide = false, children }: ExampleProps): ReactElement {
  return (
    <div
      className={['dev-example', wide ? 'dev-example--wide' : null].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      <h3 className="dev-example__label">{label}</h3>
      <div className="dev-example__body">{children}</div>
    </div>
  );
}

export interface FrameProps {
  readonly height: number;
  /** Центрирует содержимое (flex) — для оверлеев с якорем в середине рамки
   * (`Popover`), которым, в отличие от `Modal`/`BottomSheet`/`CommandPalette`,
   * не нужен весь `position: fixed`-трюк, только видимое поле вокруг. */
  readonly center?: boolean;
  readonly children: ReactNode;
}

/** Высота передаётся числом (не строкой/токеном) — единственное место
 * харнесса, где это оправдано: рамки под каждый оверлей разные и не несут
 * продуктового смысла спейсинг-шкалы (§6), это чисто вьюпорт-заглушка для
 * `position: fixed`-контента конкретного примера. */
export function Frame({ height, center = false, children }: FrameProps): ReactElement {
  const style: CSSProperties = { height };
  const classes = ['dev-frame', center ? 'dev-frame--center' : null].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
