// Tree layouts ported from the prototype (layDesc, layPed).

import type { TreeApi } from './family';

export interface Dims {
  w: number;
  h: number;
}

export interface LayoutNode {
  pid?: string;
  x: number;
  y: number;
  primary?: boolean;
  nk?: number; // number of children (for the expand/collapse toggle)
  open?: boolean;
  empty?: boolean; // "Add father/mother" placeholder
  child?: string;
  role?: 'father' | 'mother';
}

export interface LayoutLine {
  d: string;
  cls: string;
}

export interface Layout {
  nodes: LayoutNode[];
  lines: LayoutLine[];
  w: number;
  h: number;
  CW: number;
  CH: number;
}

interface Measure {
  pid: string;
  sp: string[];
  ks: Measure[];
  ownW: number;
  kw: number;
  w: number;
  nk: number;
  open: boolean;
  d: number;
}

/** Descendant layout: a person, their partners side by side, and children spread beneath. */
export function layDesc(
  T: TreeApi,
  root: string,
  maxD: number,
  dims: Dims,
  opts: { collapsed?: Record<string, boolean>; compactGaps?: boolean } = {},
): Layout {
  const CW = dims.w;
  const CH = dims.h;
  const SG = 18;
  const GAP = opts.compactGaps ? 24 : 40;
  const LH = CH + (opts.compactGaps ? 50 : 84);
  const PAD = 40;
  const nodes: LayoutNode[] = [];
  const lines: LayoutLine[] = [];
  if (!root || !T.person[root]) return { nodes, lines, w: 400, h: 300, CW, CH };
  const seen = new Set<string>();
  const collapsed = opts.collapsed || {};

  const measure = (pid: string, d: number): Measure => {
    seen.add(pid);
    const sp = T.spouses(pid).filter((s) => !seen.has(s));
    sp.forEach((s) => seen.add(s));
    const all = T.children(pid);
    const open = !collapsed[pid] && d < maxD;
    const ks = open ? all.filter((k) => !seen.has(k)).map((k) => measure(k, d + 1)) : [];
    const ownW = (1 + sp.length) * CW + sp.length * SG;
    const kw = ks.reduce((a, k) => a + k.w, 0) + Math.max(0, ks.length - 1) * GAP;
    return { pid, sp, ks, ownW, kw, w: Math.max(ownW, kw), nk: all.length, open, d };
  };

  let maxY = 0;
  const place = (m: Measure, x0: number, y: number) => {
    const cx = x0 + m.w / 2;
    const sx = cx - m.ownW / 2;
    maxY = Math.max(maxY, y);
    [m.pid, ...m.sp].forEach((id, i) =>
      nodes.push({ pid: id, x: sx + i * (CW + SG), y, primary: i === 0, nk: i === 0 ? m.nk : 0, open: m.open }),
    );
    m.sp.forEach((_, i) => {
      const x1 = sx + i * (CW + SG) + CW;
      lines.push({ d: `M${x1} ${y + CH / 2}H${x1 + SG}`, cls: 'ln sp' });
    });
    if (m.ks.length) {
      const dropX = m.sp.length ? sx + CW + SG / 2 : sx + CW / 2;
      const dropY = m.sp.length ? y + CH / 2 : y + CH;
      const busY = y + CH + (LH - CH) / 2;
      const cy = y + LH;
      let kx = x0 + (m.w - m.kw) / 2;
      const cxs: number[] = [];
      m.ks.forEach((k) => {
        const kcx = kx + k.w / 2 - k.ownW / 2 + CW / 2;
        cxs.push(kcx);
        place(k, kx, cy);
        kx += k.w + GAP;
      });
      lines.push({ d: `M${dropX} ${dropY}V${busY}`, cls: 'ln' });
      lines.push({ d: `M${Math.min(dropX, ...cxs)} ${busY}H${Math.max(dropX, ...cxs)}`, cls: 'ln' });
      cxs.forEach((x) => lines.push({ d: `M${x} ${busY}V${cy}`, cls: 'ln' }));
    }
  };

  const m = measure(root, 0);
  place(m, PAD, PAD);
  return { nodes, lines, w: m.w + PAD * 2, h: maxY + CH + PAD + 20, CW, CH };
}

/** Pedigree layout: ancestors above, the focus person at the bottom. */
export function layPed(T: TreeApi, root: string, gens: number, dims: Dims): Layout {
  const CW = dims.w;
  const CH = dims.h;
  const LH = CH + 84;
  const PAD = 40;
  const SLOT = CW + 24;
  const G = gens - 1;
  const W = 2 ** G * SLOT;
  const nodes: LayoutNode[] = [];
  const lines: LayoutLine[] = [];
  if (!root || !T.person[root]) return { nodes, lines, w: 400, h: 300, CW, CH };
  const a = T.anc(root, gens);
  const pos = (n: number) => {
    const g = Math.floor(Math.log2(n));
    const i = n - 2 ** g;
    return { x: PAD + ((i + 0.5) * W) / 2 ** g - CW / 2, y: PAD + (G - g) * LH, g };
  };
  for (let n = 1; n < 2 ** gens; n++) {
    const p = pos(n);
    if (a[n]) nodes.push({ pid: a[n], x: p.x, y: p.y, primary: true, nk: 0, open: true });
    else if (n > 1 && a[n >> 1]) nodes.push({ empty: true, child: a[n >> 1], role: n % 2 === 0 ? 'father' : 'mother', x: p.x, y: p.y });
    if (a[n] && p.g < G) {
      const f = pos(2 * n);
      const mo = pos(2 * n + 1);
      const cx = p.x + CW / 2;
      const mid = p.y - (LH - CH) / 2;
      lines.push({ d: `M${cx} ${p.y}V${mid}`, cls: 'ln' });
      lines.push({ d: `M${f.x + CW / 2} ${mid}H${mo.x + CW / 2}`, cls: 'ln' });
      lines.push({ d: `M${f.x + CW / 2} ${mid}V${f.y + CH}M${mo.x + CW / 2} ${mid}V${mo.y + CH}`, cls: 'ln' });
    }
  }
  return { nodes, lines, w: W + PAD * 2, h: PAD * 2 + G * LH + CH, CW, CH };
}
