import cs, { type Dict } from './cs';
import en from './en';

export const locales = ['cs', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'cs';

const dicts: Record<Locale, Dict> = { cs, en };

export function useDict(locale: Locale): Dict {
  return dicts[locale];
}

export const routes = {
  home: { cs: '/', en: '/en/' },
  explore: { cs: '/prozkoumat/', en: '/en/explore/' },
  data: { cs: '/data/', en: '/en/data/' },
} as const;
export type RouteKey = keyof typeof routes;

export const ogLocale: Record<Locale, string> = { cs: 'cs_CZ', en: 'en_US' };
export const otherLocale = (locale: Locale): Locale => (locale === 'cs' ? 'en' : 'cs');

export function formatNumber(locale: Locale, value: number, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDate(locale: Locale, date: Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
    ...opts,
  }).format(date);
}
