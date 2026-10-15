import { describe, expect, it } from 'vitest';
import { confOf } from '../lib/confidence';
import { dateLabel, fullDate, normaliseDate, yearOf } from '../lib/dates';
import { fromGedcomDate, toGedcomDate } from '../lib/gedcom/dates';
import { treeApi } from '../lib/family';
import { sampleTree } from '../lib/sample';
import { layDesc, layPed } from '../lib/layout';
import { searchTree } from '../lib/search';

describe('confidence rule', () => {
  it('no citations is Unverified', () => expect(confOf('exact', [])).toBe('Unverified'));
  it('exact date + Primary is Proven', () => expect(confOf('exact', [{ quality: 'Primary' }])).toBe('Proven'));
  it('about date + Primary is Probable', () => expect(confOf('about', [{ quality: 'Primary' }])).toBe('Probable'));
  it('exact + Secondary only is Probable', () => expect(confOf('exact', [{ quality: 'Secondary' }])).toBe('Probable'));
  it('manual override wins', () => expect(confOf('exact', [], 'Proven')).toBe('Proven'));
});

describe('dates', () => {
  it('reads years and labels', () => {
    expect(yearOf('12 Feb 1858')).toBe(1858);
    expect(dateLabel({ date: '1890', q: 'about', date2: '' })).toBe('abt 1890');
    expect(dateLabel({ date: '1890', q: 'between', date2: '1892' })).toBe('bet 1890 and 1892');
    expect(fullDate('4 Aug 1931')).toEqual({ day: 4, month: 7, year: 1931 });
    expect(normaliseDate('14 march 1890')).toBe('14 Mar 1890');
  });
  it('converts GEDCOM dates both ways', () => {
    expect(fromGedcomDate('ABT 12 FEB 1858')).toEqual({ date: '12 Feb 1858', q: 'about', date2: '', ok: true });
    expect(fromGedcomDate('BET 1890 AND 1892')).toMatchObject({ date: '1890', q: 'between', date2: '1892' });
    expect(fromGedcomDate('Spring 1902').ok).toBe(false);
    expect(toGedcomDate('12 Feb 1858', 'before')).toBe('BEF 12 FEB 1858');
    expect(toGedcomDate('Spring 1902', 'exact')).toBe('(Spring 1902)');
  });
});

describe('sample tree', () => {
  const T = treeApi(sampleTree());
  it('has the Pascoes', () => {
    expect(T.data.people).toHaveLength(30);
    expect(T.nm('p1')).toBe('John Trelawny Pascoe');
    expect(T.children('p1')).toEqual(['p5', 'p7', 'p9', 'p10']);
    expect(T.rootId).toBe('p1');
    expect(T.generations()).toBe(4);
  });
  it('computes evidence', () => {
    expect(T.conf(T.ff('p9', 'Birth')!)).toBe('Unverified');
    expect(T.conf(T.ff('p1', 'Birth')!)).toBe('Proven');
    expect(T.conf(T.ff('p3', 'Birth')!)).toBe('Probable');
  });
  it('names branches like the prototype', () => {
    expect(T.branch('p1').label).toBe('Founders');
    expect(T.branch('p12').label).toMatch(/^William’s line · Cairns/);
    expect(T.branch('p3').label).toBe('O’Rourke family');
  });
  it('lays out the tree', () => {
    const d = layDesc(T, 'p1', 6, { w: 228, h: 96 });
    expect(d.nodes.length).toBe(28); // everyone except the O'Rourke grandparents
    const p = layPed(T, 'p22', 4, { w: 228, h: 96 });
    expect(p.nodes.filter((n) => n.pid).map((n) => n.pid)).toContain('p3');
  });
  it('searches Cairns into people, places and sources', () => {
    const g = searchTree(T, 'Cairns');
    expect(g.map((x) => x.label)).toEqual(['People', 'Places', 'Sources', 'Media']);
  });
});

import { checkPassword, makeVerifier } from '../lib/password';
describe('app password', () => {
  it('verifies the right password only', async () => {
    const v = await makeVerifier('correct horse', 1000);
    expect(await checkPassword('correct horse', v)).toBe(true);
    expect(await checkPassword('Correct horse', v)).toBe(false);
    expect(v.hash).not.toContain('correct');
  });
});

import { monthGrid, parseForCalendar } from '../components/DateInput';
describe('date picker', () => {
  it('opens on the typed date, month or year', () => {
    expect(parseForCalendar('12 Feb 1858')).toEqual({ y: 1858, m: 1, d: 12 });
    expect(parseForCalendar('Aug 1885')).toEqual({ y: 1885, m: 7, d: null });
    expect(parseForCalendar('abt 1890')).toEqual({ y: 1890, m: 0, d: null });
  });
  it('lays out months starting on Monday', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g.slice(0, 4)).toEqual([null, null, null, 1]);
    expect(g.filter(Boolean)).toHaveLength(31);
    expect(g.length % 7).toBe(0);
  });
});

import { aboutYouProblem, makeSelfTree, validEmail } from '../lib/accounts';
describe('sign-up tree', () => {
  let n = 0;
  const id = () => 'id' + ++n;
  const about = { given: 'Peter John', surname: 'Pascoe', sex: 'M' as const, birthDate: '17 Oct 1946', birthPlace: 'Cairns, Queensland', father: { given: 'Jack', surname: 'Pascoe', living: false }, mother: { given: 'Joan', surname: 'Ellis', living: false } };
  it('checks the details', () => {
    expect(aboutYouProblem({ ...about, birthDate: '1946' })).toBe('Choose your full date of birth.');
    expect(aboutYouProblem(about)).toBe('');
    expect(validEmail('casey@example.com')).toBe(true);
    expect(validEmail('casey@')).toBe(false);
  });
  it('starts the tree with you, verified, and your parents', () => {
    const { data, selfId } = makeSelfTree(about, 'peter@example.com', id);
    const T = treeApi(data);
    expect(data.settings.tree_name).toBe('Pascoe Family Tree');
    expect(T.person[selfId].living).toBe(true);
    const birth = T.ff(selfId, 'Birth')!;
    expect(T.conf(birth)).toBe('Proven');
    expect(T.cite[birth.citeIds[0]].quality).toBe('Primary');
    expect(T.parents(selfId)).toHaveLength(2);
    expect(T.spouses(T.parents(selfId)[0])).toHaveLength(1);
    expect(T.rootId).not.toBe(selfId); // the family view starts from the oldest generation
    expect(T.placeName(birth.placeId)).toBe('Cairns, Queensland');
  });
});

import { newDataKey, newRecoveryCode, normRecoveryCode, unwrapKey, wrapKey } from '../lib/accounts';
describe('account keys', () => {
  it('locks the data key with the password and the recovery code', async () => {
    const key = newDataKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    const code = newRecoveryCode();
    expect(code).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    const byPw = await wrapKey(key, 'Pascoe1885!', 1000);
    const byCode = await wrapKey(key, code, 1000);
    expect(JSON.stringify(byPw)).not.toContain(key);
    expect(await unwrapKey(byPw, 'Pascoe1885!')).toBe(key);
    expect(await unwrapKey(byPw, 'pascoe1885!')).toBeNull();
    expect(await unwrapKey(byCode, normRecoveryCode(code.toLowerCase().replace(/-/g, ' ')))).toBe(key);
  });
  it('adds where you live now as a verified residence', () => {
    let n = 0;
    const { data, selfId } = makeSelfTree({ given: 'Casey', surname: 'Pascoe', sex: 'U', birthDate: '1 Jan 1980', birthPlace: 'Cairns', livesIn: 'Brisbane, Queensland' }, 'c@example.com', () => 'x' + ++n);
    const T = treeApi(data);
    const res = T.ff(selfId, 'Residence')!;
    expect(T.placeName(res.placeId)).toBe('Brisbane, Queensland');
    expect(T.conf(res)).toBe('Proven');
  });
});
