// Family titles: what someone is to you — Mum, Aunty, Niece, 2nd cousin once removed, Sister-in-law…
// Worked out from parent and partner links by finding the closest shared ancestor.

import type { TreeApi } from './family';
import type { Sex } from './types';

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (n: number) => ORD[n] || `${n}th`;
const removedLabel = (n: number) => (n === 1 ? 'once removed' : n === 2 ? 'twice removed' : `${n} times removed`);

/** "great-", "great-great-", "3× great-" … */
function greats(n: number): string {
  if (n <= 0) return '';
  if (n <= 2) return 'great-'.repeat(n);
  return `${n}× great-`;
}

const bySex = (sex: Sex | undefined, m: string, f: string, other: string) => (sex === 'M' ? m : sex === 'F' ? f : other);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ancestors of a person with how many generations up they are (0 = the person). */
function ancestors(T: TreeApi, id: string): Map<string, number> {
  const out = new Map<string, number>([[id, 0]]);
  let level = [id];
  for (let g = 1; level.length && g < 40; g++) {
    const next: string[] = [];
    for (const p of level)
      for (const a of T.parents(p))
        if (!out.has(a)) {
          out.set(a, g);
          next.push(a);
        }
    level = next;
  }
  return out;
}

export interface Kin {
  title: string; // "Aunty", "2nd cousin once removed"
  kind: 'self' | 'blood' | 'spouse' | 'inlaw' | 'step';
  up: number; // generations from you up to the shared ancestor
  down: number; // generations from the shared ancestor down to them
}

/** Blood relationship from `a` to `b` by generations: a goes up `up`, then down `down` to b. */
function bloodTitle(up: number, down: number, sex: Sex | undefined, half: boolean): string {
  if (up === 0 && down === 0) return 'You';
  if (up === 0) {
    // b is a's descendant
    if (down === 1) return bySex(sex, 'Son', 'Daughter', 'Child');
    return cap(greats(down - 2) + bySex(sex, 'grandson', 'granddaughter', 'grandchild'));
  }
  if (down === 0) {
    if (up === 1) return bySex(sex, 'Father', 'Mother', 'Parent');
    return cap(greats(up - 2) + bySex(sex, 'grandfather', 'grandmother', 'grandparent'));
  }
  if (up === 1 && down === 1) return (half ? 'Half-' : '') + (half ? bySex(sex, 'brother', 'sister', 'sibling') : bySex(sex, 'Brother', 'Sister', 'Sibling'));
  if (up === 1) return cap(greats(down - 2) + bySex(sex, 'nephew', 'niece', 'niece or nephew'));
  if (down === 1) return cap(greats(up - 2) + bySex(sex, 'uncle', 'aunty', 'aunty or uncle'));
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const base = degree === 1 ? 'Cousin' : `${ordinal(degree)} cousin`;
  return removed ? `${base} ${removedLabel(removed)}` : base;
}

/** How b is related to a by blood, or null. */
function blood(T: TreeApi, a: string, b: string, cache: Map<string, Map<string, number>>): Kin | null {
  const anc = (x: string) => {
    let m = cache.get(x);
    if (!m) cache.set(x, (m = ancestors(T, x)));
    return m;
  };
  const A = anc(a);
  const B = anc(b);
  let best: { up: number; down: number } | null = null;
  for (const [id, up] of A) {
    const down = B.get(id);
    if (down === undefined) continue;
    if (!best || up + down < best.up + best.down) best = { up, down };
  }
  if (!best) return null;
  // Siblings who share only one parent are half-siblings.
  let half = false;
  if (best.up === 1 && best.down === 1) {
    const pa = T.parents(a);
    const pb = T.parents(b);
    const shared = pa.filter((p) => pb.includes(p)).length;
    half = shared === 1 && pa.length === 2 && pb.length === 2;
  }
  return { title: bloodTitle(best.up, best.down, T.person[b]?.sex, half), kind: best.up + best.down === 0 ? 'self' : 'blood', ...best };
}

/** What `b` is to `a` — blood, partner, in-law or step — or null if they aren't connected. */
export function relationship(T: TreeApi, a: string, b: string, cache = new Map<string, Map<string, number>>()): Kin | null {
  if (!T.person[a] || !T.person[b]) return null;
  if (a === b) return { title: 'You', kind: 'self', up: 0, down: 0 };
  const sexB = T.person[b].sex;
  if (T.spouses(a).includes(b)) return { title: bySex(sexB, 'Husband', 'Wife', 'Partner'), kind: 'spouse', up: 0, down: 0 };
  const direct = blood(T, a, b, cache);
  if (direct) return direct;

  // b is married to one of a's blood relatives
  for (const s of T.spouses(b)) {
    const r = s === a ? null : blood(T, a, s, cache);
    if (!r) continue;
    if (r.up === 1 && r.down === 0) return { title: bySex(sexB, 'Stepfather', 'Stepmother', 'Step-parent'), kind: 'step', up: 1, down: 0 };
    if (r.up === 0 && r.down === 1) return { title: bySex(sexB, 'Son-in-law', 'Daughter-in-law', 'Child-in-law'), kind: 'inlaw', up: 0, down: 1 };
    if (r.up === 1 && r.down === 1) return { title: bySex(sexB, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law'), kind: 'inlaw', up: 1, down: 1 };
    if (r.up >= 2 && r.down === 0)
      return { title: cap(greats(r.up - 2) + bySex(sexB, 'step-grandfather', 'step-grandmother', 'step-grandparent')), kind: 'step', up: r.up, down: 0 };
    if (r.down === 1 && r.up >= 2) return { title: cap(greats(r.up - 2) + bySex(sexB, 'uncle', 'aunty', 'aunty or uncle')) + ' (by marriage)', kind: 'inlaw', up: r.up, down: 1 };
    return { title: `${bySex(sexB, 'Husband', 'Wife', 'Partner')} of your ${r.title.toLowerCase()}`, kind: 'inlaw', up: r.up, down: r.down };
  }
  // b is a blood relative of a's partner
  for (const s of T.spouses(a)) {
    const r = blood(T, s, b, cache);
    if (!r) continue;
    if (r.up === 1 && r.down === 0) return { title: bySex(sexB, 'Father-in-law', 'Mother-in-law', 'Parent-in-law'), kind: 'inlaw', up: 1, down: 0 };
    if (r.up === 1 && r.down === 1) return { title: bySex(sexB, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law'), kind: 'inlaw', up: 1, down: 1 };
    if (r.up === 0 && r.down === 1) return { title: bySex(sexB, 'Stepson', 'Stepdaughter', 'Stepchild'), kind: 'step', up: 0, down: 1 };
    if (r.up === 0 && r.down >= 2)
      return { title: cap(greats(r.down - 2) + bySex(sexB, 'step-grandson', 'step-granddaughter', 'step-grandchild')), kind: 'step', up: 0, down: r.down };
    const partner = bySex(T.person[s]?.sex, 'husband', 'wife', 'partner');
    return { title: `Your ${partner}’s ${r.title.toLowerCase()}`, kind: 'inlaw', up: r.up, down: r.down };
  }
  return null;
}

/** Titles for everyone in the tree relative to one person (worked out once, then cached per tree snapshot). */
const memo = new WeakMap<TreeApi, Map<string, Map<string, Kin | null>>>();
export function titlesFrom(T: TreeApi, me: string): Map<string, Kin | null> {
  let byMe = memo.get(T);
  if (!byMe) memo.set(T, (byMe = new Map()));
  let m = byMe.get(me);
  if (!m) {
    const cache = new Map<string, Map<string, number>>();
    m = new Map();
    for (const p of T.data.people) m.set(p.id, relationship(T, me, p.id, cache));
    // Second pass: describe people one step from someone with a title ("Father of your daughter-in-law").
    const named = (id: string) => {
      const k = m!.get(id);
      return k && k.kind !== 'self' && !/ of |’s /.test(k.title) ? k : null;
    };
    for (const p of T.data.people) {
      if (m.get(p.id)) continue;
      const sex = p.sex;
      const via: [string[], string][] = [
        [T.children(p.id), bySex(sex, 'Father', 'Mother', 'Parent')],
        [T.parents(p.id), bySex(sex, 'Son', 'Daughter', 'Child')],
        [T.siblings(p.id), bySex(sex, 'Brother', 'Sister', 'Sibling')],
      ];
      for (const [ids, word] of via) {
        const hit = ids.map(named).find(Boolean);
        if (hit) {
          m.set(p.id, { title: `${word} of your ${hit.title.toLowerCase()}`, kind: 'inlaw', up: hit.up, down: hit.down });
          break;
        }
      }
    }
    byMe.set(me, m);
  }
  return m;
}

/** Who the titles are relative to: you (your own profile), or the tree's home person. */
export function titleAnchor(T: TreeApi): { id: string; isYou: boolean } {
  const self = T.data.settings.self_person;
  if (self && T.person[self]) return { id: self, isYou: true };
  return { id: T.rootId, isYou: false };
}

/** "Your aunty" / "John's aunty" — for profile headers and tooltips. */
export function titlePhrase(T: TreeApi, pid: string): string {
  const { id, isYou } = titleAnchor(T);
  if (!id || pid === id) return isYou ? 'You' : '';
  const k = titlesFrom(T, id).get(pid);
  if (!k) return '';
  const whose = isYou ? 'your' : `${T.first(id)}’s`;
  // Titles that already say whose they are ("Husband of your cousin", "Your wife’s sister")
  if (/^Your |\bof your\b/.test(k.title)) return cap(k.title.replace(/\b[Yy]our\b/g, whose));
  return cap(`${whose} ${k.title.charAt(0).toLowerCase()}${k.title.slice(1)}`);
}
