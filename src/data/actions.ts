// What happens when people click things: navigation plus every change to the tree.
// Ported from the prototype's methods (savePerson, saveFact, acceptHint, createTask…).

import type { Draft } from 'immer';
import { commit, getData, useData } from './store';
import { setUi, toast, ui, type FactForm, type ProfileTab, type Section } from './ui';
import { newId } from './platform';
import * as platform from './platform';
import { treeApi } from '../lib/family';
import { MONTHS, normaliseDate, todayLabel, yearOf } from '../lib/dates';
import type { Fact, Hint, Media, Person, PhotoCrop, Place, Relationship, Source, Story, TagStatus, Task, TreeData } from '../lib/types';
import { HOME_EVENTS } from '../lib/types';
import { mergeInto, mergeProblem, notDuplicateKey, notDuplicates, type FieldChoice, type MergeResult } from '../lib/merge';
import type { SqlLog } from './repo';

const T = () => treeApi(getData());

async function safe(fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    toast(String((e as Error)?.message || e));
    return false;
  }
}

// ---------- navigation ----------
export function go(section: Section) {
  const u = ui();
  setUi({ section, menu: null, searchOpen: false, ctx: null, panel: u.pinned ? u.panel : null, form: u.pinned ? u.form : null });
  if (section === 'tree') centreOn(u.treeView === 'family' ? T().rootId : u.focus || T().rootId);
}

/** Opens someone's full profile page. */
export function openProfile(pid: string, tab: ProfileTab = 'overview') {
  if (!getData().people.some((p) => p.id === pid)) return;
  const u = ui();
  setUi({
    section: 'profile',
    profilePid: pid,
    profileTab: tab,
    profileBack: u.section === 'profile' ? u.profileBack : u.section,
    panel: null,
    form: null,
    menu: null,
    searchOpen: false,
    ctx: null,
    focus: pid,
  });
  (document.querySelector('#main') as HTMLElement | null)?.scrollTo?.({ top: 0 });
}

export function centreOn(pid: string) {
  setUi((s) => ({ centreRequest: { pid, n: (s.centreRequest?.n || 0) + 1 } }));
}

export function openPerson(pid: string) {
  if (!getData().people.some((p) => p.id === pid)) return;
  const { treeId, prefs } = useData.getState();
  const rec = [pid, ...(prefs.recent[treeId] || []).filter((x) => x !== pid)].slice(0, 6);
  setUi({ panel: { kind: 'person', id: pid }, ptab: 'facts', form: null, ctx: null, menu: null, searchOpen: false, focus: pid, tagMode: false, pendingFace: null });
  import('./store').then(({ setPrefs }) => setPrefs((p) => ({ recent: { ...p.recent, [treeId]: rec } })));
}

export const openSource = (id: string) => setUi({ panel: { kind: 'source', id }, cf: null, menu: null, searchOpen: false });
export const openMedia = (id: string) => setUi({ panel: { kind: 'media', id }, tagMode: false, pendingFace: null, menu: null, searchOpen: false });
export const openPlace = (id: string) => setUi({ panel: { kind: 'place', id }, menu: null, searchOpen: false });
export const closePanel = () => setUi({ panel: null, form: null, cf: null, tagMode: false, pendingFace: null });

// ---------- places ----------
/** Finds a place by name (case-insensitive) or creates it inside the same change. */
export function ensurePlace(d: Draft<TreeData>, sql: SqlLog, name: string): string {
  const n = name.trim();
  if (!n) return '';
  const hit = d.places.find((p) => p.name.toLowerCase() === n.toLowerCase() || p.id === n);
  if (hit) return hit.id;
  const p: Place = { id: newId(), name: n, hist: n, lat: null, lon: null };
  d.places.push(p);
  sql.place(p);
  return p.id;
}

export async function updatePlace(id: string, patch: Partial<Place>) {
  await safe(() =>
    commit((d, sql) => {
      const p = d.places.find((x) => x.id === id);
      if (!p) return;
      Object.assign(p, patch);
      sql.place(p as Place);
    }),
  );
}

// ---------- people ----------
/** A sensible starting choice: a second parent is the other sex, a partner usually the opposite one. */
function guessSex(t: ReturnType<typeof T>, pid: string, rel: string): Person['sex'] {
  const p = pid ? t.person[pid] : null;
  if (!p) return 'U';
  if (rel === 'parent') {
    const ps = t.parents(pid).map((x) => t.person[x]?.sex);
    if (ps.includes('M') && !ps.includes('F')) return 'F';
    if (ps.includes('F') && !ps.includes('M')) return 'M';
  }
  if (rel === 'spouse') return p.sex === 'M' ? 'F' : p.sex === 'F' ? 'M' : 'U';
  return 'U';
}

export const sexProblem = (sex: string) => (sex === 'M' || sex === 'F' ? '' : 'Choose male or female.');

export function addRelModal(pid: string, rel: 'none' | 'child' | 'parent' | 'spouse' | 'sibling' = pid ? 'child' : 'none') {
  const t = T();
  const p = pid ? t.person[pid] : null;
  const sp = pid ? t.spouses(pid) : [];
  let surname = '';
  if (p) {
    if (rel === 'child') surname = p.sex === 'M' ? p.surname : sp[0] && t.person[sp[0]]?.sex === 'M' ? t.person[sp[0]].surname : p.surname;
    else if ((rel === 'sibling' || rel === 'parent') && p.sex !== 'F') surname = p.surname;
    else if (rel === 'sibling') surname = p.surname;
  }
  setUi({
    ctx: null,
    menu: null,
    modal: { kind: 'add', relTo: pid || '', rel, given: '', surname, sex: guessSex(t, pid, rel), bdate: '', bq: 'exact', bplace: '', living: rel !== 'parent', other: rel === 'child' ? sp[0] || '' : '' },
  });
}

export async function savePerson(f: Extract<NonNullable<ReturnType<typeof ui>['modal']>, { kind: 'add' }>) {
  if (!f.given.trim() && !f.surname.trim()) {
    toast('Add a first name to continue');
    return;
  }
  if (sexProblem(f.sex)) {
    toast(sexProblem(f.sex));
    return;
  }
  const id = newId();
  const ok = await safe(() =>
    commit((d, sql) => {
      const p: Person = {
        id,
        given: f.given.trim(),
        surname: f.surname.trim(),
        sex: f.sex,
        living: !!f.living,
        photoMediaId: null,
        photoCrop: null,
        coverMediaId: null,
        profileId: id,
        accountEmail: '',
        avatar: '',
        privacy: f.living ? 'Private' : 'Shared',
        notes: '',
        updatedAt: new Date().toISOString(),
      };
      d.people.push(p);
      sql.person(p);
      if (f.bdate.trim()) {
        const date = normaliseDate(f.bdate);
        const fact: Fact = { id: newId(), personId: id, type: 'Birth', q: f.bq, date, date2: '', sortYear: yearOf(date), placeId: ensurePlace(d, sql, f.bplace), homePlaceId: '', desc: '', conf: 'auto', citeIds: [] };
        d.facts.push(fact);
        sql.fact(fact);
      }
      linkAs(d, sql, f, id);
      if (!d.settings.root_person && d.people.length === 1) {
        d.settings.root_person = id;
        sql.setting('root_person', id);
      }
    }),
  );
  if (!ok) return;
  setUi((s) => ({ modal: null, collapsed: f.relTo ? { ...s.collapsed, [f.relTo]: false } : s.collapsed }));
  if (ui().screen !== 'app') setUi({ screen: 'app', section: 'tree' });
  openPerson(id);
  toast(T().nm(id) + ' added to the tree');
}

/** Links person `id` to f.relTo in the role chosen in "Add a person" (skips links that already exist). */
function linkAs(d: Draft<TreeData>, sql: SqlLog, f: { relTo: string; rel: string; other: string }, id: string) {
  const has = (type: string, a: string, b: string) =>
    d.rels.some((r) => r.type === type && ((r.a === a && r.b === b) || (type !== 'parent' && r.a === b && r.b === a)));
  const R = (type: 'parent' | 'spouse' | 'sibling', a: string, b: string) => {
    if (a === b || has(type, a, b)) return;
    const r = { id: newId(), type, a, b, start: '', end: '' };
    d.rels.push(r);
    sql.rel(r);
  };
  const t = f.relTo;
  const tree = treeApi(getData());
  if (t && f.rel === 'child') {
    R('parent', t, id);
    if (f.other) R('parent', f.other, id);
  }
  if (t && f.rel === 'parent') {
    const ex = tree.parents(t).filter((x) => x !== id);
    R('parent', id, t);
    if (ex.length === 1 && !tree.spouseRelId(ex[0], id)) R('spouse', ex[0], id);
  }
  if (t && f.rel === 'spouse') R('spouse', t, id);
  if (t && f.rel === 'sibling') {
    const ps = tree.parents(t);
    if (ps.length) ps.forEach((p) => R('parent', p, id));
    else R('sibling', t, id);
  }
}

/** "Add a person" found them already in the tree: link that person instead of making a copy. */
export async function linkExistingPerson(f: { relTo: string; rel: string; other: string }, existingId: string) {
  if (f.relTo && f.rel !== 'none') {
    if (f.rel === 'parent' && treeApi(getData()).parents(existingId).includes(f.relTo)) {
      toast('They’re already recorded the other way round (as a child), so they can’t be a parent too.');
      return;
    }
    const ok = await safe(() => commit((d, sql) => linkAs(d, sql, f, existingId)));
    if (!ok) return;
    toast(`Linked ${T().short(existingId)} as ${f.rel === 'spouse' ? 'partner' : f.rel} of ${T().short(f.relTo)}`);
  }
  setUi({ modal: null });
  openPerson(existingId);
}

export async function updatePerson(pid: string, patch: Partial<Person>) {
  return safe(() =>
    commit((d, sql) => {
      const p = d.people.find((x) => x.id === pid);
      if (!p) return;
      Object.assign(p, patch, { updatedAt: new Date().toISOString() });
      sql.person(p as Person);
    }),
  );
}

let notesTimer: ReturnType<typeof setTimeout> | undefined;
const pendingNotes: Record<string, string> = {};
/** Notes save shortly after typing stops. */
export function setNotes(pid: string, notes: string) {
  pendingNotes[pid] = notes;
  // Show the typed text immediately.
  useData.setState((s) => ({ data: { ...s.data, people: s.data.people.map((p) => (p.id === pid ? { ...p, notes } : p)) } }));
  clearTimeout(notesTimer);
  notesTimer = setTimeout(flushNotes, 600);
}
export async function flushNotes() {
  const ids = Object.keys(pendingNotes);
  if (!ids.length) return;
  const { db } = useData.getState();
  const stmts = ids.map((id) => ({ sql: 'UPDATE person SET notes = ?, updated_at = ? WHERE id = ?', params: [pendingNotes[id], new Date().toISOString(), id] }));
  ids.forEach((id) => delete pendingNotes[id]);
  try {
    await db?.batch(stmts);
  } catch (e) {
    toast('Couldn’t save notes: ' + String(e));
  }
}

export async function setRootPerson(pid: string) {
  await setSetting('root_person', pid);
}

export async function deletePerson(pid: string) {
  const name = T().nm(pid);
  const ok = await safe(() =>
    commit((d, sql) => {
      const factIds = new Set(d.facts.filter((f) => f.personId === pid).map((f) => f.id));
      d.facts = d.facts.filter((f) => f.personId !== pid);
      d.rels = d.rels.filter((r) => r.a !== pid && r.b !== pid);
      d.hints = d.hints.filter((h) => h.personId !== pid);
      d.tasks.forEach((t) => {
        if (t.personId === pid) t.personId = '';
        if (factIds.has(t.factId)) t.factId = '';
      });
      d.stories.forEach((s) => {
        delete s.people[pid];
        if (factIds.has(s.factId)) s.factId = '';
      });
      d.media.forEach((m) => {
        if (m.faces.some((f) => f.personId === pid) || m.people.includes(pid)) {
          m.faces = m.faces.filter((f) => f.personId !== pid);
          m.people = m.people.filter((x) => x !== pid);
        }
      });
      d.people = d.people.filter((p) => p.id !== pid);
      if (d.settings.root_person === pid) {
        delete d.settings.root_person;
        sql.setting('root_person', '');
      }
      sql.del('person', pid); // relationships, facts, faces and hints go with it (ON DELETE CASCADE)
    }),
  );
  if (ok) {
    closePanel();
    toast(name + ' removed from the tree');
  }
}

export async function removeRelationship(a: string, b: string) {
  await safe(() =>
    commit((d, sql) => {
      const hit = d.rels.filter((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
      hit.forEach((r) => sql.del('relationship', r.id));
      d.rels = d.rels.filter((r) => !hit.includes(r));
    }),
  );
  toast('Relationship removed');
}

// ---------- facts ----------
export function startEdit(f: Fact) {
  const t = T();
  setUi({
    panel: { kind: 'person', id: f.personId },
    ptab: 'facts',
    form: { fid: f.id, pid: f.personId, type: f.type, q: f.q || 'exact', date: f.date, date2: f.date2, place: t.placeName(f.placeId), home: t.placeName(f.homePlaceId), desc: f.desc, conf: f.conf, cites: [...f.citeIds], newCites: [], newSrc: '', newPage: '', newQual: 'Secondary' },
  });
}

export function startAdd(pid: string) {
  setUi({ ptab: 'facts', form: { fid: null, pid, type: 'Residence', q: 'exact', date: '', date2: '', place: '', home: '', desc: '', conf: 'auto', cites: [], newCites: [], newSrc: '', newPage: '', newQual: 'Secondary' } });
}

export async function saveFact(fm: FactForm) {
  const t = T();
  const before = fm.fid ? t.conf(t.fact[fm.fid]) : null;
  const id = fm.fid || newId();
  const ok = await safe(() =>
    commit((d, sql) => {
      let f = d.facts.find((x) => x.id === id);
      if (!f) {
        f = { id, personId: fm.pid, type: fm.type, q: 'exact', date: '', date2: '', sortYear: null, placeId: '', homePlaceId: '', desc: '', conf: 'auto', citeIds: [] };
        d.facts.push(f);
      }
      const date = normaliseDate(fm.date);
      Object.assign(f, { type: fm.type, q: fm.q, date, date2: normaliseDate(fm.date2), sortYear: yearOf(date), placeId: ensurePlace(d, sql, fm.place), homePlaceId: HOME_EVENTS[fm.type] ? ensurePlace(d, sql, fm.home || '') : '', desc: fm.desc.trim(), conf: fm.conf });
      f.citeIds = [...fm.cites];
      for (const nc of fm.newCites) {
        const c = { id: newId(), sourceId: nc.sourceId, page: nc.page, accessed: todayLabel(), quality: nc.quality, extract: '' };
        d.cites.push(c);
        sql.cite(c);
        f.citeIds.push(c.id);
      }
      sql.fact(f as Fact);
    }),
  );
  if (!ok) return;
  setUi({ form: null });
  const t2 = T();
  const after = t2.conf(t2.fact[id]);
  toast(before && before !== after ? `${fm.type} updated — now ${after} (was ${before})` : `${fm.type} saved · ${after}`);
}

export async function deleteFact(fid: string) {
  const ok = await safe(() =>
    commit((d, sql) => {
      d.facts = d.facts.filter((f) => f.id !== fid);
      d.tasks.forEach((t) => {
        if (t.factId === fid) t.factId = '';
      });
      d.stories.forEach((s) => {
        if (s.factId === fid) s.factId = '';
      });
      sql.del('fact', fid);
    }),
  );
  if (ok) {
    setUi({ form: null });
    toast('Fact removed');
  }
}

// ---------- hints ----------
export async function acceptHint(h: Hint) {
  const ok = await safe(() =>
    commit((d, sql) => {
      let sid = h.record.srcId || '';
      if (!sid || !d.sources.some((s) => s.id === sid)) {
        const src = { id: newId(), title: h.record.srcNew?.title || h.collection, type: h.record.srcNew?.type || 'Other', repo: h.record.srcNew?.repo || h.provider, url: '' };
        d.sources.push(src);
        sql.source(src);
        sid = src.id;
      }
      for (const pr of h.record.props) {
        const c = { id: newId(), sourceId: sid, page: h.record.page, accessed: todayLabel(), quality: h.record.qual, extract: h.record.extract };
        d.cites.push(c);
        sql.cite(c);
        const placeId = d.places.some((p) => p.id === pr.place) ? pr.place : ensurePlace(d, sql, pr.place);
        let f = pr.replace ? d.facts.find((x) => x.personId === h.personId && x.type === pr.type) : undefined;
        if (f) {
          Object.assign(f, { q: pr.q || 'exact', date: pr.date, sortYear: yearOf(pr.date), placeId, desc: pr.desc });
          f.citeIds.push(c.id);
        } else {
          f = { id: newId(), personId: h.personId, type: pr.type, q: pr.q || 'exact', date: pr.date, date2: '', sortYear: yearOf(pr.date), placeId, homePlaceId: '', desc: pr.desc, conf: 'auto', citeIds: [c.id] };
          d.facts.push(f);
        }
        sql.fact(f as Fact);
      }
      const hh = d.hints.find((x) => x.id === h.id)!;
      hh.status = 'accepted';
      sql.hint(hh as Hint);
    }),
  );
  if (!ok) return;
  const next = getData().hints.find((x) => x.status === 'pending');
  if (next) setUi({ hintSel: next.id });
  openPerson(h.personId);
  const n = h.record.props.length;
  toast(`Hint accepted — ${n} fact${n > 1 ? 's' : ''} and a citation added to ${T().short(h.personId)}`);
}

export async function setHintStatus(h: Hint, status: Hint['status']) {
  const ok = await safe(() =>
    commit((d, sql) => {
      const hh = d.hints.find((x) => x.id === h.id)!;
      hh.status = status;
      sql.hint(hh as Hint);
    }),
  );
  if (!ok) return;
  const next = getData().hints.find((x) => x.status === 'pending');
  if (next) setUi({ hintSel: next.id });
  toast(status === 'rejected' ? 'Hint rejected' : 'Saved for later');
}

// ---------- tasks ----------
export async function createTask(f: Fact) {
  const t: Task = { id: newId(), title: `Verify ${f.type.toLowerCase()} of ${T().short(f.personId)}`, personId: f.personId, factId: f.id, status: 'To do', priority: 'Medium', notes: '', createdAt: new Date().toISOString() };
  const ok = await safe(() =>
    commit((d, sql) => {
      d.tasks.unshift(t);
      sql.task(t);
    }),
  );
  if (ok) {
    setUi({ rtab: 'tasks', tfilter: 'open', taskOpen: t.id });
    toast('Research task created');
  }
}

export async function addTask(m: { title: string; pid: string; priority: Task['priority']; notes: string; factId?: string }) {
  if (!m.title.trim()) {
    toast('Give the task a title');
    return false;
  }
  const t: Task = { id: newId(), title: m.title.trim(), personId: m.pid, factId: m.factId || '', status: 'To do', priority: m.priority, notes: m.notes, createdAt: new Date().toISOString() };
  const ok = await safe(() =>
    commit((d, sql) => {
      d.tasks.unshift(t);
      sql.task(t);
    }),
  );
  if (ok) toast('Task added');
  return ok;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const ok = await safe(() =>
    commit((d, sql) => {
      const t = d.tasks.find((x) => x.id === id);
      if (!t) return;
      Object.assign(t, patch);
      sql.task(t as Task);
    }),
  );
  if (ok && patch.status === 'Done') toast('Nice work — task marked Done');
}

export async function deleteTask(id: string) {
  await safe(() =>
    commit((d, sql) => {
      d.tasks = d.tasks.filter((t) => t.id !== id);
      sql.del('task', id);
    }),
  );
}

// ---------- sources & citations ----------
export async function saveSource(m: { id?: string; title: string; type: string; repo: string; url: string }) {
  if (!m.title.trim()) {
    toast('Give the source a title');
    return null;
  }
  const id = m.id || newId();
  const ok = await safe(() =>
    commit((d, sql) => {
      let s = d.sources.find((x) => x.id === id);
      if (!s) {
        s = { id, title: '', type: '', repo: '', url: '' };
        d.sources.push(s);
      }
      Object.assign(s, { title: m.title.trim(), type: m.type, repo: m.repo.trim(), url: m.url.trim() });
      sql.source(s);
    }),
  );
  return ok ? id : null;
}

export async function deleteSource(id: string) {
  const ok = await safe(() =>
    commit((d, sql) => {
      const cids = new Set(d.cites.filter((c) => c.sourceId === id).map((c) => c.id));
      d.facts.forEach((f) => {
        if (f.citeIds.some((c) => cids.has(c))) f.citeIds = f.citeIds.filter((c) => !cids.has(c));
      });
      d.cites = d.cites.filter((c) => c.sourceId !== id);
      d.media.forEach((m) => {
        if (m.sourceIds.includes(id)) m.sourceIds = m.sourceIds.filter((x) => x !== id);
      });
      d.sources = d.sources.filter((s) => s.id !== id);
      sql.del('source', id);
    }),
  );
  if (ok) {
    closePanel();
    toast('Source deleted');
  }
}

export async function saveCitation(sourceId: string, cf: { page: string; accessed: string; quality: Fact['conf'] | string; extract: string; fact: string }) {
  if (!cf.page.trim()) {
    toast('Add the page or entry');
    return false;
  }
  const t = T();
  const before = cf.fact ? t.conf(t.fact[cf.fact]) : null;
  const id = newId();
  const ok = await safe(() =>
    commit((d, sql) => {
      const c = { id, sourceId, page: cf.page.trim(), accessed: cf.accessed, quality: cf.quality as 'Primary', extract: cf.extract.trim() };
      d.cites.push(c);
      sql.cite(c);
      if (cf.fact) {
        const f = d.facts.find((x) => x.id === cf.fact);
        if (f) {
          f.citeIds.push(id);
          sql.fact(f as Fact);
        }
      }
    }),
  );
  if (!ok) return false;
  if (cf.fact) {
    const t2 = T();
    const f = t2.fact[cf.fact];
    const after = t2.conf(f);
    toast(`Citation attached to ${t2.short(f.personId)}’s ${f.type.toLowerCase()} — now ${after}${before !== after ? ` (was ${before})` : ''}`);
  } else toast('Citation created');
  return true;
}

export async function deleteCitation(id: string) {
  await safe(() =>
    commit((d, sql) => {
      d.facts.forEach((f) => {
        if (f.citeIds.includes(id)) f.citeIds = f.citeIds.filter((c) => c !== id);
      });
      d.cites = d.cites.filter((c) => c.id !== id);
      sql.del('citation', id);
    }),
  );
  toast('Citation removed');
}

// ---------- media ----------
export async function addMediaFromPicked(picked: platform.PickedFile, meta: { title: string; date: string; place: string; forPid?: string; forSource?: string }) {
  const { treeId } = useData.getState();
  const file = await platform.importMediaFile(treeId, picked);
  let duration = 0;
  if (file.kind === 'audio') duration = await audioDuration(platform.mediaUrl(file.file));
  const m: Media = {
    id: file.id,
    kind: file.kind,
    file: file.file,
    thumb: file.thumb,
    scene: '',
    title: meta.title.trim() || file.originalName.replace(/\.[^.]+$/, ''),
    date: normaliseDate(meta.date),
    placeId: '',
    desc: '',
    duration,
    mime: file.mime,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    faces: [],
    people: meta.forPid ? [meta.forPid] : [],
    sourceIds: meta.forSource ? [meta.forSource] : [],
    createdAt: new Date().toISOString(),
    addedBy: useData.getState().account?.name || useData.getState().prefs.ownerName || '',
    tags: {},
  };
  const ok = await safe(() =>
    commit((d, sql) => {
      m.placeId = ensurePlace(d, sql, meta.place);
      const who = meta.forPid ? d.people.find((pp) => pp.id === meta.forPid) : undefined;
      if (who) {
        m.tags[who.id] = { status: newTagStatus(who), by: m.addedBy };
        // First photo of someone becomes their profile photo
        if (m.kind === 'photo' && m.file && !who.photoMediaId && m.tags[who.id].status === 'shown') {
          who.photoMediaId = m.id;
          who.photoCrop = null;
          who.avatar = '';
          sql.person(who as Person);
        }
      }
      d.media.unshift(m);
      sql.media(m);
    }),
  );
  return ok ? m : null;
}

function audioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    if (!url) return resolve(0);
    const a = new Audio();
    const done = (v: number) => resolve(isFinite(v) ? Math.round(v) : 0);
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => resolve(0);
    setTimeout(() => resolve(0), 4000);
    a.src = url;
  });
}

async function editMedia(id: string, fn: (m: Draft<Media>, d: Draft<TreeData>, sql: SqlLog) => void) {
  return safe(() =>
    commit((d, sql) => {
      const m = d.media.find((x) => x.id === id);
      if (!m) return;
      fn(m, d, sql);
      sql.media(m as Media);
    }),
  );
}

/** Who "I" am when tagging, and whether a tag needs the tagged person's OK first. */
function me() {
  const { account, prefs } = useData.getState();
  return { name: account?.name || prefs.ownerName || '', email: account?.email || '' };
}
/** Tags of account holders other than you wait for their approval; everything else shows straight away. */
export function newTagStatus(p: Pick<Person, 'accountEmail'> | undefined): TagStatus {
  const { email } = me();
  return p?.accountEmail && p.accountEmail !== email ? 'pending' : 'shown';
}

export async function tagFace(mediaId: string, personId: string, x: number, y: number) {
  let status = 'shown' as TagStatus;
  const ok = await editMedia(mediaId, (m, d, sql) => {
    m.faces.push({ personId, x, y });
    status = newTagStatus(d.people.find((pp) => pp.id === personId));
    m.tags[personId] = { status, by: me().name };
    m.people = m.people.filter((p) => p !== personId);
    const p = d.people.find((pp) => pp.id === personId);
    if (p && !p.photoMediaId && !p.avatar && m.file) {
      p.photoMediaId = m.id;
      sql.person(p as Person);
    }
  });
  if (ok) toast(status === 'pending' ? `Tagged ${T().short(personId)} — it shows on their profile once they approve it` : `Tagged ${T().short(personId)} — the photo now shows on their profile`);
}

export async function removeFace(mediaId: string, index: number) {
  await editMedia(mediaId, (m, d, sql) => {
    const [f] = m.faces.splice(index, 1);
    const p = f && d.people.find((pp) => pp.id === f.personId);
    if (p && p.photoMediaId === m.id && !m.faces.some((x) => x.personId === p.id)) {
      p.photoMediaId = null;
      sql.person(p as Person);
    }
  });
}

export async function linkMediaPerson(mediaId: string, personId: string, on: boolean) {
  await editMedia(mediaId, (m, d) => {
    m.people = m.people.filter((p) => p !== personId);
    if (on) {
      m.people.push(personId);
      if (!m.tags[personId]) m.tags[personId] = { status: newTagStatus(d.people.find((pp) => pp.id === personId)), by: me().name };
    }
  });
}

/** Approve, hide or show a photo on someone's profile. */
export async function setTagStatus(mediaId: string, personId: string, status: TagStatus) {
  const ok = await editMedia(mediaId, (m, d, sql) => {
    m.tags[personId] = { status, by: m.tags[personId]?.by || '' };
    if (status !== 'shown') {
      const p = d.people.find((pp) => pp.id === personId);
      if (p && (p.photoMediaId === m.id || p.coverMediaId === m.id)) {
        if (p.photoMediaId === m.id) p.photoMediaId = null;
        if (p.coverMediaId === m.id) p.coverMediaId = null;
        sql.person(p as Person);
      }
    }
  });
  if (ok) toast(status === 'shown' ? 'Now showing on the profile' : status === 'hidden' ? 'Hidden from the profile' : 'Waiting for approval');
}

export async function setCoverPhoto(pid: string, mediaId: string | null) {
  const ok = await updatePerson(pid, { coverMediaId: mediaId });
  if (ok) toast(mediaId ? 'Cover photo updated' : 'Cover photo removed');
}

export async function setPhotoCrop(pid: string, crop: PhotoCrop | null) {
  const ok = await updatePerson(pid, { photoCrop: crop });
  if (ok) toast('Profile photo adjusted');
}

export async function linkMediaSource(mediaId: string, sourceId: string, on = true) {
  const ok = await editMedia(mediaId, (m) => {
    m.sourceIds = m.sourceIds.filter((s) => s !== sourceId);
    if (on) m.sourceIds.push(sourceId);
  });
  if (ok && on) toast('Linked to ' + (T().source[sourceId]?.title || 'source'));
}

export async function updateMedia(id: string, patch: { title?: string; date?: string; place?: string; desc?: string }) {
  await editMedia(id, (m, d, sql) => {
    if (patch.title !== undefined) m.title = patch.title;
    if (patch.date !== undefined) m.date = normaliseDate(patch.date);
    if (patch.desc !== undefined) m.desc = patch.desc;
    if (patch.place !== undefined) m.placeId = ensurePlace(d, sql, patch.place);
  });
}

export async function setProfilePhoto(pid: string, mediaId: string | null) {
  const ok = await updatePerson(pid, { photoMediaId: mediaId, photoCrop: null, avatar: mediaId ? '' : T().person[pid]?.avatar || '' });
  if (ok) toast(mediaId ? 'Profile photo updated' : 'Profile photo removed');
}

export async function deleteMedia(id: string) {
  const m = getData().media.find((x) => x.id === id);
  if (!m) return;
  const ok = await safe(() =>
    commit((d, sql) => {
      d.people.forEach((p) => {
        if (p.photoMediaId === id || p.coverMediaId === id) {
          if (p.photoMediaId === id) p.photoMediaId = null;
          if (p.coverMediaId === id) p.coverMediaId = null;
          sql.person(p as Person);
        }
      });
      d.media = d.media.filter((x) => x.id !== id);
      sql.del('media', id);
    }),
  );
  if (!ok) return;
  // Files stay in backups; remove the working copy.
  platform.removeMediaFile(useData.getState().treeId, m.file).catch(() => {});
  closePanel();
  toast('Removed from Media');
}

// ---------- settings ----------
export async function setSetting(key: string, value: string) {
  await safe(() =>
    commit((d, sql) => {
      d.settings[key] = value;
      sql.setting(key, value);
    }),
  );
}

// ---------- duplicates ----------
/** Merges two records of the same person into one profile. A backup is taken first. */
export async function mergePeople(keepId: string, otherId: string, choice: FieldChoice = {}): Promise<boolean> {
  const prob = mergeProblem(getData(), keepId, otherId);
  if (prob) {
    toast(prob);
    return false;
  }
  const { treeId } = useData.getState();
  const name = T().nm(keepId);
  await platform.backupNow(treeId, 'before-merge').catch(() => undefined);
  let res: MergeResult | null = null;
  const ok = await safe(() =>
    commit((d, sql) => {
      const r = mergeInto(d as TreeData, keepId, otherId, choice);
      res = r;
      const byId = <X extends { id: string }>(xs: X[], id: string) => xs.find((x) => x.id === id);
      // Re-point everything first, then delete — deleting the old record removes anything still attached to it.
      for (const id of r.changedPeople) sql.person(byId(d.people, id) as Person);
      for (const id of r.changedFacts) sql.fact(byId(d.facts, id) as Fact);
      for (const id of r.changedTasks) sql.task(byId(d.tasks, id) as Task);
      for (const id of r.changedStories) sql.story(byId(d.stories, id) as Story);
      for (const id of r.changedHints) sql.hint(byId(d.hints, id) as Hint);
      for (const id of r.changedMedia) sql.media(byId(d.media, id) as Media);
      for (const id of r.changedRels) sql.rel(byId(d.rels, id) as Relationship);
      for (const key of r.changedSettings) sql.setting(key, d.settings[key]);
      for (const id of r.removedFacts) sql.del('fact', id);
      for (const id of r.removedRels) sql.del('relationship', id);
      sql.del('person', otherId);
    }),
  );
  if (!ok || !res) return false;
  const u = ui();
  setUi({
    profilePid: u.profilePid === otherId ? keepId : u.profilePid,
    panel: u.panel?.kind === 'person' && u.panel.id === otherId ? { kind: 'person', id: keepId } : u.panel,
    focus: u.focus === otherId ? keepId : u.focus,
  });
  import('./store').then(({ setPrefs }) =>
    setPrefs((p) => ({ recent: { ...p.recent, [treeId]: (p.recent[treeId] || []).map((x) => (x === otherId ? keepId : x)).filter((x, i, a) => a.indexOf(x) === i) } })),
  );
  const r = res as MergeResult;
  toast(`Merged into one profile for ${name}${r.movedFacts || r.movedPhotos ? ` — ${r.movedFacts} fact${r.movedFacts === 1 ? '' : 's'} and ${r.movedPhotos} photo${r.movedPhotos === 1 ? '' : 's'} moved across` : ''}`);
  return true;
}

/** Remembers that two people only look alike, so they aren't suggested again. */
export async function markNotDuplicate(a: string, b: string) {
  const set = notDuplicates(getData());
  set.add(notDuplicateKey(a, b));
  await setSetting('not_duplicates', JSON.stringify([...set]));
  toast('Got it — they won’t be suggested again');
}

// ---------- life stories ----------
export interface StoryDraft {
  id?: string;
  title: string;
  body: string;
  date: string;
  q?: Story['q'];
  date2?: string;
  ageAt?: number | null; // "at 5 years old": the date is worked out from the first person's birth
  place: string;
  factId: string;
  people: string[]; // the first is the person whose profile it was written on
  mediaIds: string[];
}

/** Saves a life story. Stories about another account holder wait for them to approve before they show. */
export async function saveStory(f: StoryDraft): Promise<string | null> {
  if (!f.title.trim() && !f.body.trim()) {
    toast('Give the story a title or write something first');
    return null;
  }
  if (!f.people.length) {
    toast('Choose who the story is about');
    return null;
  }
  const id = f.id || newId();
  const now = new Date().toISOString();
  const { name, email } = me();
  let waiting: string[] = [];
  const ok = await safe(() =>
    commit((d, sql) => {
      let s = d.stories.find((x) => x.id === id);
      if (!s) {
        s = { id, title: '', body: '', date: '', q: 'exact', date2: '', ageAt: null, sortYear: null, placeId: '', factId: '', author: name, authorEmail: email, people: {}, mediaIds: [], createdAt: now, updatedAt: now };
        d.stories.push(s);
      }
      const date = normaliseDate(f.date);
      const fact = f.factId ? d.facts.find((x) => x.id === f.factId) : undefined;
      const people: Record<string, TagStatus> = {};
      for (const pid of f.people) {
        const p = d.people.find((x) => x.id === pid);
        if (!p) continue;
        people[pid] = s.people[pid] || newTagStatus(p);
      }
      waiting = Object.entries(people)
        .filter(([, st]) => st === 'pending')
        .map(([pid]) => pid);
      Object.assign(s, {
        title: f.title.trim(),
        body: f.body.trim(),
        date,
        q: f.q || 'exact',
        date2: f.q === 'between' ? normaliseDate(f.date2 || '') : '',
        ageAt: f.ageAt ?? null,
        sortYear: yearOf(date) ?? (fact ? yearOf(fact.date) : null),
        placeId: ensurePlace(d, sql, f.place),
        factId: fact ? fact.id : '',
        people,
        mediaIds: f.mediaIds.filter((m) => d.media.some((x) => x.id === m)),
        updatedAt: now,
      });
      sql.story(s as Story);
    }),
  );
  if (!ok) return null;
  toast(waiting.length ? `Story saved — it shows on ${T().short(waiting[0])}’s profile once they approve it` : f.id ? 'Story updated' : 'Story added to the timeline');
  return id;
}

export async function deleteStory(id: string) {
  const ok = await safe(() =>
    commit((d, sql) => {
      d.stories = d.stories.filter((s) => s.id !== id);
      sql.del('story', id);
    }),
  );
  if (ok) toast('Story deleted');
}

/** Approve, hide or show a story on someone's profile. */
export async function setStoryStatus(id: string, pid: string, status: TagStatus) {
  const ok = await safe(() =>
    commit((d, sql) => {
      const s = d.stories.find((x) => x.id === id);
      if (!s || !(pid in s.people)) return;
      s.people[pid] = status;
      sql.story(s as Story);
    }),
  );
  if (ok) toast(status === 'shown' ? 'Now showing on the profile' : 'Hidden from the profile');
}

/** Whether the signed-in account wrote this story (and so can edit or delete it). */
export function isMyStory(s: Story) {
  const { email, name } = me();
  return s.authorEmail ? s.authorEmail === email : !s.author || s.author === name;
}

// ---------- Family Wall ----------
/**
 * A life event a member posted on the Family Wall, approved by the owner: added to their person
 * as a fact, cited (Secondary, so Probable) to the wall post.
 */
export async function addFactFromWall(
  personId: string,
  life: { type: string; date: string; place: string },
  body: string,
  authorName: string,
  postedAt: string,
  wallName: string,
): Promise<boolean> {
  const { LIFE_TO_FACT } = await import('../wall/types');
  const type = LIFE_TO_FACT[life.type] || 'Family event';
  const posted = new Date(postedAt);
  const postedLabel = isNaN(+posted) ? '' : `${posted.getDate()} ${MONTHS[posted.getMonth()]} ${posted.getFullYear()}`;
  const ok = await safe(() =>
    commit((d, sql) => {
      const title = `Family Wall — ${wallName}`;
      let src = d.sources.find((s) => s.title === title && s.type === 'Family Wall post');
      if (!src) {
        src = { id: newId(), title, type: 'Family Wall post', repo: 'Family Wall (online)', url: '' };
        d.sources.push(src);
        sql.source(src as Source);
      }
      const cite = { id: newId(), sourceId: src.id, page: `Post by ${authorName}${postedLabel ? ', ' + postedLabel : ''}`, accessed: postedLabel, quality: 'Secondary' as const, extract: body.slice(0, 2000) };
      d.cites.push(cite);
      sql.cite(cite);
      const date = normaliseDate(life.date || '');
      const fact: Fact = {
        id: newId(),
        personId,
        type,
        q: 'exact',
        date,
        date2: '',
        sortYear: yearOf(date),
        placeId: ensurePlace(d, sql, life.place || ''),
        homePlaceId: '',
        desc: type === life.type ? body.slice(0, 120) : `${life.type}${body ? ': ' + body.slice(0, 100) + (body.length > 100 ? '…' : '') : ''}`,
        conf: 'auto',
        citeIds: [cite.id],
      };
      d.facts.push(fact);
      sql.fact(fact);
    }),
  );
  return ok;
}
