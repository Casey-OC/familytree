// Finding people who are entered twice, and merging two records into one profile.
// The same rules will apply when duplicates come from other people's trees online.

import { treeApi } from './family';
import { yearOf } from './dates';
import type { Person, TreeData } from './types';

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const firstName = (p: Person) => norm(p.given).split(' ')[0] || '';

/** Common short forms, so "Bill Pascoe" can match "William Pascoe". */
const NICK: Record<string, string> = {
  bill: 'william',
  will: 'william',
  billy: 'william',
  liam: 'william',
  bob: 'robert',
  rob: 'robert',
  bobby: 'robert',
  jack: 'john',
  johnny: 'john',
  jock: 'john',
  peg: 'margaret',
  peggy: 'margaret',
  maggie: 'margaret',
  meg: 'margaret',
  marge: 'margaret',
  betty: 'elizabeth',
  beth: 'elizabeth',
  liz: 'elizabeth',
  lizzie: 'elizabeth',
  eliza: 'elizabeth',
  bessie: 'elizabeth',
  kate: 'katherine',
  kath: 'katherine',
  katie: 'katherine',
  kathleen: 'katherine',
  catherine: 'katherine',
  tom: 'thomas',
  tommy: 'thomas',
  jim: 'james',
  jimmy: 'james',
  jamie: 'james',
  dick: 'richard',
  rick: 'richard',
  harry: 'henry',
  hal: 'henry',
  ted: 'edward',
  ned: 'edward',
  ed: 'edward',
  annie: 'ann',
  anne: 'ann',
  anna: 'ann',
  nan: 'ann',
  molly: 'mary',
  polly: 'mary',
  mae: 'mary',
  sue: 'susan',
  susie: 'susan',
  fred: 'frederick',
  alf: 'alfred',
  bert: 'albert',
  dot: 'dorothy',
  dolly: 'dorothy',
  len: 'leonard',
  ron: 'ronald',
  don: 'donald',
  ken: 'kenneth',
  pat: 'patrick',
  paddy: 'patrick',
  joe: 'joseph',
  sam: 'samuel',
};
const canon = (n: string) => NICK[n] || n;

export function sameFirstName(a: Person, b: Person) {
  const x = firstName(a);
  const y = firstName(b);
  if (!x || !y) return false;
  if (x === y || canon(x) === canon(y)) return true;
  // an initial: "J" matches "John"
  return (x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y));
}

export interface DuplicatePair {
  a: string;
  b: string;
  score: number; // 0–100
  reasons: string[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Pairs you said are different people (kept in the tree's settings). */
export function notDuplicates(d: TreeData): Set<string> {
  try {
    return new Set(JSON.parse(d.settings.not_duplicates || '[]'));
  } catch {
    return new Set();
  }
}
export const notDuplicateKey = pairKey;

/** People in this tree who look like the same person entered twice, most likely first. */
export function findDuplicatePeople(d: TreeData, minScore = 60): DuplicatePair[] {
  const T = treeApi(d);
  const skip = notDuplicates(d);
  const bySurname: Record<string, Person[]> = {};
  for (const p of d.people) (bySurname[norm(p.surname)] = bySurname[norm(p.surname)] || []).push(p);
  const out: DuplicatePair[] = [];
  for (const group of Object.values(bySurname)) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pair = scorePair(T, d, group[i], group[j]);
        if (pair && pair.score >= minScore && !skip.has(pairKey(pair.a, pair.b))) out.push(pair);
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

function scorePair(T: ReturnType<typeof treeApi>, d: TreeData, a: Person, b: Person): DuplicatePair | null {
  if (!sameFirstName(a, b)) return null;
  if (a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) return null;
  if (a.accountEmail && b.accountEmail && a.accountEmail !== b.accountEmail) return null;
  // Already linked as family: a parent and child, or partners, are never the same person.
  if (d.rels.some((r) => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id))) return null;
  const reasons: string[] = [];
  let score = 40;
  if (norm(a.given) === norm(b.given)) {
    score += 10;
    reasons.push('Same given names');
  } else reasons.push('Similar first name');
  const ya = T.birthYear(a.id);
  const yb = T.birthYear(b.id);
  if (ya !== 9999 && yb !== 9999) {
    const gap = Math.abs(ya - yb);
    if (gap > 2) return null;
    score += gap === 0 ? 25 : 15;
    reasons.push(gap === 0 ? `Both born ${ya}` : `Born ${ya} and ${yb}`);
  } else if (ya === 9999 && yb === 9999) {
    reasons.push('No birth year for either');
  } else score += 5;
  const bpA = T.ff(a.id, 'Birth')?.placeId;
  const bpB = T.ff(b.id, 'Birth')?.placeId;
  if (bpA && bpB && (bpA === bpB || norm(T.placeName(bpA)).split(' ')[0] === norm(T.placeName(bpB)).split(' ')[0])) {
    score += 10;
    reasons.push(`Both born in ${T.placeName(bpA).split(',')[0]}`);
  }
  const dyA = yearOf(T.ff(a.id, 'Death')?.date || '');
  const dyB = yearOf(T.ff(b.id, 'Death')?.date || '');
  if (dyA && dyB) {
    if (Math.abs(dyA - dyB) > 2) return null;
    score += 10;
    reasons.push(`Both died ${dyA === dyB ? dyA : `${dyA}–${dyB}`}`);
  }
  const names = (ids: string[]) => new Set(ids.map((id) => firstName(T.person[id]) + ' ' + norm(T.person[id].surname)));
  const overlap = (x: Set<string>, y: Set<string>) => [...x].some((n) => y.has(n));
  if (overlap(names(T.parents(a.id)), names(T.parents(b.id)))) {
    score += 15;
    reasons.push('Same parent names');
  }
  if (overlap(names(T.spouses(a.id)), names(T.spouses(b.id)))) {
    score += 10;
    reasons.push('Same partner name');
  }
  return { a: a.id, b: b.id, score: Math.min(100, score), reasons };
}

/** People already in the tree who match a name (and birth year) being typed into "Add a person". */
export function matchesForNew(d: TreeData, given: string, surname: string, birthYear?: number): string[] {
  if (!given.trim() || !surname.trim()) return [];
  const T = treeApi(d);
  const probe = { given, surname, sex: 'U' } as Person;
  return d.people
    .filter((p) => norm(p.surname) === norm(surname) && sameFirstName(p, probe))
    .filter((p) => {
      const y = T.birthYear(p.id);
      return !birthYear || y === 9999 || Math.abs(y - birthYear) <= 2;
    })
    .map((p) => p.id);
}

// ---------- merging ----------

export type FieldChoice = Partial<Record<'given' | 'surname' | 'sex' | 'living', 'keep' | 'other'>>;

export interface MergeResult {
  changedPeople: string[];
  changedFacts: string[];
  removedFacts: string[];
  changedRels: string[];
  removedRels: string[];
  changedMedia: string[];
  changedHints: string[];
  changedTasks: string[];
  changedSettings: string[];
  movedFacts: number;
  movedPhotos: number;
}

/** Why two people can't be merged, or '' if they can. */
export function mergeProblem(d: TreeData, keepId: string, otherId: string): string {
  const k = d.people.find((p) => p.id === keepId);
  const o = d.people.find((p) => p.id === otherId);
  if (!k || !o) return 'One of these people is no longer in the tree.';
  if (keepId === otherId) return 'That’s the same person.';
  if (k.accountEmail && o.accountEmail && k.accountEmail !== o.accountEmail) return 'Both people have their own accounts, so they are two different people and can’t be merged.';
  if (d.rels.some((r) => r.type === 'parent' && ((r.a === keepId && r.b === otherId) || (r.a === otherId && r.b === keepId))))
    return 'One is recorded as the other’s parent, so they can’t be the same person.';
  return '';
}

/**
 * Merges `otherId` into `keepId` in place (works on an immer draft). Everything attached to the
 * other record moves across; matching facts are combined so their sources are kept together.
 * The other record is removed from d.people; the caller deletes its row.
 */
export function mergeInto(d: TreeData, keepId: string, otherId: string, choice: FieldChoice = {}): MergeResult {
  const r: MergeResult = {
    changedPeople: [keepId],
    changedFacts: [],
    removedFacts: [],
    changedRels: [],
    removedRels: [],
    changedMedia: [],
    changedHints: [],
    changedTasks: [],
    changedSettings: [],
    movedFacts: 0,
    movedPhotos: 0,
  };
  const k = d.people.find((p) => p.id === keepId)!;
  const o = d.people.find((p) => p.id === otherId)!;

  // Person details: chosen side, else the kept record unless it's blank.
  for (const f of ['given', 'surname', 'sex', 'living'] as const) {
    const pick = choice[f] || (f === 'sex' ? (k.sex === 'U' ? 'other' : 'keep') : f === 'living' ? 'keep' : k[f] ? 'keep' : 'other');
    if (pick === 'other') (k as unknown as Record<string, unknown>)[f] = o[f];
  }
  if (!k.photoMediaId && o.photoMediaId) {
    k.photoMediaId = o.photoMediaId;
    k.photoCrop = o.photoCrop;
    k.avatar = '';
  }
  if (!k.coverMediaId && o.coverMediaId) k.coverMediaId = o.coverMediaId;
  if (!k.avatar && !k.photoMediaId && o.avatar) k.avatar = o.avatar;
  if (!k.accountEmail && o.accountEmail) k.accountEmail = o.accountEmail;
  if (o.notes.trim() && !k.notes.includes(o.notes.trim())) k.notes = [k.notes.trim(), o.notes.trim()].filter(Boolean).join('\n\n');
  if (k.privacy === 'Shared' && o.privacy === 'Private' && k.living) k.privacy = 'Private';

  // Facts: move across; combine a fact that's already there (same type and year, or both undated one-off facts).
  const ONE_OFF = new Set(['Birth', 'Death', 'Burial', 'Christening', 'Baptism', 'Cremation']);
  for (const f of d.facts.filter((x) => x.personId === otherId)) {
    const y = yearOf(f.date);
    const twin = d.facts.find(
      (e) => e.personId === keepId && e.type === f.type && (ONE_OFF.has(f.type) || (y ? yearOf(e.date) === y : !yearOf(e.date) && norm(e.desc) === norm(f.desc))),
    );
    if (twin) {
      // keep the more precise date and any missing details, and every source from both
      if ((!twin.date && f.date) || (f.date.length > twin.date.length && yearOf(f.date) === yearOf(twin.date))) {
        twin.date = f.date;
        twin.q = f.q;
        twin.date2 = f.date2;
        twin.sortYear = f.sortYear;
      } else if (f.date && twin.date && yearOf(f.date) !== yearOf(twin.date)) {
        // the two records disagree: keep the other date as a note so the evidence isn't lost
        const line = `When merged, another record gave ${f.type.toLowerCase()} as ${f.date}${f.placeId ? ' in ' + (d.places.find((pl) => pl.id === f.placeId)?.name || '') : ''}.`;
        if (!k.notes.includes(line)) k.notes = [k.notes.trim(), line].filter(Boolean).join('\n\n');
      }
      if (!twin.placeId && f.placeId) twin.placeId = f.placeId;
      if (!twin.desc && f.desc) twin.desc = f.desc;
      twin.citeIds = [...new Set([...twin.citeIds, ...f.citeIds])];
      if (twin.conf === 'auto' && f.conf !== 'auto') twin.conf = f.conf;
      d.tasks.forEach((t) => {
        if (t.factId === f.id) {
          t.factId = twin.id;
          if (!r.changedTasks.includes(t.id)) r.changedTasks.push(t.id);
        }
      });
      d.facts = d.facts.filter((x) => x.id !== f.id);
      r.removedFacts.push(f.id);
      if (!r.changedFacts.includes(twin.id)) r.changedFacts.push(twin.id);
    } else {
      f.personId = keepId;
      r.changedFacts.push(f.id);
      r.movedFacts++;
    }
  }

  // Relationships: point at the kept person; drop ones that become duplicates or self-links.
  const relKey = (x: { type: string; a: string; b: string }) => (x.type === 'parent' ? `p:${x.a}>${x.b}` : `${x.type}:${[x.a, x.b].sort().join('|')}`);
  const seen = new Map<string, string>();
  for (const rel of d.rels) if (rel.a !== otherId && rel.b !== otherId) seen.set(relKey(rel), rel.id);
  for (const rel of [...d.rels]) {
    if (rel.a !== otherId && rel.b !== otherId) continue;
    if (rel.a === otherId) rel.a = keepId;
    if (rel.b === otherId) rel.b = keepId;
    const key = relKey(rel);
    if (rel.a === rel.b || seen.has(key)) {
      const kept = seen.get(key);
      const keptRel = kept && d.rels.find((x) => x.id === kept);
      if (keptRel && !keptRel.start && rel.start) {
        keptRel.start = rel.start;
        r.changedRels.push(keptRel.id);
      }
      d.rels = d.rels.filter((x) => x.id !== rel.id);
      r.removedRels.push(rel.id);
    } else {
      seen.set(key, rel.id);
      r.changedRels.push(rel.id);
    }
  }

  // Photos and files: move tags and links; one face tag per person per photo.
  for (const m of d.media) {
    let touched = false;
    if (m.faces.some((f) => f.personId === otherId)) {
      const hasKeep = m.faces.some((f) => f.personId === keepId);
      m.faces = hasKeep ? m.faces.filter((f) => f.personId !== otherId) : m.faces.map((f) => (f.personId === otherId ? { ...f, personId: keepId } : f));
      touched = true;
    }
    if (m.people.includes(otherId)) {
      m.people = m.people.filter((p) => p !== otherId);
      if (!m.people.includes(keepId) && !m.faces.some((f) => f.personId === keepId)) m.people.push(keepId);
      touched = true;
    }
    if (m.faces.some((f) => f.personId === keepId)) m.people = m.people.filter((p) => p !== keepId);
    if (m.tags?.[otherId]) {
      if (!m.tags[keepId]) m.tags[keepId] = m.tags[otherId];
      delete m.tags[otherId];
      touched = true;
    }
    if (touched) {
      r.changedMedia.push(m.id);
      r.movedPhotos++;
    }
  }

  for (const h of d.hints)
    if (h.personId === otherId) {
      h.personId = keepId;
      r.changedHints.push(h.id);
    }
  for (const t of d.tasks)
    if (t.personId === otherId) {
      t.personId = keepId;
      if (!r.changedTasks.includes(t.id)) r.changedTasks.push(t.id);
    }

  for (const key of ['home_person', 'self_person']) {
    if (d.settings[key] === otherId) {
      d.settings[key] = keepId;
      r.changedSettings.push(key);
    }
  }
  // Remember the merged record's identity, so links to it (later, online) find the one profile.
  let merged: Record<string, string> = {};
  try {
    merged = JSON.parse(d.settings.merged_profiles || '{}');
  } catch {
    merged = {};
  }
  merged[o.profileId || o.id] = k.profileId || k.id;
  for (const [from, to] of Object.entries(merged)) if (to === (o.profileId || o.id)) merged[from] = k.profileId || k.id;
  d.settings.merged_profiles = JSON.stringify(merged);
  r.changedSettings.push('merged_profiles');

  d.people = d.people.filter((p) => p.id !== otherId);
  k.updatedAt = new Date().toISOString();
  return r;
}
