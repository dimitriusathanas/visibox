import { useMemo } from 'react';

import { daysBetween } from '../shared/dates.ts';
import type { Days, Lang, LocalizedName, Unit } from '../shared/types.ts';
import { useFridge } from '../state/store';
import { STRINGS, type StringKey } from './strings';

export type { StringKey };

type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: StringKey, vars?: Vars): string {
  let s: string = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Count-aware: uses `${key}_one` when n is 1 and that key exists. */
export function translateCount(lang: Lang, key: StringKey, n: number, vars?: Vars): string {
  const one = `${key}_one` as StringKey;
  const k = n === 1 && one in STRINGS.en ? one : key;
  return translate(lang, k, { n: formatNumber(n, lang), ...vars });
}

export interface T {
  (key: StringKey, vars?: Vars): string;
  n: (key: StringKey, n: number, vars?: Vars) => string;
  lang: Lang;
}

export function makeT(lang: Lang): T {
  const t = ((key: StringKey, vars?: Vars) => translate(lang, key, vars)) as T;
  t.n = (key, n, vars) => translateCount(lang, key, n, vars);
  t.lang = lang;
  return t;
}

export function useT(): T {
  const lang = useFridge((s) => s.settings.lang);
  return useMemo(() => makeT(lang), [lang]);
}

export function locale(lang: Lang): string {
  return lang === 'bg' ? 'bg-BG' : 'en-US';
}

export function formatNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(n);
}

export function itemName(name: LocalizedName, lang: Lang): string {
  return (lang === 'bg' ? name.bg || name.en : name.en || name.bg) || '?';
}

export function formatQty(qty: number, unit: Unit, lang: Lang): string {
  const u = translate(lang, `unit_${unit}` as StringKey);
  if (unit === 'pcs') return `×${formatNumber(qty, lang)}`;
  return `${formatNumber(qty, lang)} ${u}`;
}

/** "Thu 23 Oct" style. */
export function formatDay(day: string, lang: Lang): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** For "Eat by …": tomorrow / Wed / Nov 11. */
export function dueLabel(day: string, today: string, lang: Lang): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return translate(lang, 'today');
  if (diff === 1) return translate(lang, 'tomorrow');
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const opts: Intl.DateTimeFormatOptions =
    diff > 1 && diff <= 6 ? { weekday: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (Math.abs(diff) > 300) opts.year = 'numeric';
  return new Intl.DateTimeFormat(locale(lang), opts).format(date);
}

/** today / tomorrow / in 3 days / Thu 30 Oct. */
export function relativeDay(day: string, today: string, lang: Lang): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return translate(lang, 'today');
  if (diff === 1) return translate(lang, 'tomorrow');
  if (diff === -1) return translate(lang, 'yesterday');
  if (diff > 1 && diff <= 6) return translate(lang, 'in_days', { n: diff });
  if (diff < -1 && diff >= -6) return translate(lang, 'days_ago', { n: -diff });
  return formatDay(day, lang);
}

function formatSpan(days: number, lang: Lang): { n: number; key: StringKey } {
  if (days >= 330) return { n: Math.round(days / 365), key: 'years_count' };
  if (days >= 45) return { n: Math.round(days / 30), key: 'months_count' };
  return { n: Math.round(days), key: 'days_count' };
}

/** "1–2 days", "9 months", "3–4 weeks" stays in days for clarity. */
export function formatRange([min, max]: Days, lang: Lang): string {
  const a = formatSpan(Math.max(min, 1), lang);
  const b = formatSpan(Math.max(max, 1), lang);
  if (a.key === b.key && a.n !== b.n) {
    return translateCount(lang, b.key, b.n).replace(formatNumber(b.n, lang), `${formatNumber(a.n, lang)}–${formatNumber(b.n, lang)}`);
  }
  return translateCount(lang, b.key, b.n);
}

export function formatMoney(value: number, currency: string | undefined, lang: Lang): string {
  try {
    return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: currency || 'EUR' }).format(value);
  } catch {
    return `${formatNumber(value, lang)} ${currency ?? ''}`.trim();
  }
}
