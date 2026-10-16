import { describe, expect, it } from 'vitest';
import { treeApi } from '../lib/family';
import { relationship, titlePhrase, titlesFrom } from '../lib/kinship';
import { emptyTree, type Person, type Sex, type TreeData } from '../lib/types';
import { sampleTree } from '../lib/sample';

/** A made-up family, five generations deep. */
function family(): TreeData {
  const d = emptyTree();
  const P = (id: string, sex: Sex) =>
    d.people.push({
      id,
      given: id,
      surname: 'X',
      sex,
      living: true,
      photoMediaId: null,
      photoCrop: null,
      coverMediaId: null,
      profileId: id,
      accountEmail: '',
      avatar: '',
      privacy: 'Private',
      notes: '',
      updatedAt: '',
    } as Person);
  const kid = (parent: string, child: string) => d.rels.push({ id: parent + '>' + child, type: 'parent', a: parent, b: child, start: '', end: '' });
  const wed = (a: string, b: string) => d.rels.push({ id: a + '+' + b, type: 'spouse', a, b, start: '', end: '' });
  // great-grandparents GG (m) & GGm (f)
  [
    'GG:M',
    'GGm:F',
    'G:M',
    'Gm:F',
    'Gaunt:F',
    'Dad:M',
    'Mum:F',
    'Unc:M',
    'Me:F',
    'Bro:M',
    'Half:F',
    'Cous:M',
    'Cous2:F',
    'Neph:M',
    'Niece:F',
    'Kid:F',
    'Grandkid:M',
    'Cous1r:F',
    'Wife:F',
    'Hub:M',
    'HubMum:F',
    'HubSis:F',
    'BroWife:F',
    'StepMum:F',
    'Other:M',
    'UncWife:F',
    'Second:M',
    'GreatGG:M',
  ].forEach((x) => {
    const [id, s] = x.split(':');
    P(id, s as Sex);
  });
  kid('GreatGG', 'GG');
  kid('GG', 'G');
  kid('GGm', 'G');
  kid('GG', 'Gaunt');
  kid('GGm', 'Gaunt');
  kid('G', 'Dad');
  kid('Gm', 'Dad');
  kid('G', 'Unc');
  kid('Gm', 'Unc');
  kid('Dad', 'Me');
  kid('Mum', 'Me');
  kid('Dad', 'Bro');
  kid('Mum', 'Bro');
  kid('Dad', 'Half');
  kid('StepMum', 'Half');
  kid('Unc', 'Cous');
  kid('Bro', 'Neph');
  kid('Bro', 'Niece');
  kid('Me', 'Kid');
  kid('Kid', 'Grandkid');
  kid('Cous', 'Cous1r');
  kid('Gaunt', 'Other');
  kid('Other', 'Second');
  wed('Me', 'Hub');
  kid('HubMum', 'Hub');
  kid('HubMum', 'HubSis');
  wed('Bro', 'BroWife');
  wed('Dad', 'StepMum');
  wed('Unc', 'UncWife');
  return d;
}

describe('family titles', () => {
  const T = treeApi(family());
  const t = (b: string) => relationship(T, 'Me', b)?.title;
  it('works out direct ancestors and descendants', () => {
    expect(t('Dad')).toBe('Father');
    expect(t('Mum')).toBe('Mother');
    expect(t('G')).toBe('Grandfather');
    expect(t('GG')).toBe('Great-grandfather');
    expect(t('GreatGG')).toBe('Great-great-grandfather');
    expect(t('Kid')).toBe('Daughter');
    expect(t('Grandkid')).toBe('Grandson');
  });
  it('works out siblings, half-siblings, aunties, uncles, nieces and nephews', () => {
    expect(t('Bro')).toBe('Brother');
    expect(t('Half')).toBe('Half-sister');
    expect(t('Unc')).toBe('Uncle');
    expect(t('Gaunt')).toBe('Great-aunty');
    expect(t('Neph')).toBe('Nephew');
    expect(t('Niece')).toBe('Niece');
  });
  it('works out cousins, degrees and removals', () => {
    expect(t('Cous')).toBe('Cousin');
    expect(t('Cous1r')).toBe('Cousin once removed');
    expect(t('Other')).toBe('Cousin once removed'); // Dad's cousin
    expect(t('Second')).toBe('2nd cousin');
    expect(relationship(T, 'Grandkid', 'Second')?.title).toBe('2nd cousin twice removed');
    expect(relationship(T, 'Cous1r', 'Second')?.title).toBe('3rd cousin'.replace('3rd', '2nd') + ' once removed');
  });
  it('works out partners, in-laws and step relations', () => {
    expect(t('Hub')).toBe('Husband');
    expect(t('HubMum')).toBe('Mother-in-law');
    expect(t('HubSis')).toBe('Sister-in-law');
    expect(t('BroWife')).toBe('Sister-in-law');
    expect(t('StepMum')).toBe('Stepmother');
    expect(t('UncWife')).toBe('Aunty (by marriage)');
    expect(relationship(T, 'Hub', 'Kid')?.title).toBe('Daughter'.replace('Daughter', 'Stepdaughter'));
    expect(relationship(T, 'Mum', 'Hub')?.title).toBe('Son-in-law');
  });
  it('phrases it for the profile, and leaves unrelated people blank', () => {
    const d = family();
    d.settings.self_person = 'Me';
    d.people.push({ ...d.people[0], id: 'Stranger' });
    const T2 = treeApi(d);
    expect(titlePhrase(T2, 'Unc')).toBe('Your uncle');
    expect(titlePhrase(T2, 'Me')).toBe('You');
    expect(titlePhrase(T2, 'Stranger')).toBe('');
    expect(titlesFrom(T2, 'Me').get('Second')?.title).toBe('2nd cousin');
  });
  it('labels everyone in the sample tree relative to the home person', () => {
    const T3 = treeApi(sampleTree());
    const all = titlesFrom(T3, T3.rootId);
    expect([...all.values()].filter(Boolean).length).toBe(T3.data.people.length);
  });
});
