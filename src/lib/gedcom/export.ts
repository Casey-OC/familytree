// Tree data → GEDCOM 5.5.1 (UTF-8), optionally leaving out living people.

import { toGedcomDate } from './dates';
import type { TreeApi } from '../family';
import type { Fact } from '../types';

export interface ExportOptions {
  sources: boolean;
  media: boolean;
  notes: boolean;
  excludeLiving: boolean;
  submitter?: string;
  treeName?: string;
}

const TAGS: Record<string, string> = {
  Birth: 'BIRT',
  Baptism: 'BAPM',
  Death: 'DEAT',
  Burial: 'BURI',
  Residence: 'RESI',
  Occupation: 'OCCU',
  Education: 'EDUC',
  Emigration: 'EMIG',
  Arrival: 'IMMI',
  Military: '_MILT',
};

const QUAY: Record<string, string> = { Primary: '3', Secondary: '2', Questionable: '1' };

/** Pushes a value, splitting long lines with CONC and line breaks with CONT. */
function push(L: string[], level: number, tag: string, value = '', xref = '') {
  const head = `${level} ${xref ? xref + ' ' : ''}${tag}`;
  const parts = String(value).replace(/\r/g, '').split('\n');
  const MAX = 200;
  parts.forEach((part, i) => {
    let rest = part;
    let first = true;
    do {
      const chunk = rest.slice(0, MAX);
      rest = rest.slice(MAX);
      if (i === 0 && first) L.push(chunk ? `${head} ${chunk}` : head);
      else L.push(`${level + 1} ${first ? 'CONT' : 'CONC'} ${chunk}`.trimEnd());
      first = false;
    } while (rest.length);
  });
}

export function exportGedcom(T: TreeApi, opts: ExportOptions): { text: string; people: number; families: number; excluded: number; lines: number } {
  const d = T.data;
  const people = d.people.filter((p) => !(opts.excludeLiving && p.living));
  const ids: Record<string, string> = {};
  people.forEach((p, i) => (ids[p.id] = `@I${i + 1}@`));
  const srcIds: Record<string, string> = {};
  d.sources.forEach((s, i) => (srcIds[s.id] = `@S${i + 1}@`));
  const repos: string[] = [...new Set(d.sources.map((s) => s.repo).filter(Boolean))];
  const repoIds: Record<string, string> = {};
  repos.forEach((r, i) => (repoIds[r] = `@R${i + 1}@`));
  const mediaShown = opts.media ? d.media.filter((m) => m.file || m.originalName) : [];
  const objIds: Record<string, string> = {};
  mediaShown.forEach((m, i) => (objIds[m.id] = `@O${i + 1}@`));

  const L: string[] = [];
  const now = new Date();
  push(L, 0, 'HEAD');
  push(L, 1, 'SOUR', 'FAMILYTREE');
  push(L, 2, 'NAME', 'Family Tree');
  push(L, 2, 'VERS', '0.4.0');
  push(L, 1, 'DATE', toGedcomDate(`${now.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()]} ${now.getFullYear()}`, 'exact'));
  if (opts.treeName) push(L, 1, 'FILE', opts.treeName.replace(/[\\/:*?"<>|]/g, '') + '.ged');
  push(L, 1, 'SUBM', '@U1@');
  push(L, 1, 'GEDC');
  push(L, 2, 'VERS', '5.5.1');
  push(L, 2, 'FORM', 'LINEAGE-LINKED');
  push(L, 1, 'CHAR', 'UTF-8');

  const citeLines = (f: Fact, level: number) => {
    if (!opts.sources) return;
    for (const cid of f.citeIds) {
      const c = T.cite[cid];
      if (!c || !srcIds[c.sourceId]) continue;
      push(L, level, 'SOUR', srcIds[c.sourceId]);
      if (c.page) push(L, level + 1, 'PAGE', c.page);
      if (c.extract || c.accessed) {
        push(L, level + 1, 'DATA');
        if (c.accessed) push(L, level + 2, 'DATE', toGedcomDate(c.accessed, 'exact'));
        if (c.extract) push(L, level + 2, 'TEXT', c.extract);
      }
      push(L, level + 1, 'QUAY', QUAY[c.quality] || '2');
    }
  };
  const eventBody = (f: Fact, level: number) => {
    const date = toGedcomDate(f.date, f.q, f.date2);
    if (date) push(L, level, 'DATE', date);
    const pl = T.place[f.placeId];
    if (pl) {
      push(L, level, 'PLAC', pl.hist || pl.name);
      if (pl.lat !== null && pl.lon !== null) {
        push(L, level + 1, 'MAP');
        push(L, level + 2, 'LATI', (pl.lat >= 0 ? 'N' : 'S') + Math.abs(pl.lat));
        push(L, level + 2, 'LONG', (pl.lon >= 0 ? 'E' : 'W') + Math.abs(pl.lon));
      }
    }
    citeLines(f, level);
  };

  // Families: one per couple, plus single-parent families for children with only one parent in the export.
  type Fam = { id: string; h?: string; w?: string; kids: string[]; marr?: Fact; end?: string };
  const fams: Fam[] = [];
  const famOf = (a?: string, b?: string) => {
    let f = fams.find((x) => (x.h === a && x.w === b) || (x.h === b && x.w === a));
    if (!f) {
      const pa = a ? T.person[a] : undefined;
      const swap = pa && pa.sex === 'F';
      f = { id: `@F${fams.length + 1}@`, h: swap ? b : a, w: swap ? a : b, kids: [] };
      fams.push(f);
    }
    return f;
  };
  for (const r of d.rels) {
    if (r.type !== 'spouse' || !ids[r.a] || !ids[r.b]) continue;
    const f = famOf(r.a, r.b);
    f.end = r.end;
  }
  for (const p of people) {
    const ps = T.parents(p.id).filter((x) => ids[x]);
    if (!ps.length) continue;
    const f = ps.length >= 2 ? famOf(ps[0], ps[1]) : famOf(ps[0], undefined);
    if (!f.kids.includes(p.id)) f.kids.push(p.id);
  }
  for (const f of fams) {
    if (f.h && f.w) {
      const ms = T.factsOf(f.h).filter((x) => x.type === 'Marriage');
      f.marr = ms.find((x) => x.desc.includes(T.first(f.w!))) || (T.spouses(f.h).length === 1 ? ms[0] : undefined);
    }
  }

  for (const p of people) {
    push(L, 0, 'INDI', '', ids[p.id]);
    push(L, 1, 'NAME', `${p.given} /${p.surname}/`.trim());
    if (p.given) push(L, 2, 'GIVN', p.given);
    if (p.surname) push(L, 2, 'SURN', p.surname);
    push(L, 1, 'SEX', p.sex === 'X' ? 'U' : p.sex);
    for (const f of T.factsOf(p.id)) {
      if (f.type === 'Marriage') continue;
      const tag = TAGS[f.type];
      if (tag === 'OCCU') push(L, 1, 'OCCU', f.desc);
      else if (tag) {
        push(L, 1, tag, f.type === 'Death' && !f.date && !f.placeId ? 'Y' : '');
        if (f.desc) push(L, 2, 'NOTE', f.desc);
      } else {
        push(L, 1, 'EVEN');
        push(L, 2, 'TYPE', f.type === 'Other' ? f.desc.split(':')[0] || 'Event' : f.type);
        if (f.desc) push(L, 2, 'NOTE', f.desc);
      }
      eventBody(f, 2);
    }
    for (const f of fams) if (f.kids.includes(p.id)) push(L, 1, 'FAMC', f.id);
    for (const f of fams) if (f.h === p.id || f.w === p.id) push(L, 1, 'FAMS', f.id);
    if (opts.notes && p.notes) push(L, 1, 'NOTE', p.notes);
    if (opts.media) for (const m of mediaShown) if (m.people.includes(p.id) || m.faces.some((x) => x.personId === p.id)) push(L, 1, 'OBJE', objIds[m.id]);
  }

  for (const f of fams) {
    push(L, 0, 'FAM', '', f.id);
    if (f.h) push(L, 1, 'HUSB', ids[f.h]);
    if (f.w) push(L, 1, 'WIFE', ids[f.w]);
    for (const k of f.kids) push(L, 1, 'CHIL', ids[k]);
    if (f.marr) {
      push(L, 1, 'MARR');
      eventBody(f.marr, 2);
    }
    if (f.end) {
      push(L, 1, 'DIV');
      if (/\d{4}/.test(f.end)) push(L, 2, 'DATE', toGedcomDate(f.end, 'exact'));
    }
  }

  if (opts.sources) {
    for (const s of d.sources) {
      push(L, 0, 'SOUR', '', srcIds[s.id]);
      push(L, 1, 'TITL', s.title);
      if (s.repo) push(L, 1, 'REPO', repoIds[s.repo]);
      if (s.url) push(L, 1, 'WWW', s.url);
      if (s.type) push(L, 1, 'NOTE', 'Type: ' + s.type);
    }
    for (const r of repos) {
      push(L, 0, 'REPO', '', repoIds[r]);
      push(L, 1, 'NAME', r);
    }
  }
  for (const m of mediaShown) {
    push(L, 0, 'OBJE', '', objIds[m.id]);
    push(L, 1, 'FILE', m.file || m.originalName);
    const ext = (m.file || m.originalName).split('.').pop()?.toLowerCase() || '';
    push(L, 2, 'FORM', ext === 'jpg' ? 'jpeg' : ext || 'unknown');
    push(L, 2, 'TITL', m.title);
  }
  push(L, 0, 'SUBM', '', '@U1@');
  push(L, 1, 'NAME', opts.submitter || 'Family Tree user');
  push(L, 0, 'TRLR');
  return { text: L.join('\n') + '\n', people: people.length, families: fams.length, excluded: d.people.length - people.length, lines: L.length };
}
