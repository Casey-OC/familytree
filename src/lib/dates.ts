import type { Fact, Qualifier } from './types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX: Record<string, number> = {};
MONTHS.forEach((m, i) => (MONTH_INDEX[m.toLowerCase()] = i));
['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].forEach(
  (m, i) => (MONTH_INDEX[m] = i),
);
MONTH_INDEX['sept'] = 8;

export function monthIndex(word: string): number | undefined {
  return MONTH_INDEX[word.toLowerCase().replace(/\.$/, '')];
}

/** The first four-digit year in a date as written, or null. */
export function yearOf(text: string | null | undefined): number | null {
  const m = text ? String(text).match(/\b(\d{4})\b/) : null;
  return m ? +m[1] : null;
}

export function factYear(f: Pick<Fact, 'date'> | undefined | null): number | null {
  return f ? yearOf(f.date) : null;
}

/** How a fact's date reads on screen: "abt 1890", "bet 1890 and 1892". */
export function dateLabel(f: Pick<Fact, 'date' | 'q' | 'date2'> | undefined | null): string {
  if (!f) return '';
  const d = f.date || 'date unknown';
  switch (f.q || 'exact') {
    case 'about':
      return 'abt ' + d;
    case 'before':
      return 'bef ' + d;
    case 'after':
      return 'aft ' + d;
    case 'between':
      return 'bet ' + d + ' and ' + (f.date2 || '?');
    default:
      return d;
  }
}

/** A full day-month-year date such as "12 Feb 1858" → its parts, else null. */
export function fullDate(text: string): { day: number; month: number; year: number } | null {
  const m = String(text || '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (!m) return null;
  const month = monthIndex(m[2]);
  if (month === undefined) return null;
  const day = +m[1];
  if (day < 1 || day > 31) return null;
  return { day, month, year: +m[3] };
}

/** Tidies typed dates: "14 march 1890" → "14 Mar 1890", "1890" stays. */
export function normaliseDate(text: string): string {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  const f = fullDate(t);
  if (f) return `${f.day} ${MONTHS[f.month]} ${f.year}`;
  const my = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (my && monthIndex(my[1]) !== undefined) return `${MONTHS[monthIndex(my[1])!]} ${my[2]}`;
  return t;
}

export function formatDay(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function todayLabel(): string {
  return formatDay(new Date());
}

export const QUALIFIERS: [Qualifier, string][] = [
  ['exact', 'Exact date'],
  ['about', 'About'],
  ['before', 'Before'],
  ['after', 'After'],
  ['between', 'Between'],
];

/** "Good morning" / "Good afternoon" / "Good evening" for the current hour. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function relativeTime(iso: string, now = new Date()): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const sameDay = t.toDateString() === now.toDateString();
  const time = t.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return 'Today, ' + time;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (t.toDateString() === y.toDateString()) return 'Yesterday, ' + time;
  return formatDay(t) + ', ' + time;
}
