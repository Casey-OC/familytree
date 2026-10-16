import { describe, expect, it } from 'vitest';
import { ageBetween, ageLabel } from '../lib/ages';
import { timeline, storyPreview } from '../lib/stories';
import { treeApi } from '../lib/family';
import { sampleTree } from '../lib/sample';
import { mergeInto } from '../lib/merge';
import { newSqlJsDb } from '../data/sqljsDb';
import { migrate } from '../data/db';
import { loadTree, SqlLog } from '../data/repo';
import type { Fact, Story, TreeData } from '../lib/types';

const fact = (date: string, type = 'Death', q: Fact['q'] = 'exact') => ({ type, date, q }) as Fact;

describe('ages at events', () => {
  it('works out exact ages from full dates', () => {
    expect(ageBetween('12 Jul 1980', '11 Jul 2014')).toEqual({ years: 33, approx: false });
    expect(ageBetween('12 Jul 1980', '12 Jul 2014')).toEqual({ years: 34, approx: false });
    expect(ageBetween('12 Jul 1980', '3 Oct 1980')).toEqual({ years: 0, months: 2, approx: false });
  });
  it('says "about" when a date is only a year or is approximate', () => {
    expect(ageLabel(fact('1890', 'Birth'), fact('1950'))).toBe('aged about 60');
    expect(ageLabel(fact('12 Jul 1890', 'Birth', 'about'), fact('3 Mar 1950'))).toBe('aged about 59');
    expect(ageLabel(fact('Aug 1885', 'Birth'), fact('Mar 1900'))).toBe('aged 14');
  });
  it('shows nothing for the birth itself, without a birth date, or before birth', () => {
    expect(ageLabel(fact('1890', 'Birth'), fact('1890', 'Birth'))).toBe('');
    expect(ageLabel(undefined, fact('1950'))).toBe('');
    expect(ageLabel(fact('1890', 'Birth'), fact('1880'))).toBe('');
  });
  it('is available for every event in the family API', () => {
    const T = treeApi(sampleTree());
    const death = T.ff('p12', 'Death')!;
    expect(T.ageAt('p12', death)).toMatch(/^aged (about )?\d+$/);
  });
});

function withStories(): TreeData {
  const d = sampleTree();
  const marriage = d.facts.find((f) => f.personId === 'p12' && f.type === 'Marriage') || d.facts.find((f) => f.personId === 'p12' && f.type === 'Death')!;
  const base = { q: 'exact' as const, date2: '', ageAt: null, body: 'Text', placeId: '', author: 'Casey', authorEmail: 'casey@example.com', mediaIds: [], createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' };
  const stories: Story[] = [
    { ...base, id: 's1', title: 'Cane season', date: '1935', sortYear: 1935, factId: '', people: { p12: 'shown', p13: 'pending' } },
    { ...base, id: 's2', title: 'About the event', date: '', sortYear: null, factId: marriage.id, people: { p12: 'shown' } },
    { ...base, id: 's3', title: 'Undated', date: '', sortYear: null, factId: '', people: { p12: 'shown' } },
    { ...base, id: 's4', title: 'Hidden one', date: '1950', sortYear: 1950, factId: '', people: { p12: 'hidden' } },
  ];
  d.stories = stories;
  return d;
}

describe('life stories in the timeline', () => {
  it('places stories by event, by year, and undated ones last', () => {
    const d = withStories();
    const T = treeApi(d);
    const items = timeline(T, d, 'p12');
    const ids = items.map((i) => (i.kind === 'fact' ? i.fact.type : 'story:' + i.story.id));
    expect(ids).not.toContain('story:s4'); // hidden stories stay off the timeline
    expect(ids[ids.length - 1]).toBe('story:s3');
    const ev = items.findIndex((i) => i.kind === 'fact' && i.fact.id === d.stories[1].factId);
    expect(ids[ev + 1]).toBe('story:s2');
    // the 1935 story sits after events up to 1935 and before later ones
    const at = ids.indexOf('story:s1');
    const years = items.map((i) => i.year);
    expect(items.slice(0, at).every((i) => i.year === null || i.year <= 1935)).toBe(true);
    expect(years.slice(at + 1).some((y) => y !== null && y > 1935)).toBe(true);
    // the pending story is not on the other person's timeline yet
    expect(timeline(T, d, 'p13').some((i) => i.kind === 'story')).toBe(false);
  });
  it('previews long stories without cutting words in half', () => {
    const p = storyPreview('word '.repeat(100), 50);
    expect(p.more).toBe(true);
    expect(p.text.endsWith('word…')).toBe(true);
  });
  it('saves and loads stories and home places', async () => {
    const db = await newSqlJsDb();
    await migrate(db);
    const d = withStories();
    const birth = d.facts.find((f) => f.personId === 'p12' && f.type === 'Birth')!;
    birth.homePlaceId = d.places[0].id;
    d.stories[0].mediaIds = ['m13', 'm9'];
    const sql = new SqlLog(false);
    sql.all(d);
    await db.batch(sql.stmts);
    const back = await loadTree(db);
    expect(back.stories).toHaveLength(4);
    expect(back.stories.find((s) => s.id === 's1')).toMatchObject({ title: 'Cane season', people: { p12: 'shown', p13: 'pending' }, mediaIds: ['m13', 'm9'] });
    expect(back.stories.find((s) => s.id === 's2')!.factId).toBe(d.stories[1].factId);
    expect(back.facts.find((f) => f.id === birth.id)!.homePlaceId).toBe(d.places[0].id);
  });
  it('moves stories across when two people are merged', () => {
    const d = withStories();
    const jack = d.people.find((p) => p.id === 'p12')!;
    d.people.push({ ...jack, id: 'dup', profileId: 'dup' });
    d.stories.push({ ...d.stories[0], id: 's5', title: 'On the duplicate', people: { dup: 'shown' } });
    const r = mergeInto(d, 'p12', 'dup');
    expect(d.stories.find((s) => s.id === 's5')!.people).toEqual({ p12: 'shown' });
    expect(r.changedStories).toContain('s5');
  });
});

import { dateFromAge, storyWhen } from '../lib/stories';
describe('story dates by age and approximate dates', () => {
  it('works out the year from an age', () => {
    expect(dateFromAge({ date: '12 Jul 1980', q: 'exact' }, 5)).toEqual({ date: '1985', q: 'between', date2: '1986' });
    expect(dateFromAge({ date: '1 Jan 1980', q: 'exact' }, 5)).toEqual({ date: '1985', q: 'exact', date2: '' });
    expect(dateFromAge({ date: '1980', q: 'exact' }, 5)).toEqual({ date: '1985', q: 'about', date2: '' });
    expect(dateFromAge({ date: '12 Jul 1980', q: 'about' }, 30)).toEqual({ date: '2010', q: 'about', date2: '' });
    expect(dateFromAge(undefined, 5)).toBeNull();
  });
  it('describes story dates in plain words', () => {
    expect(storyWhen({ date: '1985', q: 'between', date2: '1986', ageAt: 5 })).toBe('At 5 years old (1985–1986)');
    expect(storyWhen({ date: '1985', q: 'about', date2: '', ageAt: 1 })).toBe('At 1 year old (about 1985)');
    expect(storyWhen({ date: '1962', q: 'about', date2: '', ageAt: null })).toBe('About 1962');
    expect(storyWhen({ date: '1962', q: 'before', date2: '', ageAt: null })).toBe('Before 1962');
    expect(storyWhen({ date: 'Mar 1962', q: 'between', date2: 'Jun 1962', ageAt: null })).toBe('Between Mar 1962 and Jun 1962');
    expect(storyWhen({ date: '14 Mar 1962', q: 'exact', date2: '', ageAt: null })).toBe('14 Mar 1962');
  });
});
