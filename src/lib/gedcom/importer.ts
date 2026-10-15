// GEDCOM → tree data, with a preview summary, problems list, and merge into an existing tree.

import { child, children, parseGedcom, val, type GNode, type Problem } from './parse';
import { fromGedcomDate } from './dates';
import { yearOf } from '../dates';
import { treeApi } from '../family';
import { emptyTree, type Citation, type Fact, type Media, type Person, type Place, type Quality, type Relationship, type Source, type TreeData } from '../types';

export interface ImportPlan {
  fileName: string;
  sizeBytes: number;
  encoding: string;
  version: string;
  sourceSystem: string;
  treeName: string;
  data: TreeData;
  counts: { people: number; families: number; sources: number; media: number; notes: number; facts: number };
  problems: Problem[];
}

const EVENT_TYPES: Record<string, string> = {
  BIRT: 'Birth',
  CHR: 'Baptism',
  BAPM: 'Baptism',
  DEAT: 'Death',
  BURI: 'Burial',
  CREM: 'Burial',
  RESI: 'Residence',
  CENS: 'Residence',
  OCCU: 'Occupation',
  EDUC: 'Education',
  GRAD: 'Education',
  EMIG: 'Emigration',
  IMMI: 'Arrival',
  NATU: 'Other',
  _MILT: 'Military',
  _MILI: 'Military',
  _MIL: 'Military',
  MILI: 'Military',
  RETI: 'Other',
  PROB: 'Other',
  WILL: 'Other',
  CONF: 'Other',
  FCOM: 'Other',
  ORDN: 'Other',
  ADOP: 'Family event',
  RELI: 'Other',
  TITL: 'Other',
  NATI: 'Other',
  DSCR: 'Other',
  EVEN: 'Other',
  FACT: 'Other',
};
const LABEL: Record<string, string> = {
  CENS: 'Census',
  NATU: 'Naturalisation',
  RETI: 'Retirement',
  PROB: 'Probate',
  WILL: 'Will',
  CONF: 'Confirmation',
  FCOM: 'First communion',
  ORDN: 'Ordination',
  ADOP: 'Adoption',
  RELI: 'Religion',
  TITL: 'Title',
  NATI: 'Nationality',
  DSCR: 'Description',
  GRAD: 'Graduation',
  CREM: 'Cremation',
};

let counter = 0;
const uid = (p: string) => p + '-' + Date.now().toString(36) + '-' + (++counter).toString(36) + Math.random().toString(36).slice(2, 6);

function coord(s: string): number | null {
  const m = s.trim().match(/^([NSEW])?\s*(-?\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  let v = +m[2];
  if (m[1] && /[SW]/i.test(m[1])) v = -Math.abs(v);
  return isFinite(v) ? v : null;
}

function qualityOf(quay: string): Quality {
  if (quay === '3') return 'Primary';
  if (quay === '0' || quay === '1') return 'Questionable';
  return 'Secondary';
}

export function buildImport(text: string, fileName: string, sizeBytes: number, encoding: string): ImportPlan {
  const { roots, problems } = parseGedcom(text);
  const head = roots.find((r) => r.tag === 'HEAD');
  const data = emptyTree();
  const byXref: Record<string, GNode> = {};
  for (const r of roots) if (r.xref) byXref[r.xref] = r;

  const placeByName: Record<string, string> = {};
  const placeFor = (n: GNode | undefined): string => {
    if (!n || !n.value.trim()) return '';
    const full = n.value.trim().replace(/\s*,\s*/g, ', ');
    if (placeByName[full]) return placeByName[full];
    const parts = full.split(', ').filter(Boolean);
    const name = parts.length > 2 ? parts.slice(0, 2).join(', ') : full;
    const map = child(n, 'MAP');
    const p: Place = { id: uid('pl'), name, hist: full, lat: map ? coord(val(map, 'LATI')) : null, lon: map ? coord(val(map, 'LONG')) : null };
    data.places.push(p);
    placeByName[full] = p.id;
    return p.id;
  };

  const noteText = (n: GNode): string => {
    const v = n.value.trim();
    if (/^@[^@]+@$/.test(v)) {
      const rec = byXref[v];
      if (!rec) {
        problems.push({ line: n.line, kind: 'Warning', msg: `note ${v} is missing — skipped.` });
        return '';
      }
      return rec.value;
    }
    return n.value;
  };

  // Sources
  const sourceId: Record<string, string> = {};
  let noteCount = 0;
  for (const r of roots.filter((x) => x.tag === 'SOUR' && x.xref)) {
    const repoRef = val(r, 'REPO');
    const repoName = /^@[^@]+@$/.test(repoRef) ? val(byXref[repoRef], 'NAME') : repoRef;
    const s: Source = {
      id: uid('s'),
      title: val(r, 'TITL') || val(r, 'ABBR') || r.value.trim() || 'Untitled source',
      type: guessSourceType(val(r, 'TITL') + ' ' + val(r, 'PUBL')),
      repo: repoName || val(r, 'PUBL') || val(r, 'AUTH'),
      url: val(r, 'WWW') || val(r, '_URL') || '',
    };
    data.sources.push(s);
    sourceId[r.xref!] = s.id;
  }
  const inlineSource = (title: string): string => {
    const t = title.trim() || 'Untitled source';
    const hit = data.sources.find((s) => s.title === t);
    if (hit) return hit.id;
    const s: Source = { id: uid('s'), title: t, type: guessSourceType(t), repo: '', url: '' };
    data.sources.push(s);
    return s.id;
  };
  const citationsFor = (ev: GNode): string[] =>
    children(ev, 'SOUR').flatMap((sn) => {
      const ref = sn.value.trim();
      let sid: string | undefined;
      if (/^@[^@]+@$/.test(ref)) {
        sid = sourceId[ref];
        if (!sid) {
          problems.push({ line: sn.line, kind: 'Warning', msg: `source ${ref} is missing — citation skipped.` });
          return [];
        }
      } else sid = inlineSource(ref);
      const dataNode = child(sn, 'DATA');
      const c: Citation = {
        id: uid('c'),
        sourceId: sid,
        page: val(sn, 'PAGE'),
        accessed: val(dataNode, 'DATE'),
        quality: qualityOf(val(sn, 'QUAY')),
        extract: val(dataNode, 'TEXT') || children(sn, 'NOTE').map(noteText).join('\n'),
      };
      data.cites.push(c);
      return [c.id];
    });

  const factFrom = (pid: string, ev: GNode, type: string): Fact => {
    const dn = child(ev, 'DATE');
    const pd = fromGedcomDate(dn?.value || '');
    if (dn && !pd.ok) problems.push({ line: dn.line, kind: 'Warning', msg: `date “${dn.value.trim()}” can’t be read — kept as text.` });
    let desc = ev.value.trim();
    const typ = val(ev, 'TYPE');
    if (ev.tag === 'EVEN' || ev.tag === 'FACT') desc = [typ, desc].filter(Boolean).join(': ');
    else if (LABEL[ev.tag] && type === 'Other') desc = [LABEL[ev.tag], desc].filter(Boolean).join(': ');
    else if (ev.tag === 'CENS') desc = ['Census', desc].filter(Boolean).join(': ');
    if (typ && /milit|service|enlist|war/i.test(typ)) type = 'Military';
    const addr = val(ev, 'ADDR');
    if (addr && !desc.includes(addr)) desc = [desc, addr].filter(Boolean).join(' — ');
    const notes = children(ev, 'NOTE').map(noteText).filter(Boolean);
    if (notes.length && !desc) desc = notes.join(' ').slice(0, 300);
    return { id: uid('f'), personId: pid, type, q: pd.q, date: pd.date, date2: pd.date2, sortYear: yearOf(pd.date), placeId: placeFor(child(ev, 'PLAC')), desc, conf: 'auto', citeIds: citationsFor(ev) };
  };

  // Media objects (files aren't inside GEDCOM — record them as links)
  const mediaId: Record<string, string> = {};
  const mediaFrom = (n: GNode): Media | null => {
    const file = child(n, 'FILE');
    const path = (file?.value || '').trim();
    if (!path && !val(n, 'TITL')) return null;
    const form = (val(file, 'FORM') || val(n, 'FORM') || path.split('.').pop() || '').toLowerCase();
    const kind: Media['kind'] = /jpe?g|png|gif|tiff?|bmp|webp|heic|photo|image/.test(form) ? 'photo' : /mp3|wav|m4a|ogg|aac|audio/.test(form) ? 'audio' : 'document';
    return {
      id: uid('m'),
      kind,
      file: '',
      thumb: '',
      scene: '',
      title: val(file, 'TITL') || val(n, 'TITL') || path.split(/[\\/]/).pop() || 'Untitled',
      date: '',
      placeId: '',
      desc: '',
      duration: 0,
      mime: '',
      originalName: path,
      sizeBytes: 0,
      faces: [],
      people: [],
      sourceIds: [],
      createdAt: new Date().toISOString(),
      addedBy: '',
      tags: {},
    };
  };
  for (const r of roots.filter((x) => x.tag === 'OBJE' && x.xref)) {
    const m = mediaFrom(r);
    if (m) {
      data.media.push(m);
      mediaId[r.xref!] = m.id;
    }
  }
  const linkMedia = (n: GNode, pid: string) => {
    for (const o of children(n, 'OBJE')) {
      const ref = o.value.trim();
      let id = /^@[^@]+@$/.test(ref) ? mediaId[ref] : undefined;
      if (!id && !ref) {
        const m = mediaFrom(o);
        if (m) {
          data.media.push(m);
          id = m.id;
        }
      }
      const m = data.media.find((x) => x.id === id);
      if (m && !m.people.includes(pid)) m.people.push(pid);
    }
  };

  // People
  const personId: Record<string, string> = {};
  const nowYear = new Date().getFullYear();
  for (const r of roots.filter((x) => x.tag === 'INDI')) {
    if (!r.xref) {
      problems.push({ line: r.line, kind: 'Skipped', msg: 'person record without an ID.' });
      continue;
    }
    const nameNode = child(r, 'NAME');
    const raw = nameNode?.value || '';
    let given = val(nameNode, 'GIVN');
    let surname = val(nameNode, 'SURN');
    const sm = raw.match(/^(.*?)\/(.*?)\/(.*)$/);
    if (!given) given = (sm ? (sm[1] + ' ' + sm[3]).trim() : raw).replace(/\s+/g, ' ').trim();
    if (!surname && sm) surname = sm[2].trim();
    const sexRaw = val(r, 'SEX').toUpperCase();
    const pidNew = uid('p');
    const p: Person = {
      id: pidNew,
      photoCrop: null,
      coverMediaId: null,
      profileId: pidNew,
      accountEmail: '',
      given,
      surname,
      sex: sexRaw === 'M' || sexRaw === 'F' ? sexRaw : sexRaw === 'X' ? 'X' : 'U',
      living: false,
      photoMediaId: null,
      avatar: '',
      privacy: 'Shared',
      notes: children(r, 'NOTE').map(noteText).filter(Boolean).join('\n\n'),
      updatedAt: new Date().toISOString(),
    };
    if (p.notes) noteCount++;
    data.people.push(p);
    personId[r.xref] = p.id;
    for (const ev of r.children) {
      const type = EVENT_TYPES[ev.tag];
      if (!type) continue;
      data.facts.push(factFrom(p.id, ev, type));
    }
    linkMedia(r, p.id);
    // Living: no death or burial, and nothing suggests they were born over 100 years ago.
    const facts = data.facts.filter((f) => f.personId === p.id);
    const died = facts.some((f) => f.type === 'Death' || f.type === 'Burial') || /^Y/i.test(val(r, 'DEAT'));
    const birth = facts.find((f) => f.type === 'Birth' || f.type === 'Baptism');
    const by = birth ? yearOf(birth.date) : null;
    const earliest = Math.min(...facts.map((f) => yearOf(f.date) || 9999));
    p.living = !died && (by ? by > nowYear - 100 : earliest === 9999 ? false : earliest > nowYear - 80);
    // An explicit "DEAT Y" with no date still means deceased.
    if (child(r, 'DEAT')) p.living = false;
    p.privacy = p.living ? 'Private' : 'Shared';
  }

  // Families
  let families = 0;
  const rel = (type: Relationship['type'], a: string, b: string, start = '') => {
    if (!data.rels.some((r) => r.type === type && ((r.a === a && r.b === b) || (type !== 'parent' && r.a === b && r.b === a))))
      data.rels.push({ id: uid('r'), type, a, b, start, end: '' });
  };
  for (const f of roots.filter((x) => x.tag === 'FAM')) {
    const ref = (tag: string) => {
      const v = val(f, tag);
      if (!v) return '';
      if (!personId[v]) {
        problems.push({ line: child(f, tag)!.line, kind: 'Warning', msg: `family points to a missing person ${v}.` });
        return '';
      }
      return personId[v];
    };
    const husb = ref('HUSB');
    const wife = ref('WIFE');
    const kids = children(f, 'CHIL')
      .map((c) => {
        const id = personId[c.value.trim()];
        if (!id) problems.push({ line: c.line, kind: 'Warning', msg: `family lists a missing child ${c.value.trim()}.` });
        return id;
      })
      .filter(Boolean);
    if (!husb && !wife && !kids.length) {
      problems.push({ line: f.line, kind: 'Skipped', msg: 'family record with no members.' });
      continue;
    }
    families++;
    const marr = child(f, 'MARR');
    const parents = [husb, wife].filter(Boolean);
    if (husb && wife) {
      rel('spouse', husb, wife, marr ? yearOf(fromGedcomDate(val(marr, 'DATE')).date)?.toString() || '' : '');
      if (marr) {
        const a = factFrom(husb, marr, 'Marriage');
        const nm = (id: string) => {
          const p = data.people.find((x) => x.id === id)!;
          return (p.given.split(' ')[0] + ' ' + p.surname).trim();
        };
        a.desc = a.desc || 'Married ' + nm(wife);
        const b: Fact = { ...a, id: uid('f'), personId: wife, desc: 'Married ' + nm(husb), citeIds: a.citeIds.map((cid) => {
          const c = data.cites.find((x) => x.id === cid)!;
          const copy = { ...c, id: uid('c') };
          data.cites.push(copy);
          return copy.id;
        }) };
        data.facts.push(a, b);
      }
      const div = child(f, 'DIV');
      if (div) {
        const r = data.rels.find((x) => x.type === 'spouse' && ((x.a === husb && x.b === wife) || (x.a === wife && x.b === husb)));
        if (r) r.end = fromGedcomDate(val(div, 'DATE')).date || 'divorced';
      }
    }
    for (const k of kids) for (const p of parents) rel('parent', p, k);
    if (!parents.length && kids.length > 1) for (let i = 1; i < kids.length; i++) rel('sibling', kids[0], kids[i]);
  }

  const sour = child(head, 'SOUR');
  const gedc = child(head, 'GEDC');
  return {
    fileName,
    sizeBytes,
    encoding,
    version: val(gedc, 'VERS') || 'unknown',
    sourceSystem: val(sour, 'NAME') || sour?.value.trim() || 'another program',
    treeName: fileName.replace(/\.ged$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported tree',
    data,
    counts: { people: data.people.length, families, sources: data.sources.length, media: data.media.length, notes: noteCount, facts: data.facts.length },
    problems,
  };
}

function guessSourceType(t: string): string {
  const s = t.toLowerCase();
  if (/census/.test(s)) return 'Census';
  if (/birth|death|marriage|registration|certificate|bdm/.test(s)) return 'Certificate';
  if (/parish|baptism|church/.test(s)) return 'Parish register';
  if (/newspaper|gazette|courier|herald|chronicle|post\b|trove/.test(s)) return 'Newspaper';
  if (/passenger|shipping|ship|immigration/.test(s)) return 'Shipping record';
  if (/military|army|service|aif|war/.test(s)) return 'Military record';
  if (/electoral|roll/.test(s)) return 'Electoral roll';
  if (/directory/.test(s)) return 'Directory';
  if (/letter/.test(s)) return 'Family letter';
  return 'Other';
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Imported people who look like someone already in the tree: same first name, surname and birth year (±2). */
export function findDuplicates(incoming: TreeData, existing: TreeData): Record<string, string> {
  const T = treeApi(existing);
  const Ti = treeApi(incoming);
  const index: Record<string, string[]> = {};
  for (const p of existing.people) {
    const k = norm(p.given.split(' ')[0] + ' ' + p.surname);
    (index[k] = index[k] || []).push(p.id);
  }
  const out: Record<string, string> = {};
  for (const p of incoming.people) {
    const cands = index[norm(p.given.split(' ')[0] + ' ' + p.surname)] || [];
    const by = Ti.birthYear(p.id);
    const hit = cands.find((c) => {
      const ey = T.birthYear(c);
      return (by === 9999 && ey === 9999) || (by !== 9999 && ey !== 9999 && Math.abs(by - ey) <= 2);
    });
    if (hit) out[p.id] = hit;
  }
  return out;
}

/**
 * What to add when merging: imported people who match someone are linked to that person
 * instead of being added twice; their new facts and relationships are added.
 */
export function mergeAdditions(incoming: TreeData, existing: TreeData, dupes: Record<string, string>): { add: TreeData; added: number; linked: number } {
  const add = emptyTree();
  const map = (id: string) => dupes[id] || id;
  const placeByName: Record<string, string> = {};
  for (const p of existing.places) placeByName[p.hist.toLowerCase()] = p.id;
  for (const p of existing.places) placeByName[p.name.toLowerCase()] = placeByName[p.name.toLowerCase()] || p.id;
  const placeMap: Record<string, string> = {};
  for (const p of incoming.places) {
    const hit = placeByName[p.hist.toLowerCase()] || placeByName[p.name.toLowerCase()];
    if (hit) placeMap[p.id] = hit;
    else add.places.push(p);
  }
  const srcByTitle: Record<string, string> = {};
  for (const s of existing.sources) srcByTitle[s.title.toLowerCase()] = s.id;
  const srcMap: Record<string, string> = {};
  for (const s of incoming.sources) {
    const hit = srcByTitle[s.title.toLowerCase()];
    if (hit) srcMap[s.id] = hit;
    else add.sources.push(s);
  }
  const usedCites = new Set<string>();
  add.people = incoming.people.filter((p) => !dupes[p.id]);
  const T = treeApi(existing);
  for (const f of incoming.facts) {
    const pid = map(f.personId);
    if (dupes[f.personId]) {
      const y = yearOf(f.date);
      if (T.factsOf(pid).some((e) => e.type === f.type && yearOf(e.date) === y)) continue;
    }
    f.citeIds.forEach((c) => usedCites.add(c));
    add.facts.push({ ...f, personId: pid, placeId: placeMap[f.placeId] || f.placeId });
  }
  add.cites = incoming.cites.filter((c) => usedCites.has(c.id)).map((c) => ({ ...c, sourceId: srcMap[c.sourceId] || c.sourceId }));
  const existsRel = (r: Relationship) =>
    existing.rels.some((e) => e.type === r.type && ((e.a === r.a && e.b === r.b) || (r.type !== 'parent' && e.a === r.b && e.b === r.a)));
  for (const r of incoming.rels) {
    const m = { ...r, a: map(r.a), b: map(r.b) };
    if (m.a !== m.b && !existsRel(m)) add.rels.push(m);
  }
  add.media = incoming.media.map((m) => ({ ...m, people: m.people.map(map), placeId: placeMap[m.placeId] || m.placeId }));
  return { add, added: add.people.length, linked: Object.keys(dupes).length };
}
