// Read-only helpers over a TreeData snapshot: lookups, relationships, labels.
// Built once per snapshot (cached), so components can call these freely.

import { confOf } from './confidence';
import { dateLabel, factYear } from './dates';
import type { Citation, Confidence, Fact, Media, Person, Place, Source, TagInfo, TreeData } from './types';

const BRANCH_COLOURS = ['#2F6FA8', '#C47A12', '#2E8B6A', '#7B5BA6', '#4FA3D9', '#C4581A', '#A08524', '#8A5BA8'];
const FOUNDERS_COLOUR = '#3D6B57';
const OTHER_COLOURS = ['#B4562A', '#6B7A8C', '#8C6B3E', '#5E7F8C'];

export interface BranchInfo {
  key: string;
  label: string;
  colour: string;
}

export interface TreeApi {
  data: TreeData;
  person: Record<string, Person>;
  fact: Record<string, Fact>;
  source: Record<string, Source>;
  cite: Record<string, Citation>;
  media: Record<string, Media>;
  place: Record<string, Place>;
  rootId: string;
  nm(id: string): string;
  short(id: string): string;
  first(id: string): string;
  ini(id: string): string;
  sortName(id: string): string;
  factsOf(id: string): Fact[];
  ff(id: string, type: string): Fact | undefined;
  birthYear(id: string): number;
  years(id: string): string;
  parents(id: string): string[];
  children(id: string): string[];
  spouses(id: string): string[];
  siblings(id: string): string[];
  spouseRelId(a: string, b: string): string | undefined;
  conf(f: Fact): Confidence;
  unvCount(id: string): number;
  hintCount(id: string): number;
  placeName(id: string): string;
  mediaOf(id: string): Media[];
  /** Photos and files on someone's profile: tagged or linked, and not hidden or waiting for approval. */
  profileMedia(id: string): Media[];
  tagOf(m: Media, id: string): TagInfo;
  branch(id: string): BranchInfo;
  branches(): BranchInfo[];
  generations(): number;
  peopleSorted(): Person[];
  lineOf(root: string): string[];
  anc(root: string, gens: number): Record<number, string>;
}

const cache = new WeakMap<TreeData, TreeApi>();

export function treeApi(data: TreeData): TreeApi {
  const hit = cache.get(data);
  if (hit) return hit;
  const api = build(data);
  cache.set(data, api);
  return api;
}

function index<T extends { id: string }>(xs: T[]): Record<string, T> {
  const m: Record<string, T> = {};
  for (const x of xs) m[x.id] = x;
  return m;
}

/** Picks the person the family view starts from: the saved choice, else the earliest ancestor with the most descendants. */
export function defaultRoot(data: TreeData, parentsOf: Record<string, string[]>, childrenOf: Record<string, string[]>): string {
  const saved = data.settings.root_person;
  if (saved && data.people.some((p) => p.id === saved)) return saved;
  if (!data.people.length) return '';
  const count = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    let n = 1;
    for (const c of childrenOf[id] || []) n += count(c, seen);
    return n;
  };
  let best = data.people[0].id;
  let bestN = -1;
  for (const p of data.people) {
    if ((parentsOf[p.id] || []).length) continue;
    const n = count(p.id);
    if (n > bestN || (n === bestN && p.sex === 'M')) {
      best = p.id;
      bestN = n;
    }
  }
  return best;
}

function build(data: TreeData): TreeApi {
  const person = index(data.people);
  const fact = index(data.facts);
  const source = index(data.sources);
  const cite = index(data.cites);
  const media = index(data.media);
  const place = index(data.places);

  const parentsOf: Record<string, string[]> = {};
  const childrenOf: Record<string, string[]> = {};
  const spousesOf: Record<string, string[]> = {};
  const sibOf: Record<string, string[]> = {};
  const push = (m: Record<string, string[]>, k: string, v: string) => {
    const arr = (m[k] = m[k] || []);
    if (!arr.includes(v)) arr.push(v);
  };
  for (const r of data.rels) {
    if (!person[r.a] || !person[r.b]) continue;
    if (r.type === 'parent') {
      push(parentsOf, r.b, r.a);
      push(childrenOf, r.a, r.b);
    } else if (r.type === 'spouse') {
      push(spousesOf, r.a, r.b);
      push(spousesOf, r.b, r.a);
    } else {
      push(sibOf, r.a, r.b);
      push(sibOf, r.b, r.a);
    }
  }

  const factsBy: Record<string, Fact[]> = {};
  for (const f of data.facts) (factsBy[f.personId] = factsBy[f.personId] || []).push(f);
  for (const k in factsBy) factsBy[k].sort((a, b) => (a.sortYear ?? factYear(a) ?? 9999) - (b.sortYear ?? factYear(b) ?? 9999));

  const birthYearCache: Record<string, number> = {};
  const ff = (id: string, type: string) => (factsBy[id] || []).find((f) => f.type === type);
  const birthYear = (id: string) => {
    if (id in birthYearCache) return birthYearCache[id];
    const b = ff(id, 'Birth') || ff(id, 'Baptism');
    return (birthYearCache[id] = (b && (b.sortYear ?? factYear(b))) || 9999);
  };
  const byBirth = (a: string, b: string) => birthYear(a) - birthYear(b);
  for (const k in childrenOf) childrenOf[k].sort(byBirth);

  const confCache = new Map<string, Confidence>();
  const conf = (f: Fact): Confidence => {
    const c = confCache.get(f.id);
    if (c) return c;
    const v = confOf(
      f.q,
      f.citeIds.map((id) => cite[id]).filter(Boolean),
      f.conf,
    );
    confCache.set(f.id, v);
    return v;
  };

  const nm = (id: string) => {
    const p = person[id];
    return p ? `${p.given} ${p.surname}`.trim() || 'Unnamed' : 'Unknown';
  };
  const first = (id: string) => (person[id]?.given || '').split(' ')[0] || person[id]?.surname || 'Unknown';
  const short = (id: string) => {
    const p = person[id];
    return p ? `${first(id)} ${p.surname}`.trim() : 'Unknown';
  };

  const rootId = defaultRoot(data, parentsOf, childrenOf);

  // Branches: each child of the root couple starts a line; the root couple are the founders;
  // anyone else is grouped under their own earliest ancestor's surname.
  let branchMap: Record<string, BranchInfo> | null = null;
  const branchList: BranchInfo[] = [];
  const computeBranches = () => {
    const B: Record<string, BranchInfo> = {};
    const root = rootId;
    if (!root) return B;
    const founders: BranchInfo = { key: 'root', label: 'Founders', colour: FOUNDERS_COLOUR };
    branchList.push(founders);
    B[root] = founders;
    for (const s of spousesOf[root] || []) B[s] = founders;
    const lineMembers = (start: string) => {
      const out: string[] = [];
      const walk = (id: string) => {
        if (B[id] || out.includes(id)) return;
        out.push(id);
        for (const s of spousesOf[id] || []) if (!B[s] && !out.includes(s)) out.push(s);
        for (const c of childrenOf[id] || []) walk(c);
      };
      walk(start);
      return out;
    };
    const topPlace = (ids: string[]) => {
      const counts: Record<string, number> = {};
      for (const id of ids)
        for (const f of factsBy[id] || [])
          if (f.placeId && ['Birth', 'Residence', 'Death', 'Marriage'].includes(f.type)) counts[f.placeId] = (counts[f.placeId] || 0) + 1;
      const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      return best && place[best] ? place[best].name.split(',')[0] : '';
    };
    const kids = new Set<string>(childrenOf[root] || []);
    for (const s of spousesOf[root] || []) for (const c of childrenOf[s] || []) kids.add(c);
    let ci = 0;
    for (const k of [...kids].sort(byBirth)) {
      if (B[k]) continue;
      const members = lineMembers(k);
      const where = members.length > 1 ? topPlace(members) : '';
      const info: BranchInfo = {
        key: k,
        label: members.length > 2 ? `${first(k)}’s line${where ? ' · ' + where : ''}` : first(k),
        colour: BRANCH_COLOURS[ci++ % BRANCH_COLOURS.length],
      };
      branchList.push(info);
      for (const id of members) B[id] = info;
    }
    // Other families: grouped by their earliest ancestor.
    let oi = 0;
    const topOf = (id: string, seen = new Set<string>()): string => {
      if (seen.has(id)) return id;
      seen.add(id);
      const ps = parentsOf[id] || [];
      const father = ps.find((x) => person[x]?.sex === 'M') || ps[0];
      return father ? topOf(father, seen) : id;
    };
    for (const p of data.people) {
      if (B[p.id]) continue;
      const top = topOf(p.id);
      let info = B[top];
      if (!info) {
        info = { key: 'fam-' + top, label: `${person[top]?.surname || 'Other'} family`, colour: OTHER_COLOURS[oi++ % OTHER_COLOURS.length] };
        branchList.push(info);
        B[top] = info;
      }
      const walk = (id: string) => {
        if (B[id] && id !== top) return;
        B[id] = info!;
        for (const s of spousesOf[id] || []) if (!B[s]) B[s] = info!;
        for (const c of childrenOf[id] || []) if (!B[c]) walk(c);
      };
      walk(top);
      if (!B[p.id]) B[p.id] = info;
    }
    return B;
  };

  const api: TreeApi = {
    data,
    person,
    fact,
    source,
    cite,
    media,
    place,
    rootId,
    nm,
    short,
    first,
    ini: (id) => {
      const p = person[id];
      if (!p) return '?';
      return ((p.given[0] || '') + (p.surname.replace(/[^\p{L}]/gu, '')[0] || '')).toUpperCase() || '?';
    },
    sortName: (id) => {
      const p = person[id];
      return p ? `${p.surname}, ${p.given}` : 'Unknown';
    },
    factsOf: (id) => factsBy[id] || [],
    ff,
    birthYear,
    years: (id) => {
      const p = person[id];
      if (!p) return '';
      const b = ff(id, 'Birth') || ff(id, 'Baptism');
      const d = ff(id, 'Death') || ff(id, 'Burial');
      const by = b ? (b.q === 'about' ? 'abt ' : '') + (factYear(b) || '?') : '?';
      if (p.living) return b ? 'b. ' + by : 'Living';
      return by + ' – ' + (d ? (d.q === 'about' ? 'abt ' : '') + (factYear(d) || '?') : '?');
    },
    parents: (id) => parentsOf[id] || [],
    children: (id) => childrenOf[id] || [],
    spouses: (id) => spousesOf[id] || [],
    siblings: (id) => {
      const s = new Set<string>();
      for (const p of parentsOf[id] || []) for (const c of childrenOf[p] || []) if (c !== id) s.add(c);
      for (const x of sibOf[id] || []) s.add(x);
      return [...s].sort(byBirth);
    },
    spouseRelId: (a, b) =>
      data.rels.find((r) => r.type === 'spouse' && ((r.a === a && r.b === b) || (r.a === b && r.b === a)))?.id,
    conf,
    unvCount: (id) => (factsBy[id] || []).filter((f) => conf(f) === 'Unverified').length,
    hintCount: (id) => data.hints.filter((h) => h.personId === id && h.status === 'pending').length,
    placeName: (id) => (id && place[id] ? place[id].name : ''),
    mediaOf: (id) => data.media.filter((m) => m.faces.some((f) => f.personId === id) || m.people.includes(id)),
    profileMedia: (id) => data.media.filter((m) => (m.faces.some((f) => f.personId === id) || m.people.includes(id)) && (m.tags?.[id]?.status || 'shown') === 'shown'),
    tagOf: (m, id) => m.tags?.[id] || { status: 'shown', by: m.addedBy },
    branch: (id) => {
      if (!branchMap) branchMap = computeBranches();
      return branchMap[id] || { key: 'other', label: 'Unlinked', colour: '#6B7A8C' };
    },
    branches: () => {
      if (!branchMap) branchMap = computeBranches();
      return branchList;
    },
    generations: () => {
      if (!rootId) return 0;
      let m = 0;
      const seen = new Set<string>();
      const dep = (id: string, k: number) => {
        if (seen.has(id)) return;
        seen.add(id);
        m = Math.max(m, k);
        for (const c of childrenOf[id] || []) dep(c, k + 1);
      };
      dep(rootId, 1);
      return m;
    },
    peopleSorted: () => data.people.slice().sort((a, b) => (a.surname + ' ' + a.given).localeCompare(b.surname + ' ' + b.given)),
    lineOf: (root) => {
      const out = new Set<string>();
      const add = (id: string) => {
        if (out.has(id)) return;
        out.add(id);
        for (const s of spousesOf[id] || []) out.add(s);
        for (const c of childrenOf[id] || []) add(c);
      };
      add(root);
      return [...out];
    },
    anc: (root, gens) => {
      const a: Record<number, string> = { 1: root };
      for (let n = 1; n < 2 ** (gens - 1); n++) {
        const id = a[n];
        if (!id) continue;
        const ps = parentsOf[id] || [];
        const f = ps.find((x) => person[x]?.sex === 'M') || (ps.length === 2 && person[ps[1]]?.sex === 'F' ? ps[0] : undefined);
        const mo = ps.find((x) => x !== f);
        if (f) a[2 * n] = f;
        if (mo) a[2 * n + 1] = mo;
      }
      return a;
    },
  };
  return api;
}

export { dateLabel };
