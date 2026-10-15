// How old someone was at an event.

import { fullDate, monthIndex, yearOf } from './dates';
import type { Fact, Qualifier } from './types';

export interface Age {
  years: number;
  months?: number; // only for babies under 1, when both dates are exact
  approx: boolean;
}

function monthOf(text: string): number | undefined {
  const m = String(text || '')
    .trim()
    .match(/^([A-Za-z]{3,9})\.?\s+\d{4}$/);
  return m ? monthIndex(m[1]) : undefined;
}

/** Age between two dates as written (e.g. "12 Jul 1980", "Aug 1885", "1890"), or null if it can't be worked out. */
export function ageBetween(birth: string, at: string, birthQ: Qualifier = 'exact', atQ: Qualifier = 'exact'): Age | null {
  const by = yearOf(birth);
  const ay = yearOf(at);
  if (!by || !ay || ay < by) return null;
  const b = fullDate(birth);
  const a = fullDate(at);
  const loose = birthQ !== 'exact' || atQ !== 'exact';
  if (b && a) {
    let years = a.year - b.year;
    if (a.month < b.month || (a.month === b.month && a.day < b.day)) years--;
    if (years < 0) return null;
    if (years === 0) {
      let months = (a.year - b.year) * 12 + a.month - b.month;
      if (a.day < b.day) months--;
      return { years: 0, months: Math.max(0, months), approx: loose };
    }
    return { years, approx: loose };
  }
  // Partial dates: use months if both have them, otherwise the year gap (could be one less).
  const bm = b?.month ?? monthOf(birth);
  const am = a?.month ?? monthOf(at);
  if (bm !== undefined && am !== undefined) {
    let years = ay - by;
    if (am < bm) years--;
    return years < 0 ? null : { years, approx: loose || am === bm };
  }
  return { years: ay - by, approx: true };
}

/** "aged 34", "aged about 34", "aged 3 months" — or '' when there's no birth date or it's the birth itself. */
export function ageLabel(birth: Fact | undefined, f: Pick<Fact, 'type' | 'date' | 'q'>): string {
  if (!birth || f.type === 'Birth' || !f.date || !birth.date) return '';
  const age = ageBetween(birth.date, f.date, birth.q, f.q);
  if (!age) return '';
  if (age.years === 0 && age.months !== undefined) {
    if (age.months === 0) return age.approx ? 'aged under a month' : 'aged under 1 month';
    return `aged ${age.approx ? 'about ' : ''}${age.months} month${age.months === 1 ? '' : 's'}`;
  }
  if (age.years === 0) return 'aged under 1';
  return `aged ${age.approx ? 'about ' : ''}${age.years}`;
}
