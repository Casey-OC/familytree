import React, { useEffect, useRef } from 'react';
import { useData } from '../data/store';
import { treeApi } from '../lib/family';
import { mediaUrl } from '../data/platform';
import { confLabel } from '../lib/confidence';
import type { Confidence } from '../lib/types';
import { openPerson } from '../data/actions';

const PATHS: Record<string, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  tree: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M12 7.5V12M6 16.5V12h12v4.5" />
    </>
  ),
  home: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.6c2.6.1 4.6 1.8 5.5 4.9" />
    </>
  ),
  wall: <path d="M4 5h16v11H9l-5 4z" />,
  sources: <path d="M4 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4zM20 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z" />,
  media: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-9 8.5" />
    </>
  ),
  map: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  charts: (
    <>
      <path d="M3 18a9 9 0 0 1 18 0z" />
      <path d="M12 18 6 11.5M12 18l6-6.5M12 18V9" />
    </>
  ),
  research: (
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11" />
      <circle cx="5" cy="18" r="1.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  pin: <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  upload: <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  star: <path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  offline: <path d="M3 9.5a14 14 0 0 1 18 0M6.5 13a9 9 0 0 1 11 0M10 16.5a4 4 0 0 1 4 0M3 3l18 18" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />,
};

export function Icon({ name, sm, className }: { name: keyof typeof PATHS | string; sm?: boolean; className?: string }) {
  return (
    <svg className={'ico' + (sm ? ' sm' : '') + (className ? ' ' + className : '')} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** A person's avatar: their chosen photo (cropped to their face), the sample illustration, or initials. */
export function Avatar({ pid, size = '', style }: { pid: string; size?: '' | 'sm' | 'xs' | 'lg'; style?: React.CSSProperties }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const p = T.person[pid];
  const cls = 'av' + (size ? ' ' + size : '');
  if (!p) return <span className={cls} aria-hidden="true">?</span>;
  if (p.photoMediaId) {
    const m = T.media[p.photoMediaId];
    const url = m ? mediaUrl(m.thumb || m.file) : '';
    if (url) {
      const face = m.faces.find((f) => f.personId === pid);
      const S = 4; // zoom so the face fills the circle
      const pos = face ? `${Math.max(0, Math.min(100, (face.x * S - 50) / (S - 1)))}% ${Math.max(0, Math.min(100, (face.y * S - 50) / (S - 1)))}%` : 'center';
      return (
        <span
          className={cls + ' img'}
          aria-hidden="true"
          style={{ backgroundImage: `url("${url}")`, backgroundSize: face ? `${S * 100}% auto` : 'cover', backgroundPosition: pos, ...style }}
        />
      );
    }
  }
  return (
    <span className={cls + (p.avatar ? ' ' + p.avatar : '')} aria-hidden="true" style={style}>
      {T.ini(pid)}
    </span>
  );
}

/** A person's name that opens their profile — "one person, one place". */
export function PersonLink({ pid, label, className = 'link', style }: { pid: string; label?: string; className?: string; style?: React.CSSProperties }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  return (
    <button className={className} style={style} onClick={() => openPerson(pid)}>
      {label ?? T.nm(pid)}
    </button>
  );
}

export function Conf({ c }: { c: Confidence }) {
  return <span className={'conf conf-' + c.toLowerCase()}>{confLabel(c)}</span>;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} className={value === k ? 'on' : ''} aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <>
      <span className="swlbl">{on ? 'On' : 'Off'}</span>
      <button className={'sw' + (on ? ' on' : '')} onClick={onToggle} role="switch" aria-checked={on} aria-label={label} disabled={disabled} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} />
    </>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function ModalFrame({ label, children, wide, width, onClose }: { label: string; children: React.ReactNode; wide?: boolean; width?: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('input, select, textarea, button.primary, button');
    first?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children, illo = 'check' }: { children: React.ReactNode; illo?: 'check' | 'photo' | 'post' }) {
  return (
    <div className="empty">
      <svg className="illo" viewBox="0 0 120 90" aria-hidden="true">
        {illo === 'check' && (
          <>
            <circle className="fillsoft" cx="60" cy="42" r="28" />
            <path d="m46 42 9 9 19-19" />
          </>
        )}
        {illo === 'photo' && (
          <>
            <rect className="fillsoft" x="22" y="16" width="76" height="56" rx="6" />
            <circle cx="44" cy="36" r="6" />
            <path d="m98 62-24-22-40 32" />
          </>
        )}
        {illo === 'post' && <path className="fillsoft" d="M20 18h80v44H46l-18 14V62h-8z" />}
      </svg>
      {children}
    </div>
  );
}

/** Text input bound to a place name, suggesting existing places. */
export function PlaceInput({ value, onChange, id, placeholder = 'Town, region, country' }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string }) {
  const places = useData((s) => s.data.places);
  const listId = 'places-list';
  return (
    <>
      <input id={id} list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
      <datalist id={listId}>
        {places.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
    </>
  );
}

export function fmtBytes(n: number): string {
  if (!n) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export function mmss(s: number): string {
  s = Math.floor(s || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
