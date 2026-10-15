// Chart geometry ported from the prototype's vmCharts: fan, pedigree and descendant charts.

import type { TreeApi } from './family';
import { layDesc } from './layout';

export const BASE = ['#2F6FA8', '#C47A12', '#2E8B6A', '#8A5BA8', '#4FA3D9', '#C4581A', '#6B7A8C', '#A08524'];

export function mix(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export type ColourMode = 'sex' | 'branch' | 'line';

/** Blue for male, pink for female (charts also print M / F, so colour is never the only clue). */
export const SEX_COLOUR = { M: '#2F6DB5', F: '#C2477F', other: '#6B7A8C' };
export const sexColour = (T: TreeApi, id: string | undefined) => {
  const s = id ? T.person[id]?.sex : undefined;
  return s === 'M' ? SEX_COLOUR.M : s === 'F' ? SEX_COLOUR.F : SEX_COLOUR.other;
};

const nmLbl = (T: TreeApi, id: string, g: number) => {
  const p = T.person[id];
  if (g <= 2) return T.short(id);
  if (g === 3) return (p.given[0] ? p.given[0] + '. ' : '') + p.surname;
  return p.surname || T.first(id);
};
const yrs = (T: TreeApi, id: string) => T.years(id).replace('b. ', 'b.');

export interface FanSeg {
  d: string;
  fill: string;
  empty: boolean;
  tf: string;
  l1: string;
  l2: string;
  fs: number;
  y1: number;
  y2: number;
  pid?: string;
  childOf?: string;
  role: 'father' | 'mother';
}

export function fanChart(T: TreeApi, root: string, gens: number, colour: ColourMode, full: boolean) {
  const a = T.anc(root, gens);
  const r0 = full ? 72 : 84;
  const R = full ? 345 : 390;
  const w = (R - r0) / Math.max(1, gens - 1);
  const start = full ? 90 : 180;
  const span = full ? 360 : 180;
  const pt = (r: number, ang: number) => {
    const t = (ang * Math.PI) / 180;
    return [r * Math.cos(t), r * Math.sin(t)];
  };
  const segs: FanSeg[] = [];
  for (let g = 1; g < gens; g++) {
    const cnt = 2 ** g;
    for (let i = 0; i < cnt; i++) {
      const n = cnt + i;
      const id = a[n];
      const child = a[n >> 1];
      if (!id && !child) continue;
      const a0 = start + (span * i) / cnt;
      const a1 = start + (span * (i + 1)) / cnt;
      const ri = r0 + (g - 1) * w;
      const ro = ri + w;
      const P0 = pt(ri, a0);
      const P1 = pt(ro, a0);
      const P2 = pt(ro, a1);
      const P3 = pt(ri, a1);
      const lg = a1 - a0 > 180 ? 1 : 0;
      const d = `M${P0[0]} ${P0[1]}L${P1[0]} ${P1[1]}A${ro} ${ro} 0 ${lg} 1 ${P2[0]} ${P2[1]}L${P3[0]} ${P3[1]}A${ri} ${ri} 0 ${lg} 0 ${P0[0]} ${P0[1]}Z`;
      const fill =
        colour === 'sex'
          ? mix(id ? sexColour(T, id) : i % 2 ? SEX_COLOUR.F : SEX_COLOUR.M, 0.4 + g * 0.08)
          : colour === 'branch' ? (g >= 2 ? mix(BASE[(i >> (g - 2)) % BASE.length], 0.45 + g * 0.07) : mix('#B7862C', 0.55)) : mix(i < cnt / 2 ? '#2F6FA8' : '#C47A12', 0.4 + g * 0.09);
      const am = (a0 + a1) / 2;
      const rm = (ri + ro) / 2;
      const L = pt(rm, am);
      const nrm = ((am % 360) + 360) % 360;
      let rot: number;
      if (g <= 2) {
        rot = am + 90;
        if (nrm > 0 && nrm < 180) rot = am - 90;
      } else {
        rot = am;
        if (nrm > 90 && nrm < 270) rot = am + 180;
      }
      const fs = [0, 15, 13, 11.5, 10.5, 9.5, 9][g] || 9;
      segs.push({
        d,
        fill: id ? fill : 'none',
        empty: !id,
        tf: `translate(${L[0].toFixed(1)} ${L[1].toFixed(1)}) rotate(${rot.toFixed(1)})`,
        l1: id ? nmLbl(T, id, g) : 'Add ' + (n % 2 ? 'mother' : 'father'),
        l2: id && g <= 3 ? yrs(T, id) : '',
        fs,
        y1: id && g <= 3 ? -2 : 4,
        y2: fs + 1,
        pid: id,
        childOf: child,
        role: n % 2 ? 'mother' : 'father',
      });
    }
  }
  return { segs, vb: full ? '-360 -360 720 720' : '-405 -405 810 445', r0, full, rootPath: `M${-r0} 0 A${r0} ${r0} 0 0 1 ${r0} 0 Z` };
}

export interface PedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  pid?: string;
  childOf?: string;
  role: 'father' | 'mother';
  fill: string;
  stripe: string;
  name: string;
  years: string;
  showPhoto: boolean;
}

export function pedigreeChart(T: TreeApi, root: string, gens: number, colour: ColourMode, photos: boolean) {
  const a = T.anc(root, gens);
  const BW = 210;
  const GX = 245;
  const H = Math.max(600, 2 ** (gens - 1) * 44);
  const boxes: PedBox[] = [];
  const lines: string[] = [];
  for (let g = 0; g < gens; g++) {
    const cnt = 2 ** g;
    const slot = H / cnt;
    const bh = Math.min(64, slot - 6);
    for (let i = 0; i < cnt; i++) {
      const n = cnt + i;
      const id = a[n];
      const child = a[n >> 1];
      if (!id && (g === 0 || !child)) continue;
      const x = 20 + g * GX;
      const y = (i + 0.5) * slot - bh / 2;
      const bi = id ? (colour === 'sex' ? sexColour(T, id) : colour === 'branch' ? T.branch(id).colour : g === 0 ? '#6B7A8C' : i < cnt / 2 ? '#2F6FA8' : '#C47A12') : '#999';
      boxes.push({
        x,
        y,
        w: BW,
        h: bh,
        pid: id,
        childOf: child,
        role: n % 2 ? 'mother' : 'father',
        fill: id ? mix(bi, 0.82) : 'none',
        stripe: bi,
        name: id ? nmLbl(T, id, Math.min(g, 2)) : 'Add ' + (n % 2 ? 'mother' : 'father'),
        years: id && bh >= 40 ? yrs(T, id) : '',
        showPhoto: photos && !!id && bh >= 40,
      });
      if (g > 0) {
        const pcnt = cnt / 2;
        const cx2 = 20 + (g - 1) * GX + BW;
        const cy2 = ((i >> 1) + 0.5) * (H / pcnt);
        const py = (i + 0.5) * slot;
        lines.push(`M${cx2} ${cy2}H${cx2 + (GX - BW) / 2}V${py}H${x}`);
      }
    }
  }
  return { boxes, lines, vb: `0 0 ${40 + (gens - 1) * GX + BW} ${H}` };
}

export function descendantChart(T: TreeApi, root: string, gens: number, colour: ColourMode) {
  const lay = layDesc(T, root, gens - 1, { w: 150, h: 50 }, { compactGaps: true });
  const kids = T.children(root);
  const lineIdx = (id: string) => {
    let cur = id;
    for (let s = 0; s < 12; s++) {
      const ps = T.parents(cur);
      if (!ps.length) return -1;
      if (ps.includes(root)) return kids.indexOf(cur);
      cur = ps[0];
    }
    return -1;
  };
  const boxes = lay.nodes.map((n) => {
    const id = n.pid!;
    let c: string;
    if (colour === 'sex') c = sexColour(T, id);
    else if (colour === 'branch') c = T.branch(id).colour;
    else {
      const li = lineIdx(id);
      c = li < 0 ? '#6B7A8C' : BASE[li % 8];
    }
    const nm = T.short(id);
    return { x: n.x, y: n.y, pid: id, fill: mix(c, 0.82), stripe: c, name: nm.length > 20 ? (T.person[id].given[0] || '') + '. ' + T.person[id].surname : nm, years: T.years(id) };
  });
  return { vb: `0 0 ${lay.w} ${lay.h}`, lines: lay.lines.map((l) => l.d), boxes };
}
