// A date field with a calendar button. You can pick a day from the calendar, or type a
// partial date such as "1890" or "Aug 1885" — family history records are often incomplete.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MONTHS, fullDate, monthIndex, normaliseDate } from '../lib/dates';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Where the calendar should open for a typed value: its day, month and year if present. */
export function parseForCalendar(value: string, fallback = new Date()): { y: number; m: number; d: number | null } {
  const f = fullDate(value);
  if (f) return { y: f.year, m: f.month, d: f.day };
  const my = value.trim().match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (my && monthIndex(my[1]) !== undefined) return { y: +my[2], m: monthIndex(my[1])!, d: null };
  const y = value.match(/\b(\d{4})\b/);
  if (y) return { y: +y[1], m: 0, d: null };
  return { y: fallback.getFullYear(), m: fallback.getMonth(), d: null };
}

export function daysIn(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

/** Monday-first grid for a month: leading blanks (null) then day numbers. */
export function monthGrid(y: number, m: number): (number | null)[] {
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = Array(first).fill(null);
  for (let d = 1; d <= daysIn(y, m); d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function DateInput({
  value,
  onChange,
  id,
  placeholder = 'e.g. 14 Mar 1890 or 1890',
  label = 'date',
  autoFocus,
  maxYear = new Date().getFullYear() + 1,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  maxYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const start = parseForCalendar(value);
  const [view, setView] = useState({ y: start.y, m: start.m });
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const openCal = () => {
    const s = parseForCalendar(value);
    setView({ y: Math.min(s.y, maxYear), m: s.m });
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    const W = 300;
    const H = 360;
    let left = Math.min(r.left, window.innerWidth - W - 8);
    let top = r.bottom + 6;
    if (top + H > window.innerHeight - 8) top = Math.max(8, r.top - H - 6);
    left = Math.max(8, left);
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !wrap.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    // Focus the selected (or first) day for keyboard users.
    setTimeout(() => (pop.current?.querySelector<HTMLButtonElement>('.cal-day.on, .cal-day.today, .cal-day') ?? null)?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const sel = parseForCalendar(value);
  const selectedDay = fullDate(value) ? sel : null;
  const today = new Date();
  const pick = (d: number) => {
    onChange(`${d} ${MONTHS[view.m]} ${view.y}`);
    setOpen(false);
    wrap.current?.querySelector('input')?.focus();
  };
  const shift = (n: number) => {
    let m = view.m + n;
    let y = view.y;
    while (m < 0) {
      m += 12;
      y--;
    }
    while (m > 11) {
      m -= 12;
      y++;
    }
    setView({ y: Math.min(Math.max(y, 1000), maxYear), m });
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.cal-day');
    if (!btn) return;
    const d = +(btn.dataset.day || 0);
    const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in move)) return;
    e.preventDefault();
    let nd = d + move[e.key];
    if (nd < 1) {
      shift(-1);
      nd = daysIn(view.m === 0 ? view.y - 1 : view.y, (view.m + 11) % 12) + nd;
    } else if (nd > daysIn(view.y, view.m)) {
      nd = nd - daysIn(view.y, view.m);
      shift(1);
    }
    setTimeout(() => pop.current?.querySelector<HTMLButtonElement>(`.cal-day[data-day="${nd}"]`)?.focus(), 0);
  };

  const years: number[] = [];
  for (let y = maxYear; y >= 1500; y--) years.push(y);

  return (
    <div className="dateinput" ref={wrap}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const n = normaliseDate(e.target.value);
          if (n !== e.target.value) onChange(n);
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <button type="button" className="cal-btn" onClick={() => (open ? setOpen(false) : openCal())} aria-label={`Choose ${label} from a calendar`} aria-expanded={open} aria-haspopup="dialog">
        <svg className="ico sm" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={pop} className="calpop" role="dialog" aria-label={`Choose ${label}`} style={{ left: pos.left, top: pos.top }}>
            <div className="cal-head">
              <button type="button" className="cal-nav" onClick={() => shift(-1)} aria-label="Previous month">
                ‹
              </button>
              <select value={view.m} onChange={(e) => setView({ ...view, m: +e.target.value })} aria-label="Month">
                {MONTH_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
              <select value={view.y} onChange={(e) => setView({ ...view, y: +e.target.value })} aria-label="Year">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="button" className="cal-nav" onClick={() => shift(1)} aria-label="Next month">
                ›
              </button>
            </div>
            <div className="cal-grid" role="grid" onKeyDown={onGridKey}>
              {WEEKDAYS.map((w) => (
                <span key={w} className="cal-wd" aria-hidden="true">
                  {w}
                </span>
              ))}
              {monthGrid(view.y, view.m).map((d, i) =>
                d === null ? (
                  <span key={'b' + i} />
                ) : (
                  <button
                    key={d}
                    type="button"
                    data-day={d}
                    className={
                      'cal-day' +
                      (selectedDay && selectedDay.d === d && selectedDay.m === view.m && selectedDay.y === view.y ? ' on' : '') +
                      (today.getDate() === d && today.getMonth() === view.m && today.getFullYear() === view.y ? ' today' : '')
                    }
                    onClick={() => pick(d)}
                    aria-label={`${d} ${MONTH_NAMES[view.m]} ${view.y}`}
                  >
                    {d}
                  </button>
                ),
              )}
            </div>
            <div className="cal-foot">
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  onChange(`${MONTHS[view.m]} ${view.y}`);
                  setOpen(false);
                }}
              >
                Just {MONTHS[view.m]} {view.y}
              </button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  onChange(String(view.y));
                  setOpen(false);
                }}
              >
                Just {view.y}
              </button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  const t = new Date();
                  onChange(`${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`);
                  setOpen(false);
                }}
              >
                Today
              </button>
            </div>
          </div>,
          document.querySelector('.app') || document.body,
        )}
    </div>
  );
}
