/**
 * Машиночитаемый реестр токенов дизайн-системы ШАГИ.
 *
 * Служит двум целям:
 * 1. Allowlist для линтера адгезии (`.oxlintrc.json`, правило
 *    `no-restricted-syntax` — запрет сырых hex/px в компонентах) — по
 *    духу образца `x-omelette.tokens`/`tokenKinds` из
 *    `docs/spec/DESIGN/design-system/_adherence.oxlintrc.json`.
 * 2. Источник для тестов (`test/tokens/registry-matches-css.test.ts`,
 *    `test/tokens/theme-completeness.test.ts`).
 *
 * Реестр НАМЕРЕННО не содержит значений токенов (никаких hex/px/em-строк)
 * — только имя, вид и файл объявления. Это не пропуск, а сама суть
 * разделения «объявление / использование»: значения токенов легально
 * живут только в `src/tokens/*.css` (CSS не сканируется `oxlint`, это
 * JS/TS-линтер), а любой TS-файл в этом пакете — в том числе этот —
 * обязан проходить те же hex/px-правила адгезии, что и код потребителей.
 * Если бы здесь лежало `value: '#143D2F'` или `value: '16px'`, эти строки
 * сами оказались бы литералами, которые ловит
 * `eslint-js/no-restricted-syntax` (см. `packages/ui/.oxlintrc.json`) —
 * пришлось бы делать для реестра исключение из правила, а это и есть та
 * «ослабленная адгезия», которую пакет работ запрещает. Тесты, которым
 * нужны реальные значения (контраст, брейкпоинты), парсят их из CSS-текста
 * в рантайме — см. `test/tokens/contrast.test.ts`,
 * `test/tokens/breakpoints-consistency.test.ts`.
 *
 * `themed: true` — токен объявлен в `:root` (light) И переопределён в
 * обоих тёмных блоках `colors.css` (system + `[data-theme="dark"]`) с
 * отдельно посчитанным значением (SPEC §4). `themed: false` — токен
 * не меняется по теме (базовая палитра, sidebar, сервис-знак, вся
 * типографика/радиусы/отступы/тени/движение/брейкпоинты).
 */

export type TokenKind = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'motion' | 'other';

export interface TokenDescriptor {
  /** Имя custom property, включая `--`. */
  readonly name: string;
  /** Вид токена — используется линтером адгезии как allowlist-категория. */
  readonly kind: TokenKind;
  /** Путь к файлу объявления, относительно корня пакета `@shagi/ui`. */
  readonly definedIn: string;
  /**
   * true — токен имеет отдельно посчитанное значение и в light, и в dark
   * (SPEC §4); false — значение токена не меняется по теме.
   */
  readonly themed: boolean;
}

export const TOKENS: readonly TokenDescriptor[] = [
  { name: '--accent', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--accent-foreground', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--amber-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--amber-soft', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--background', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--blue-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--blue-soft', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--border', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  {
    name: '--breakpoint-desktop-min',
    kind: 'other',
    definedIn: 'src/tokens/breakpoints.css',
    themed: false,
  },
  {
    name: '--breakpoint-tablet-min',
    kind: 'other',
    definedIn: 'src/tokens/breakpoints.css',
    themed: false,
  },
  { name: '--card', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--card-foreground', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--container-max', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--cream', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--destructive', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  {
    name: '--destructive-foreground',
    kind: 'color',
    definedIn: 'src/tokens/colors.css',
    themed: true,
  },
  { name: '--font-mono', kind: 'font', definedIn: 'src/tokens/typography.css', themed: false },
  { name: '--font-sans', kind: 'font', definedIn: 'src/tokens/typography.css', themed: false },
  { name: '--foreground', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--forest-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--forest-600', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--forest-700', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--forest-800', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--forest-900', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--fw-bold', kind: 'other', definedIn: 'src/tokens/typography.css', themed: false },
  { name: '--fw-medium', kind: 'other', definedIn: 'src/tokens/typography.css', themed: false },
  { name: '--fw-normal', kind: 'other', definedIn: 'src/tokens/typography.css', themed: false },
  { name: '--fw-semibold', kind: 'other', definedIn: 'src/tokens/typography.css', themed: false },
  { name: '--gold-400', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  {
    name: '--floating-panel-max-height',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  {
    name: '--floating-panel-max-width',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  { name: '--gold-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--ink-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--ink-900', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--input', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  {
    name: '--inspector-width',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  {
    name: '--inspector-width-max',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  {
    name: '--inspector-width-min',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  {
    name: '--layout-mobile-margin',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  {
    name: '--lh-body-primary',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--lh-body-secondary',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  { name: '--lh-caption', kind: 'spacing', definedIn: 'src/tokens/typography.css', themed: false },
  {
    name: '--lh-hero-title',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--lh-kpi-number',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--lh-mobile-heading',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--lh-page-title',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--lh-section-title',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--lh-small-meta',
    kind: 'spacing',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  { name: '--ls-caption', kind: 'font', definedIn: 'src/tokens/typography.css', themed: false },
  {
    name: '--ls-mobile-heading',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  { name: '--ls-page-title', kind: 'font', definedIn: 'src/tokens/typography.css', themed: false },
  {
    name: '--modal-max-width',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  {
    name: '--motion-duration-base',
    kind: 'motion',
    definedIn: 'src/tokens/motion.css',
    themed: false,
  },
  {
    name: '--motion-duration-completion',
    kind: 'motion',
    definedIn: 'src/tokens/motion.css',
    themed: false,
  },
  {
    name: '--motion-duration-fast',
    kind: 'motion',
    definedIn: 'src/tokens/motion.css',
    themed: false,
  },
  {
    name: '--motion-duration-reduced',
    kind: 'motion',
    definedIn: 'src/tokens/motion.css',
    themed: false,
  },
  {
    name: '--motion-duration-slow',
    kind: 'motion',
    definedIn: 'src/tokens/motion.css',
    themed: false,
  },
  {
    name: '--motion-easing-standard',
    kind: 'motion',
    definedIn: 'src/tokens/motion.css',
    themed: false,
  },
  {
    name: '--motion-scale-press',
    kind: 'motion',
    definedIn: 'src/tokens/motion.css',
    themed: false,
  },
  { name: '--muted', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--muted-foreground', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  {
    name: '--native-window-min-height',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  {
    name: '--native-window-min-width',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  { name: '--orange-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--orange-soft', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--popover', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--popover-foreground', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--primary', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--primary-foreground', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--radius-2xl', kind: 'radius', definedIn: 'src/tokens/radius.css', themed: false },
  { name: '--radius-full', kind: 'radius', definedIn: 'src/tokens/radius.css', themed: false },
  { name: '--radius-lg', kind: 'radius', definedIn: 'src/tokens/radius.css', themed: false },
  { name: '--radius-md', kind: 'radius', definedIn: 'src/tokens/radius.css', themed: false },
  { name: '--radius-sm', kind: 'radius', definedIn: 'src/tokens/radius.css', themed: false },
  { name: '--radius-xl', kind: 'radius', definedIn: 'src/tokens/radius.css', themed: false },
  { name: '--red-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--red-soft', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--ring', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--sage-100', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--sage-150', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--sage-200', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--sage-300', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--sage-50', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--secondary', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  {
    name: '--secondary-foreground',
    kind: 'color',
    definedIn: 'src/tokens/colors.css',
    themed: true,
  },
  { name: '--shadow-card', kind: 'shadow', definedIn: 'src/tokens/shadow.css', themed: false },
  {
    name: '--shadow-card-hover',
    kind: 'shadow',
    definedIn: 'src/tokens/shadow.css',
    themed: false,
  },
  { name: '--shadow-floating', kind: 'shadow', definedIn: 'src/tokens/shadow.css', themed: false },
  { name: '--shadow-header', kind: 'shadow', definedIn: 'src/tokens/shadow.css', themed: false },
  { name: '--shadow-sm', kind: 'shadow', definedIn: 'src/tokens/shadow.css', themed: false },
  { name: '--shadow-xs', kind: 'shadow', definedIn: 'src/tokens/shadow.css', themed: false },
  { name: '--sidebar', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--sidebar-active', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  {
    name: '--sidebar-active-foreground',
    kind: 'color',
    definedIn: 'src/tokens/colors.css',
    themed: false,
  },
  { name: '--sidebar-border', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  {
    name: '--sidebar-foreground',
    kind: 'color',
    definedIn: 'src/tokens/colors.css',
    themed: false,
  },
  { name: '--sidebar-hover', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--sidebar-muted', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--sidebar-width', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  {
    name: '--sidebar-width-max',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  { name: '--space-1', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-10', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-12', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-2', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-3', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-4', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-5', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-6', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--space-8', kind: 'spacing', definedIn: 'src/tokens/spacing.css', themed: false },
  { name: '--success-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--success-soft', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--svc-shagi-bg', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  { name: '--svc-shagi-fg', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
  {
    name: '--text-body-primary',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--text-body-secondary',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  { name: '--text-caption', kind: 'font', definedIn: 'src/tokens/typography.css', themed: false },
  {
    name: '--text-hero-title',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--text-kpi-number',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--text-mobile-heading',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--text-page-title',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--text-section-title',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--text-small-meta',
    kind: 'font',
    definedIn: 'src/tokens/typography.css',
    themed: false,
  },
  {
    name: '--touch-target-min',
    kind: 'spacing',
    definedIn: 'src/tokens/spacing.css',
    themed: false,
  },
  { name: '--violet-500', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--violet-soft', kind: 'color', definedIn: 'src/tokens/colors.css', themed: true },
  { name: '--white', kind: 'color', definedIn: 'src/tokens/colors.css', themed: false },
];
