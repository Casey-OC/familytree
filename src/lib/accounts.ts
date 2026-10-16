// Accounts on this computer, and the starting tree made from "About you" at sign-up.

import { fullDate, normaliseDate, todayLabel, yearOf } from './dates';
import { emptyTree, type Fact, type Person, type Relationship, type Sex, type TreeData } from './types';

export interface Account {
  id: string;
  email: string; // stored lower-case
  name: string; // first name, for greetings
  keyByPassword: Wrapped; // the account's data key, locked with the password
  keyByRecovery: Wrapped; // the same key, locked with the recovery code
  personId: string; // "you" in your own tree ('' until About you is done)
  treeId: string; // your own tree
  lastTree: string;
  keepSignedIn: boolean;
  wallConnected?: boolean; // signed in to the online Family Wall with the same email and password
  createdAt: string;
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

export interface ParentInput {
  given: string;
  surname: string;
  living: boolean;
}

export interface AboutYou {
  given: string;
  surname: string; // at birth
  sex: Sex;
  birthDate: string; // a full date, e.g. "17 Oct 1946"
  birthPlace: string;
  livesIn?: string; // where you live now
  homeAtBirth?: string; // where your family lived when you were born
  father?: ParentInput;
  mother?: ParentInput;
}

export function aboutYouProblem(a: AboutYou): string {
  if (!a.given.trim()) return 'Add your first name.';
  if (!a.surname.trim()) return 'Add your surname at birth.';
  if (a.sex !== 'M' && a.sex !== 'F') return 'Choose male or female.';
  if (!fullDate(normaliseDate(a.birthDate))) return 'Choose your full date of birth.';
  const y = yearOf(a.birthDate)!;
  if (y > new Date().getFullYear() || y < 1900) return 'Check the year you were born.';
  return '';
}

/**
 * The tree created at sign-up: you, with your birth recorded and verified (you're the
 * source for your own details), plus your parents if you named them.
 */
export function makeSelfTree(a: AboutYou, email: string, newId: () => string): { data: TreeData; selfId: string } {
  const now = new Date().toISOString();
  const d = emptyTree();
  const person = (given: string, surname: string, sex: Sex, living: boolean): Person => {
    const id = newId();
    return {
      id,
      given: given.trim(),
      surname: surname.trim(),
      sex,
      living,
      photoMediaId: null,
      photoCrop: null,
      coverMediaId: null,
      profileId: id,
      accountEmail: '',
      avatar: '',
      privacy: living ? 'Private' : 'Shared',
      notes: '',
      updatedAt: now,
    };
  };
  const self = person(a.given, a.surname, a.sex, true);
  self.accountEmail = email;
  d.people.push(self);

  // You are the evidence for your own details.
  const sourceId = newId();
  d.sources.push({ id: sourceId, title: `About me — ${self.given} ${self.surname}`, type: 'Personal knowledge', repo: `Account holder (${email})`, url: '' });
  const citeId = newId();
  d.cites.push({ id: citeId, sourceId, page: 'Self-reported at sign-up', accessed: todayLabel(), quality: 'Primary', extract: '' });
  const date = normaliseDate(a.birthDate);
  let placeId = '';
  if (a.birthPlace.trim()) {
    placeId = newId();
    d.places.push({ id: placeId, name: a.birthPlace.trim(), hist: a.birthPlace.trim(), lat: null, lon: null });
  }
  const placeFor = (name: string) => {
    const n = name.trim();
    if (!n) return '';
    const hit = d.places.find((p) => p.name.toLowerCase() === n.toLowerCase());
    if (hit) return hit.id;
    const id = newId();
    d.places.push({ id, name: n, hist: n, lat: null, lon: null });
    return id;
  };
  const homePlaceId = placeFor(a.homeAtBirth || '');
  const birth: Fact = { id: newId(), personId: self.id, type: 'Birth', date, q: 'exact', date2: '', sortYear: yearOf(date), placeId, homePlaceId, desc: '', conf: 'Proven', citeIds: [citeId] };
  d.facts.push(birth);

  if (a.livesIn?.trim()) {
    const here = a.livesIn.trim();
    let pid = d.places.find((p) => p.name.toLowerCase() === here.toLowerCase())?.id;
    if (!pid) {
      pid = newId();
      d.places.push({ id: pid, name: here, hist: here, lat: null, lon: null });
    }
    const y = String(new Date().getFullYear());
    d.facts.push({ id: newId(), personId: self.id, type: 'Residence', date: y, q: 'exact', date2: '', sortYear: +y, placeId: pid, homePlaceId: '', desc: 'Lives here now', conf: 'Proven', citeIds: [citeId] });
  }

  const rels: Relationship[] = [];
  const parents: string[] = [];
  for (const [p, sex] of [
    [a.father, 'M'],
    [a.mother, 'F'],
  ] as const) {
    if (!p || !(p.given.trim() || p.surname.trim())) continue;
    const pp = person(p.given, p.surname, sex, p.living);
    d.people.push(pp);
    parents.push(pp.id);
    rels.push({ id: newId(), type: 'parent', a: pp.id, b: self.id, start: '', end: '' });
  }
  if (parents.length === 2) rels.push({ id: newId(), type: 'spouse', a: parents[0], b: parents[1], start: '', end: '' });
  d.rels = rels;
  d.settings = {
    tree_name: `${self.surname} Family Tree`,
    subtitle: `${self.given} ${self.surname}’s family`,
    home_person: self.id,
    self_person: self.id,
    privacy_default: 'Private',
    backup_schedule: 'daily',
  };
  return { data: d, selfId: self.id };
}

// ---------- account keys ----------
// Each account has a random "data key" that encrypts its tree files. The key is stored
// twice, each copy locked (AES-GCM) with a key derived from something only the person
// has: their password, and their recovery code. Neither the password, the recovery code
// nor the data key itself is ever saved in readable form.

export interface Wrapped {
  salt: string; // base64
  iv: string; // base64
  iterations: number;
  data: string; // base64 ciphertext
}

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function kek(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function wrapKey(dataKey: string, secret: string, iterations = 210_000): Promise<Wrapped> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await kek(secret, salt, iterations), new TextEncoder().encode(dataKey));
  return { salt: b64(salt), iv: b64(iv), iterations, data: b64(ct) };
}

/** The data key, or null if the secret is wrong. */
export async function unwrapKey(w: Wrapped, secret: string): Promise<string | null> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) as BufferSource }, await kek(secret, unb64(w.salt), w.iterations), unb64(w.data) as BufferSource);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export function newDataKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Recovery codes: 24 characters in groups of four, avoiding look-alike letters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRecoveryCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(24));
  const chars = Array.from(r, (b) => ALPHABET[b % ALPHABET.length]);
  return [0, 4, 8, 12, 16, 20].map((i) => chars.slice(i, i + 4).join('')).join('-');
}
/** Tidies a typed recovery code: ignores case, spaces and dashes; reads O as 0 and I/L as 1 if typed by mistake. */
export function normRecoveryCode(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (c.match(/.{1,4}/g) || []).join('-');
}
