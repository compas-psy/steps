/**
 * Числа через `Intl.NumberFormat` — тот же принцип, что в `date.ts`:
 * вызывающий код не собирает разделители тысяч/десятичных руками.
 */
export const DEFAULT_LOCALE = 'ru-RU' as const;

export interface FormatNumberOptions extends Intl.NumberFormatOptions {
  readonly locale?: string;
}

export function formatNumber(value: number, options: FormatNumberOptions = {}): string {
  const { locale = DEFAULT_LOCALE, ...numberOptions } = options;
  return new Intl.NumberFormat(locale, numberOptions).format(value);
}
