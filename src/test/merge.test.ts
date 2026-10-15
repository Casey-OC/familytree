import { describe, expect, it } from 'vitest';
import { findDuplicatePeople, matchesForNew, mergeInto, mergeProblem, notDuplicateKey, sameFirstName } from '../lib/merge';
import { sampleTree } from '../lib/sample';
import { treeApi } from '../lib/family';
import type { Person, TreeData } from '../lib/types';

/** The sample tree plus a second record for Jack Pascoe (p12), as if entered twice. */
function withDuplicate(): TreeData {
  const d = sampleTree();
  const jack = d.people.find((p) => p.id === 'p12')!;
  const dup: Person = { ...jack, id: 'dup', profileId: 'dup', given: 'Jack', notes: 'From Aunty Joan’s notes', photoMediaId: null, avatar: '' };
  d.people.push(dup);
  const birth = d.facts.find((f) => f.personId === 'p12' && f.type === 'Birth')!;
  d.facts.push({ ...birth, id: 'dupBirth', personId: 'dup', date: '14 Mar ' + birth.date.slice(-4), citeIds: ['dupCite'] });
  d.cites.push({ id: 'dupCite', sourceId: d.sources[0].id, page: 'p. 9', accessed: '', quality: 'Primary', extract: '' });
  d.facts.push({
    id: 'dupOcc',
    personId: 'dup',
    type: 'Occupation',
    date: '1950',
    q: 'exact',
    date2: '',
    sortYear: 1950,
    placeId: '',
    desc: 'Cane cutter',
    conf: 'auto',
    citeIds: [],
  });
  // the duplicate is linked to Jack's mother (already Jack's parent) and has a photo tag
  const mum = d.rels.find((r) => r.type === 'parent' && r.b === 'p12')!.a;
  d.rels.push({ id: 'dupRel', type: 'parent', a: mum, b: 'dup', start: '', end: '' });
  d.media.find((m) => m.id === 'm3')!.faces.push({ personId: 'dup', x: 50, y: 50 });
  d.media.find((m) => m.id === 'm13')!.faces.push({ personId: 'dup', x: 10, y: 10 });
  d.tasks.push({ id: 'dupTask', title: 'Check', personId: 'dup', factId: 'dupBirth', status: 'To do', priority: 'Low', notes: '', createdAt: '' });
  return d;
}

describe('finding duplicates', () => {
  it('matches nicknames and initials', () => {
    const p = (given: string) => ({ given }) as Person;
    expect(sameFirstName(p('Jack William'), p('John'))).toBe(true);
    expect(sameFirstName(p('Bill'), p('William Henry'))).toBe(true);
    expect(sameFirstName(p('J.'), p('John'))).toBe(true);
    expect(sameFirstName(p('Mary'), p('Margaret'))).toBe(false);
  });
  it('finds the person entered twice, and nobody else in the sample tree', () => {
    expect(findDuplicatePeople(sampleTree())).toEqual([]);
    const pairs = findDuplicatePeople(withDuplicate());
    expect(pairs).toHaveLength(1);
    expect(new Set([pairs[0].a, pairs[0].b])).toEqual(new Set(['p12', 'dup']));
    expect(pairs[0].score).toBeGreaterThanOrEqual(80);
    expect(pairs[0].reasons.join(' ')).toMatch(/Same parent names/);
  });
  it('remembers “not the same person”', () => {
    const d = withDuplicate();
    d.settings.not_duplicates = JSON.stringify([notDuplicateKey('dup', 'p12')]);
    expect(findDuplicatePeople(d)).toEqual([]);
  });
  it('warns when adding someone who is already there', () => {
    const d = sampleTree();
    const y = treeApi({ ...d }).birthYear('p12');
    expect(matchesForNew(d, 'Jack', 'Pascoe', y)).toContain('p12');
    expect(matchesForNew(d, 'Jack', 'Pascoe', y + 30)).not.toContain('p12');
    expect(matchesForNew(d, 'Zed', 'Pascoe')).toEqual([]);
  });
});

describe('merging two people', () => {
  it('moves everything to one profile and combines matching facts with all their sources', () => {
    const d = withDuplicate();
    const before = d.people.length;
    const r = mergeInto(d, 'p12', 'dup');
    const T = treeApi({ ...d });
    expect(d.people).toHaveLength(before - 1);
    expect(T.person.dup).toBeUndefined();
    const births = T.factsOf('p12').filter((f) => f.type === 'Birth');
    expect(births).toHaveLength(1);
    expect(births[0].citeIds).toContain('dupCite');
    expect(births[0].date).toMatch(/^14 Mar /); // the more precise date wins
    expect(T.factsOf('p12').some((f) => f.type === 'Occupation' && f.desc === 'Cane cutter')).toBe(true);
    expect(r.movedFacts).toBe(1);
    expect(r.removedFacts).toEqual(['dupBirth']);
    // no duplicate parent link, nothing left pointing at the old record
    expect(d.rels.filter((x) => x.b === 'p12' && x.type === 'parent')).toHaveLength(2);
    expect(JSON.stringify(d)).not.toMatch(/"dup"/);
    // photo tags: moved, and only one tag per photo
    expect(d.media.find((m) => m.id === 'm3')!.faces.some((f) => f.personId === 'p12')).toBe(true);
    expect(d.media.find((m) => m.id === 'm13')!.faces.filter((f) => f.personId === 'p12')).toHaveLength(1);
    expect(d.tasks.find((t) => t.id === 'dupTask')).toMatchObject({ personId: 'p12', factId: births[0].id });
    expect(T.person.p12.notes).toContain('Aunty Joan');
    expect(JSON.parse(d.settings.merged_profiles)).toEqual({ dup: 'p12' });
  });
  it('lets you choose which name to keep', () => {
    const d = withDuplicate();
    mergeInto(d, 'p12', 'dup', { given: 'other' });
    expect(treeApi({ ...d }).person.p12.given).toBe('Jack');
  });
  it('keeps a disagreeing birth year as a note', () => {
    const d = withDuplicate();
    d.facts.find((f) => f.id === 'dupBirth')!.date = '1999';
    mergeInto(d, 'p12', 'dup');
    expect(treeApi({ ...d }).person.p12.notes).toMatch(/another record gave birth as 1999/);
  });
  it('never merges two account holders or a parent with their child', () => {
    const d = withDuplicate();
    d.people.find((p) => p.id === 'p12')!.accountEmail = 'a@x.com';
    d.people.find((p) => p.id === 'dup')!.accountEmail = 'b@x.com';
    expect(mergeProblem(d, 'p12', 'dup')).toMatch(/own accounts/);
    const s = sampleTree();
    expect(mergeProblem(s, 'p5', 'p12')).toMatch(/parent/);
    expect(mergeProblem(withDuplicate(), 'p12', 'dup')).toBe('');
  });
  it('points the home person at the kept record', () => {
    const d = withDuplicate();
    d.settings.home_person = 'dup';
    const r = mergeInto(d, 'p12', 'dup');
    expect(d.settings.home_person).toBe('p12');
    expect(r.changedSettings).toContain('home_person');
  });
});
