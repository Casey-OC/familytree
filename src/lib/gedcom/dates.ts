// Converting dates between GEDCOM ("ABT 12 FEB 1858") and the app ("12 Feb 1858" + qualifier).

import { MONTHS, fullDate, monthIndex } from '../dates';
import type { Qualifier } from '../types';

const SIMPLE = /^(?:(\d{1,2})\s+)?(?:([A-Za-z]{3,9})\.?\s+)?(\d{3,4})(?:\/\d{1,2})?$/;

function tidy(part: string): string | null {
  const t = part.trim().replace(/\s+/g, ' ');
  const m = t.match(SIMPLE);
  if (!m) return null;
  const [, d, mon, y] = m;
  if (mon !== undefined && monthIndex(mon) === undefined) return null;
  if (d && !mon) return null;
  const month = mon !== undefined ? MONTHS[monthIndex(mon)!] : '';
  return [d ? String(+d) : '', month, y].filter(Boolean).join(' ');
}

export interface ParsedDate {
  date: string;
  q: Qualifier;
  date2: string;
  ok: boolean; // false → kept as free text
}

export function fromGedcomDate(raw: string): ParsedDate {
  let s = raw.trim();
  if (!s) return { date: '', q: 'exact', date2: '', ok: true };
  // Interpreted dates and date phrases: "INT 1890 (from census)" / "(Spring 1902)"
  const phrase = s.match(/^\((.*)\)$/);
  if (phrase) return { date: phrase[1], q: 'exact', date2: '', ok: false };
  s = s.replace(/^INT\s+/i, '').replace(/\s*\(.*\)\s*$/, '');
  s = s.replace(/@#D[A-Z ]+@\s*/gi, ''); // calendar escapes such as @#DGREGORIAN@
  const up = s.toUpperCase();
  let m: RegExpMatchArray | null;
  if ((m = up.match(/^BET\s+(.+?)\s+AND\s+(.+)$/)) || (m = up.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/))) {
    const a = tidy(m[1]);
    const b = tidy(m[2]);
    if (a && b) return { date: a, q: 'between', date2: b, ok: true };
  } else if ((m = up.match(/^(ABT|CAL|EST|ABOUT|C\.?|CIRCA)\s+(.+)$/))) {
    const a = tidy(m[2]);
    if (a) return { date: a, q: 'about', date2: '', ok: true };
  } else if ((m = up.match(/^(BEF|TO)\s+(.+)$/))) {
    const a = tidy(m[2]);
    if (a) return { date: a, q: 'before', date2: '', ok: true };
  } else if ((m = up.match(/^(AFT|FROM)\s+(.+)$/))) {
    const a = tidy(m[2]);
    if (a) return { date: a, q: 'after', date2: '', ok: true };
  } else {
    const a = tidy(s);
    if (a) return { date: a, q: 'exact', date2: '', ok: true };
  }
  return { date: raw.trim(), q: 'exact', date2: '', ok: false };
}

function toPart(text: string): string | null {
  const t = text.trim();
  const f = fullDate(t);
  if (f) return `${f.day} ${MONTHS[f.month].toUpperCase()} ${f.year}`;
  const m = t.match(SIMPLE);
  if (!m) return null;
  const [, d, mon, y] = m;
  if (mon !== undefined && monthIndex(mon) === undefined) return null;
  return [d, mon !== undefined ? MONTHS[monthIndex(mon)!].toUpperCase() : '', y].filter(Boolean).join(' ');
}

export function toGedcomDate(date: string, q: Qualifier, date2 = ''): string {
  if (!date.trim()) return '';
  const a = toPart(date);
  if (!a) return `(${date.trim()})`;
  switch (q) {
    case 'about':
      return 'ABT ' + a;
    case 'before':
      return 'BEF ' + a;
    case 'after':
      return 'AFT ' + a;
    case 'between': {
      const b = toPart(date2);
      return b ? `BET ${a} AND ${b}` : 'AFT ' + a;
    }
    default:
      return a;
  }
}
