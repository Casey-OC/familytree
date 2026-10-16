// "Open sample tree": the Pascoes, from Cornwall to Queensland in 1885.
// Ported from sample() in docs/prototype/Main.dc.html.

import { yearOf } from './dates';
import type { Citation, Fact, Hint, Media, Person, Place, Quality, Qualifier, Recipe, Relationship, Source, Task, TreeData } from './types';

export const SAMPLE_TREE_NAME = 'Pascoe Family Tree';

export function sampleTree(): TreeData {
  const now = new Date().toISOString();
  const places: Place[] = [
    { id: 'stjust', name: 'St Just, Cornwall', hist: 'St Just in Penwith, Cornwall, England', lat: 50.125, lon: -5.68 },
    { id: 'redruth', name: 'Redruth, Cornwall', hist: 'Redruth, Cornwall, England', lat: 50.233, lon: -5.226 },
    { id: 'liverpool', name: 'Liverpool, England', hist: 'Liverpool, Lancashire, England', lat: 53.41, lon: -2.99 },
    { id: 'ennis', name: 'Ennis, County Clare', hist: 'Ennis, Co. Clare, Ireland (UK of Great Britain and Ireland)', lat: 52.84, lon: -8.98 },
    { id: 'ypres', name: 'Ypres, Belgium', hist: 'Ypres (Ieper), West Flanders, Belgium', lat: 50.85, lon: 2.88 },
    { id: 'brisbane', name: 'Brisbane, Queensland', hist: 'Brisbane, Colony of Queensland', lat: -27.47, lon: 153.03 },
    { id: 'toowoomba', name: 'Toowoomba, Queensland', hist: 'Toowoomba, Colony of Queensland', lat: -27.56, lon: 151.95 },
    { id: 'cairns', name: 'Cairns, Queensland', hist: 'Cairns, Colony of Queensland', lat: -16.92, lon: 145.77 },
    { id: 'cooktown', name: 'Cooktown, Queensland', hist: 'Cooktown, Colony of Queensland', lat: -15.47, lon: 145.25 },
    { id: 'sydney', name: 'Sydney, New South Wales', hist: 'Sydney, Colony of New South Wales', lat: -33.87, lon: 151.21 },
    { id: 'wewak', name: 'Wewak, New Guinea', hist: 'Wewak, Territory of New Guinea', lat: -3.55, lon: 143.63 },
  ];

  const people: Person[] = [];
  const P = (id: string, given: string, surname: string, sex: 'M' | 'F', living: number, photo: number, tone = '') =>
    people.push({
      id,
      given,
      surname,
      sex,
      living: !!living,
      photoMediaId: null,
      photoCrop: null,
      coverMediaId: null,
      profileId: id,
      accountEmail: '',
      avatar: photo ? ('photo ' + tone).trim() : '',
      privacy: living ? 'Private' : 'Shared',
      notes: '',
      updatedAt: now,
    });
  P('p1', 'John Trelawny', 'Pascoe', 'M', 0, 1); P('p2', 'Elizabeth Ann', 'Rowe', 'F', 0, 1); P('p3', 'Patrick', 'O’Rourke', 'M', 0, 0); P('p4', 'Bridget', 'Hanlon', 'F', 0, 0);
  P('p5', 'William Henry', 'Pascoe', 'M', 0, 1); P('p6', 'Mary Kathleen', 'O’Rourke', 'F', 0, 1); P('p7', 'Edith Jane', 'Pascoe', 'F', 0, 1); P('p8', 'Arthur Lionel', 'Bates', 'M', 0, 1, 't2');
  P('p9', 'Thomas Richard', 'Pascoe', 'M', 0, 1, 't2'); P('p10', 'Florence May', 'Pascoe', 'F', 0, 1); P('p11', 'George Albert', 'Hartley', 'M', 0, 1, 't2');
  P('p12', 'Jack William', 'Pascoe', 'M', 0, 1, 't2'); P('p13', 'Joan', 'Ellis', 'F', 0, 1); P('p14', 'Margaret Rose', 'Pascoe', 'F', 0, 1); P('p15', 'Leonard', 'Cho', 'M', 0, 1, 't2');
  P('p16', 'Ronald Arthur', 'Bates', 'M', 0, 1); P('p17', 'Phyllis', 'Grant', 'F', 0, 0); P('p18', 'Nancy', 'Bates', 'F', 0, 0); P('p19', 'Dorothy', 'Hartley', 'F', 0, 1, 't2'); P('p20', 'Keith', 'Morgan', 'M', 0, 0); P('p21', 'Albert', 'Hartley', 'M', 0, 1);
  P('p22', 'Peter John', 'Pascoe', 'M', 1, 1); P('p23', 'Karen', 'Walsh', 'F', 1, 0); P('p24', 'Susan', 'Pascoe', 'F', 1, 1, 't2'); P('p25', 'David', 'Kerr', 'M', 1, 0);
  P('p26', 'Helen', 'Cho', 'F', 1, 1); P('p27', 'Graham', 'Bates', 'M', 0, 0); P('p28', 'Lynette', 'Bates', 'F', 1, 1, 't2'); P('p29', 'Robyn', 'Morgan', 'F', 1, 0); P('p30', 'Ian', 'Morgan', 'M', 1, 0);
  const pm: Record<string, Person> = {};
  people.forEach((p) => (pm[p.id] = p));
  pm.p1.notes = 'Tin miner from St Just. Came out under the Queensland assisted passage scheme after the Cornish mines began closing. Worked at the Toowoomba railway workshops for over thirty years.';
  pm.p9.notes = 'Family story says Thomas was born at the Russell Street house, but no registration has been found yet. Check St Luke’s baptisms.';
  pm.p6.notes = 'Arrived in Cairns as a child with her parents. Birthplace needs confirming — family say County Clare.';
  const nm = (id: string) => pm[id].given.split(' ')[0] + ' ' + pm[id].surname;

  const rels: Relationship[] = [];
  let rn = 0;
  const S = (a: string, b: string, start: string) => rels.push({ id: 'r' + ++rn, type: 'spouse', a, b, start, end: '' });
  const C = (ps: string[], kids: string[]) =>
    kids.forEach((k) => ps.forEach((p) => rels.push({ id: 'r' + ++rn, type: 'parent', a: p, b: k, start: '', end: '' })));
  S('p1', 'p2', '1884'); S('p3', 'p4', '1886'); S('p5', 'p6', '1914'); S('p7', 'p8', '1910'); S('p10', 'p11', '1919'); S('p12', 'p13', '1944'); S('p14', 'p15', '1947'); S('p16', 'p17', '1938'); S('p19', 'p20', '1946'); S('p22', 'p23', '1972'); S('p24', 'p25', '1973');
  C(['p1', 'p2'], ['p5', 'p7', 'p9', 'p10']); C(['p3', 'p4'], ['p6']); C(['p5', 'p6'], ['p12', 'p14']); C(['p7', 'p8'], ['p16', 'p18']); C(['p10', 'p11'], ['p19', 'p21']); C(['p12', 'p13'], ['p22', 'p24']); C(['p14', 'p15'], ['p26']); C(['p16', 'p17'], ['p27', 'p28']); C(['p19', 'p20'], ['p29', 'p30']);

  const sources: Source[] = [
    { id: 's1', title: 'Passenger list, RMS Carnmarth, Liverpool to Brisbane, 1885', type: 'Shipping record', repo: 'Queensland State Archives', url: 'https://www.archives.qld.gov.au/' },
    { id: 's2', title: 'Queensland Birth Registrations, 1856–1960', type: 'Certificate', repo: 'Qld Registry of Births, Deaths and Marriages', url: 'https://www.familyhistory.bdm.qld.gov.au/' },
    { id: 's3', title: 'Queensland Death Registrations, 1856–2010', type: 'Certificate', repo: 'Qld Registry of Births, Deaths and Marriages', url: 'https://www.familyhistory.bdm.qld.gov.au/' },
    { id: 's4', title: 'Queensland Marriage Registrations, 1856–1975', type: 'Certificate', repo: 'Qld Registry of Births, Deaths and Marriages', url: 'https://www.familyhistory.bdm.qld.gov.au/' },
    { id: 's5', title: '1881 England Census — Redruth, Cornwall', type: 'Census', repo: 'The National Archives (UK)', url: 'https://www.nationalarchives.gov.uk/' },
    { id: 's6', title: 'Parish registers, St Euny Redruth and St Just — baptisms and marriages', type: 'Parish register', repo: 'Kresen Kernow, Redruth', url: '' },
    { id: 's7', title: 'The Toowoomba Chronicle — family notices', type: 'Newspaper', repo: 'Trove, National Library of Australia', url: 'https://trove.nla.gov.au/' },
    { id: 's8', title: 'Cairns Post — wedding notice, Pascoe–O’Rourke, 1914', type: 'Newspaper', repo: 'Trove, National Library of Australia', url: 'https://trove.nla.gov.au/' },
    { id: 's9', title: 'Letter from Elizabeth Pascoe to her sister Grace, 1886', type: 'Family letter', repo: 'Pascoe family collection', url: '' },
    { id: 's10', title: 'NSW Births, Deaths and Marriages index', type: 'Certificate', repo: 'NSW Registry of Births, Deaths and Marriages', url: 'https://www.nsw.gov.au/family-history' },
    { id: 's11', title: 'AIF service record — Thomas Richard Pascoe', type: 'Military record', repo: 'National Archives of Australia', url: 'https://www.naa.gov.au/' },
    { id: 's12', title: 'Queensland electoral rolls, 1903–1980', type: 'Electoral roll', repo: 'Ancestry (online database)', url: '' },
    { id: 's13', title: 'Oral history interview with Margaret Cho, 1987', type: 'Oral history', repo: 'Pascoe family collection', url: '' },
    { id: 's14', title: 'Irish civil registration — Ennis district', type: 'Civil register', repo: 'FamilySearch (online database)', url: '' },
    { id: 's15', title: 'Family address book and personal knowledge', type: 'Personal knowledge', repo: 'Tree owner', url: '' },
  ];
  const srcMedia: Record<string, string[]> = { s1: ['m3', 'm21'], s6: ['m1'], s7: ['m23'], s8: ['m5'], s9: ['m22'], s11: ['m6'], s13: ['m24'] };

  const cites: Citation[] = [];
  const facts: Fact[] = [];
  let fn = 0;
  let cn = 0;
  const F = (
    pid: string,
    type: string,
    date: string,
    place: string,
    desc: string,
    src: string | string[] | null,
    qual?: Quality | null,
    q?: Qualifier,
    page?: string,
  ) => {
    const f: Fact = { id: 'f' + ++fn, personId: pid, type, q: q || 'exact', date, date2: '', sortYear: yearOf(date), placeId: place || '', homePlaceId: '', desc: desc || '', citeIds: [], conf: 'auto' };
    (src ? (Array.isArray(src) ? src : [src]) : []).forEach((s) => {
      const c: Citation = { id: 'c' + ++cn, sourceId: s, page: page || 'Entry ' + (1000 + ((cn * 7919) % 8000)), accessed: '2 Mar 2024', quality: qual || 'Primary', extract: '' };
      cites.push(c);
      f.citeIds.push(c.id);
    });
    facts.push(f);
    return f;
  };
  const M = (a: string, b: string, date: string, place: string, src: string | string[], qual: Quality) => {
    F(a, 'Marriage', date, place, 'Married ' + nm(b), src, qual);
    F(b, 'Marriage', date, place, 'Married ' + nm(a), src, qual);
  };
  F('p1', 'Birth', '12 Feb 1858', 'stjust', 'Baptised at St Just parish church', 's6', 'Primary', 'exact', 'Baptisms 1858, no. 41');
  F('p1', 'Occupation', '1881', 'redruth', 'Tin miner, Wheal Uny', 's5', 'Primary', 'exact', 'RG11/2318, folio 40');
  M('p1', 'p2', '14 Jun 1884', 'redruth', 's6', 'Primary');
  F('p1', 'Emigration', '12 Jun 1885', 'liverpool', 'Departed Liverpool aboard RMS Carnmarth, assisted passage', 's1', 'Primary', 'exact', 'Folio 7, line 22');
  F('p1', 'Arrival', '9 Sep 1885', 'brisbane', 'Arrived Brisbane with wife Elizabeth', 's1', 'Primary', 'exact', 'Folio 7, line 22');
  F('p1', 'Residence', '1903', 'toowoomba', 'Railway workshops fitter, James Street', 's12', 'Secondary');
  F('p1', 'Death', '4 Aug 1931', 'toowoomba', 'Died at home, aged 73', ['s3', 's7'], 'Primary');
  F('p2', 'Birth', '23 May 1861', 'redruth', '', 's5', 'Secondary');
  F('p2', 'Emigration', '12 Jun 1885', 'liverpool', 'Departed with husband John', 's1', 'Primary', 'exact', 'Folio 7, line 23');
  F('p2', 'Arrival', '9 Sep 1885', 'brisbane', '', 's1', 'Primary', 'exact', 'Folio 7, line 23');
  F('p2', 'Residence', '1886', 'toowoomba', 'Describes the house on Russell Street in a letter home', 's9', 'Secondary', 'exact', 'Pages 1–2');
  F('p2', 'Death', '18 Nov 1939', 'toowoomba', '', 's3', 'Primary');
  F('p3', 'Birth', '1858', 'ennis', '', 's14', 'Secondary', 'about');
  M('p3', 'p4', '1886', 'ennis', 's14', 'Secondary');
  F('p3', 'Residence', '1903', 'cairns', 'Labourer, Grafton Street', 's12', 'Secondary');
  F('p3', 'Death', '1920', 'cairns', 'Family recollection only', null);
  F('p4', 'Birth', '1862', 'ennis', '', 's14', 'Secondary', 'about');
  F('p4', 'Death', '1930', 'cairns', '', 's3', 'Primary');
  F('p5', 'Birth', '2 Jul 1886', 'brisbane', 'First of the family born in Queensland', 's2', 'Primary');
  F('p5', 'Residence', '1903', 'toowoomba', '', 's12', 'Secondary');
  M('p5', 'p6', '21 Oct 1914', 'cairns', ['s4', 's8'], 'Primary');
  F('p5', 'Occupation', '1920', 'cairns', 'Cane farmer, Edmonton', 's12', 'Secondary');
  F('p5', 'Death', '1952', 'cairns', '', 's3', 'Primary');
  F('p6', 'Birth', '1890', 'ennis', 'Family say she was born in County Clare', null, null, 'about');
  F('p6', 'Death', '1968', 'cairns', '', 's3', 'Primary');
  F('p7', 'Birth', '30 Jan 1888', 'toowoomba', '', 's2', 'Primary');
  M('p7', 'p8', '1910', 'sydney', 's10', 'Secondary');
  F('p7', 'Death', '1975', 'sydney', '', 's10', 'Secondary');
  F('p8', 'Birth', '1885', 'sydney', '', null);
  F('p8', 'Death', '1944', 'sydney', '', 's10', 'Secondary');
  F('p9', 'Birth', '1890', 'toowoomba', '', null);
  F('p9', 'Military', '1916', 'toowoomba', 'Enlisted AIF, 42nd Battalion', 's11', 'Primary', 'exact', 'Service no. 2875, p. 1');
  F('p9', 'Death', '26 Sep 1917', 'ypres', 'Killed in action, Polygon Wood', 's11', 'Primary', 'exact', 'Service no. 2875, p. 14');
  F('p10', 'Birth', '8 Apr 1893', 'toowoomba', '', 's2', 'Primary');
  M('p10', 'p11', '1919', 'toowoomba', 's4', 'Primary');
  F('p10', 'Death', '1981', 'toowoomba', '', 's3', 'Primary');
  F('p11', 'Birth', '1890', 'toowoomba', '', 's2', 'Primary');
  F('p11', 'Death', '1962', 'toowoomba', '', 's3', 'Primary');
  F('p12', 'Birth', '1915', 'cairns', '', 's2', 'Primary');
  M('p12', 'p13', '1944', 'cairns', 's4', 'Primary');
  F('p12', 'Death', '1990', 'cairns', '', 's3', 'Primary');
  F('p13', 'Birth', '1919', 'brisbane', '', 's2', 'Primary');
  F('p13', 'Death', '2004', 'cairns', '', 's3', 'Primary');
  F('p14', 'Birth', '1918', 'cairns', '', 's2', 'Primary');
  M('p14', 'p15', '1947', 'cairns', 's4', 'Primary');
  F('p14', 'Residence', '1987', 'cairns', 'Recorded her oral history at home in Edge Hill', 's13', 'Secondary', 'exact', 'Tape 1, 00:00–14:30');
  F('p14', 'Death', '2010', 'cairns', '', 's3', 'Primary');
  F('p15', 'Birth', '1916', 'cairns', 'Possibly born in Cooktown', null);
  F('p15', 'Death', '1988', 'cairns', '', 's3', 'Primary');
  F('p16', 'Birth', '1912', 'sydney', '', 's10', 'Secondary');
  M('p16', 'p17', '1938', 'sydney', 's10', 'Secondary');
  F('p16', 'Death', '1985', 'sydney', '', 's10', 'Secondary');
  F('p17', 'Birth', '1914', 'sydney', '', 's10', 'Secondary');
  F('p17', 'Death', '1999', 'sydney', '', 's10', 'Secondary');
  F('p18', 'Birth', '1915', 'sydney', '', 's10', 'Secondary');
  F('p18', 'Death', '1916', 'sydney', 'Died in infancy', null);
  F('p19', 'Birth', '1921', 'toowoomba', '', 's2', 'Primary');
  M('p19', 'p20', '1946', 'toowoomba', 's4', 'Primary');
  F('p19', 'Death', '2015', 'toowoomba', '', 's3', 'Primary');
  F('p20', 'Birth', '1919', 'toowoomba', '', 's2', 'Primary');
  F('p20', 'Death', '1996', 'toowoomba', '', 's3', 'Primary');
  F('p21', 'Birth', '1924', 'toowoomba', '', 's2', 'Primary');
  F('p21', 'Death', '1944', 'wewak', 'Killed in action, New Guinea campaign', 's7', 'Secondary');
  F('p22', 'Birth', '17 Oct 1946', 'cairns', '', 's2', 'Primary');
  M('p22', 'p23', '1972', 'cairns', 's4', 'Primary');
  F('p22', 'Residence', '2020', 'cairns', '', 's15', 'Secondary');
  F('p22', 'Family event', 'Aug 2026', 'cairns', 'New grandchild, Oliver', 's15', 'Secondary', 'exact', 'Phone call with Peter, Aug 2026');
  F('p23', 'Birth', '1950', 'cairns', '', 's15', 'Secondary');
  F('p24', 'Birth', '1949', 'cairns', '', 's2', 'Primary');
  M('p24', 'p25', '1973', 'brisbane', 's4', 'Primary');
  F('p24', 'Residence', '2020', 'brisbane', '', 's15', 'Secondary');
  F('p25', 'Birth', '1947', 'brisbane', '', 's15', 'Secondary');
  F('p26', 'Birth', '15 Oct 1950', 'cairns', '', 's2', 'Primary');
  F('p26', 'Residence', '2020', 'cairns', '', 's15', 'Secondary');
  F('p27', 'Birth', '1940', 'sydney', '', 's10', 'Secondary');
  F('p27', 'Death', '2019', 'sydney', '', 's10', 'Secondary');
  F('p28', 'Birth', '1943', 'sydney', '', 's10', 'Secondary');
  F('p28', 'Residence', '2020', 'sydney', '', 's15', 'Secondary');
  F('p29', 'Birth', '1952', 'toowoomba', '', 's2', 'Primary');
  F('p29', 'Residence', '2020', 'toowoomba', '', 's15', 'Secondary');
  F('p30', 'Birth', '1955', 'toowoomba', '', 's2', 'Primary');
  const ex: Record<string, string> = {
    s1: 'Pascoe, John, 27, miner, Cornwall; Pascoe, Elizabeth, 24, wife — assisted emigrants.',
    s11: 'Killed in action in the field, Belgium, 26/9/17.',
    s7: 'PASCOE. — On the 4th August, at his residence, James Street, John Trelawny Pascoe, late of the Railway Workshops, aged 73 years.',
    s9: '“The country here is wide and the sky is wider still. John has work at the railway and we have three rooms.”',
    s8: 'A pretty wedding was celebrated at St Monica’s on Wednesday, when Miss Mary O’Rourke was married to Mr William Pascoe.',
  };
  cites.forEach((c) => {
    if (ex[c.sourceId]) c.extract = ex[c.sourceId];
  });
  const fid = (pid: string, type: string) => facts.find((f) => f.personId === pid && f.type === type)!.id;

  const media: Media[] = [];
  const fc = (personId: string, x: number, y: number) => ({ personId, x, y });
  const Md = (id: string, kind: Media['kind'], title: string, date: string, place: string, desc: string, faces: Media['faces'], scene: string, dur = 0, linked: string[] = []) =>
    media.push({
      id, kind, file: '', thumb: '', scene, title, date, placeId: place, desc, duration: dur, mime: '', originalName: '', sizeBytes: 0,
      faces, people: linked, sourceIds: Object.keys(srcMedia).filter((s) => srcMedia[s].includes(id)), createdAt: now, addedBy: '', tags: {},
    });
  Md('m1', 'photo', 'John and Elizabeth, wedding portrait', '1884', 'redruth', 'Studio portrait taken in Redruth the year before they sailed.', [fc('p1', 38, 30), fc('p2', 62, 34)], 's2');
  Md('m2', 'photo', 'The Pascoes outside the Russell Street cottage', '1895', 'toowoomba', 'The whole family on the front step. Florence is on her mother’s knee.', [fc('p1', 20, 36), fc('p2', 40, 38), fc('p5', 58, 40), fc('p7', 72, 42), fc('p9', 84, 44), fc('p10', 40, 58)], 's3');
  Md('m3', 'photo', 'RMS Carnmarth at Liverpool', '1885', 'liverpool', 'Postcard of the ship that carried John and Elizabeth to Queensland.', [], 's4');
  Md('m4', 'photo', 'William in the cane fields', '1925', 'cairns', 'William at Edmonton with the harvest crew.', [fc('p5', 50, 34)], 's6');
  Md('m5', 'photo', 'Wedding of William and Mary', '1914', 'cairns', 'Outside St Monica’s, Cairns.', [fc('p5', 38, 30), fc('p6', 62, 34)], 's2');
  Md('m6', 'photo', 'Thomas in AIF uniform', '1916', 'toowoomba', 'Studio portrait taken before embarkation.', [fc('p9', 50, 34)], 's6');
  Md('m7', 'photo', 'Edith and Arthur at Manly', '1912', 'sydney', 'Day trip on the ferry, summer 1912.', [fc('p7', 38, 32), fc('p8', 62, 34)], 's2');
  Md('m8', 'photo', 'Florence and George Hartley', '1919', 'toowoomba', 'Wedding day in Toowoomba.', [fc('p10', 38, 30), fc('p11', 62, 32)], 's2');
  Md('m9', 'photo', 'Jack and Margaret as children', '1922', 'cairns', 'On the verandah at Edmonton.', [fc('p12', 38, 32), fc('p14', 62, 36)], 's2');
  Md('m10', 'photo', 'Hartley children at Queens Park', '1928', 'toowoomba', 'Dorothy and Albert with their bicycles.', [fc('p19', 38, 32), fc('p21', 62, 32)], 's1');
  Md('m11', 'photo', 'Ronald Bates at Bondi', '1935', 'sydney', '', [fc('p16', 50, 34)], 's4');
  Md('m12', 'photo', 'Albert Hartley on enlistment', '1942', 'toowoomba', 'Taken the week he enlisted.', [fc('p21', 50, 34)], 's6');
  Md('m13', 'photo', 'Jack and Joan’s wedding', '1944', 'cairns', 'Jack was on leave for one week.', [fc('p12', 38, 30), fc('p13', 62, 32)], 's2');
  Md('m14', 'photo', 'Margaret and Leonard’s wedding', '1947', 'cairns', '', [fc('p14', 38, 30), fc('p15', 62, 32)], 's2');
  Md('m15', 'photo', 'Esplanade picnic', '1955', 'cairns', 'Sunday picnic on the Cairns Esplanade.', [fc('p12', 25, 40), fc('p13', 45, 36), fc('p22', 65, 40), fc('p24', 82, 38)], 's3');
  Md('m16', 'photo', 'Dorothy with Robyn and Ian', '1957', 'toowoomba', '', [fc('p19', 45, 36), fc('p29', 65, 40), fc('p30', 82, 42)], 's3');
  Md('m17', 'photo', 'Bates family Christmas', '1962', 'sydney', 'Glebe, Christmas Day 1962.', [fc('p16', 25, 40), fc('p17', 45, 36), fc('p27', 65, 40), fc('p28', 82, 38)], 's3');
  Md('m18', 'photo', 'Peter’s graduation', '1968', 'brisbane', 'University of Queensland, St Lucia.', [fc('p22', 50, 34)], 's6');
  Md('m19', 'photo', 'Susan and David’s wedding', '1973', 'brisbane', '', [fc('p24', 38, 30), fc('p25', 62, 32)], 's2');
  Md('m20', 'photo', 'Family reunion, Toowoomba', '2011', 'toowoomba', 'Five branches together at Queens Park.', [fc('p22', 20, 40), fc('p24', 38, 38), fc('p26', 55, 40), fc('p28', 70, 38), fc('p29', 86, 40)], 's3');
  Md('m21', 'document', 'Passenger list, folio 7', '1885', 'brisbane', 'Page listing John and Elizabeth Pascoe, assisted emigrants.', [], 'doc', 0, ['p1', 'p2']);
  Md('m22', 'document', 'Letter from Elizabeth to her sister', '1886', 'toowoomba', 'Four pages, transcribed 2024.', [], 'doc', 0, ['p2']);
  Md('m23', 'document', 'Obituary clipping, John Pascoe', '1931', 'toowoomba', '', [], 'doc', 0, ['p1']);
  Md('m24', 'audio', 'Margaret Cho oral history, part 1', '1987', 'cairns', 'Margaret talks about growing up on the cane farm.', [], 'audio', 252, ['p14']);
  Md('m25', 'audio', 'Peter on the cane farm', '2009', 'cairns', 'Recorded at the 2009 Christmas lunch.', [], 'audio', 158, ['p22']);

  const H = (id: string, provider: string, collection: string, personId: string, score: number, record: Hint['record']): Hint => ({ id, provider, collection, personId, score, status: 'pending', record });
  const hints: Hint[] = [
    H('h1', 'Ancestry', 'Queensland, Australia, Electoral Rolls, 1903–1980', 'p5', 92, {
      rec: [['Name', 'William Henry Pascoe'], ['Residence', 'Spence Street, Cairns, 1925'], ['Occupation', 'Cane farmer']],
      props: [{ type: 'Residence', q: 'exact', date: '1925', place: 'cairns', desc: 'Spence Street, Cairns — cane farmer' }], srcId: 's12', page: 'Cairns division, 1925, roll no. 2214', qual: 'Secondary', extract: 'Pascoe, William Henry, Spence Street, cane farmer, M.',
    }),
    H('h2', 'FamilySearch', 'England and Wales Census, 1881', 'p2', 88, {
      rec: [['Name', 'Elizabeth A. Rowe'], ['Birth', 'abt 1862, Redruth, Cornwall'], ['Residence', 'Fore Street, Redruth, 1881'], ['Occupation', 'Dressmaker']],
      props: [{ type: 'Residence', q: 'exact', date: '3 Apr 1881', place: 'redruth', desc: 'Fore Street, Redruth — living with her parents' }, { type: 'Occupation', q: 'exact', date: '1881', place: 'redruth', desc: 'Dressmaker' }], srcId: 's5', page: 'RG11/2318, folio 41, page 12', qual: 'Primary', extract: 'Elizabeth A. Rowe, dau., unm., 19, dressmaker, b. Redruth.',
    }),
    H('h3', 'Ancestry', 'Australia, WWII Military Service Records', 'p21', 81, {
      rec: [['Name', 'Albert Hartley'], ['Birth', '1924, Toowoomba'], ['Enlisted', '6 Mar 1942, Toowoomba'], ['Father', 'George Hartley']],
      props: [{ type: 'Military', q: 'exact', date: '6 Mar 1942', place: 'toowoomba', desc: 'Enlisted, 2nd AIF, service no. QX41827' }], srcNew: { title: 'WWII service records — Australian Army', type: 'Military record', repo: 'National Archives of Australia' }, page: 'Series B883, QX41827', qual: 'Primary', extract: 'Hartley, Albert. Born 1924 Toowoomba. Enlisted 6 Mar 1942.',
    }),
    H('h4', 'FamilySearch', 'Ireland Civil Registration, Births, 1864–1913', 'p6', 76, {
      rec: [['Name', 'Mary Kathleen O’Rourke'], ['Birth', '3 Jun 1890, Ennis, County Clare'], ['Father', 'Patrick O’Rourke'], ['Mother', 'Bridget Hanlon']],
      props: [{ type: 'Birth', q: 'exact', date: '3 Jun 1890', place: 'ennis', desc: 'Registered in Ennis district', replace: true }], srcId: 's14', page: 'Ennis, vol. 4, p. 217, entry 433', qual: 'Primary', extract: 'Mary Kathleen, female, 3 June 1890, Ennis; father Patrick O’Rourke, labourer; mother Bridget O’Rourke formerly Hanlon.',
    }),
    H('h5', 'Ancestry', 'Sands Directories, Sydney and NSW, 1858–1933', 'p8', 69, {
      rec: [['Name', 'Bates, Arthur L.'], ['Residence', '14 Wigram Road, Glebe, 1932'], ['Occupation', 'Clerk']],
      props: [{ type: 'Residence', q: 'exact', date: '1932', place: 'sydney', desc: '14 Wigram Road, Glebe — clerk' }], srcNew: { title: 'Sands Directory, Sydney, 1932', type: 'Directory', repo: 'City of Sydney Archives' }, page: 'Householders, Glebe, p. 512', qual: 'Secondary', extract: 'Bates Arthur L., clerk, 14 Wigram rd.',
    }),
  ];

  const T = (id: string, title: string, pid: string, factId: string, status: Task['status'], priority: Task['priority'], notes: string): Task => ({ id, title, personId: pid, factId, status, priority, notes, createdAt: now });
  const tasks: Task[] = [
    T('t1', 'Find Thomas Pascoe’s birth registration', 'p9', fid('p9', 'Birth'), 'In progress', 'High', 'Searched Qld BDM index 1888–1892 under Pascoe and Pasco — nothing yet. Next: St Luke’s Toowoomba baptisms.'),
    T('t2', 'Confirm Mary O’Rourke’s birthplace', 'p6', fid('p6', 'Birth'), 'To do', 'High', ''),
    T('t3', 'Locate Patrick O’Rourke’s death record', 'p3', fid('p3', 'Death'), 'To do', 'Medium', 'Not in Qld index under O’Rourke. Try Rourke and O’Rorke.'),
    T('t4', 'Order Arthur Bates’s NSW birth certificate', 'p8', fid('p8', 'Birth'), 'To do', 'Medium', ''),
    T('t5', 'Check Cooktown births for Leonard Cho', 'p15', fid('p15', 'Birth'), 'In progress', 'Low', 'Cooktown registers are partly indexed. Requested a search from the Registry.'),
    T('t6', 'Transcribe Elizabeth’s 1886 letter', 'p2', fid('p2', 'Residence'), 'Done', 'Low', 'Transcribed all four pages. Saved under Sources.'),
    T('t7', 'Find the Carnmarth arrival notice in the Brisbane Courier', 'p1', fid('p1', 'Arrival'), 'Done', 'Medium', 'Found on Trove: shipping column, 10 Sep 1885.'),
    T('t8', 'Ask Lynette about the Bates family photos', 'p28', '', 'To do', 'Low', ''),
  ];

  const R = (id: string, title: string, category: string, people: string[], o: Partial<Recipe>): Recipe => ({
    id,
    title,
    category,
    people,
    servings: '',
    time: '',
    ingredients: '',
    method: '',
    story: '',
    date: '',
    placeId: '',
    mediaIds: [],
    addedBy: 'Margaret Pascoe',
    sharedBy: '',
    createdAt: '2026-01-10T09:00:00.000Z',
    updatedAt: '2026-01-10T09:00:00.000Z',
    ...o,
  });
  const recipes: Recipe[] = [
    R('r1', 'Cornish pasties', 'Mains', ['p2'], {
      servings: '6 pasties',
      time: '2 hours',
      date: 'c. 1890',
      placeId: 'stjust',
      ingredients:
        '500 g plain flour\n125 g lard\n125 g butter\nCold water\n500 g skirt steak, diced small\n2 potatoes, sliced thin\n1 swede, sliced thin\n1 onion, chopped\nSalt and plenty of pepper',
      method:
        'Rub the fats into the flour and bind with cold water. Rest the pastry for an hour.\nRoll out six rounds the size of a side plate.\nLayer potato, swede, onion and steak on one half. Season well.\nFold over and crimp along the side, never the top.\nBake at 200°C for 20 minutes, then 160°C for 40 minutes.',
      story: 'Elizabeth brought this from St Just. John took two down the mine every day. She always marked his initials in the corner so he could find his among the others.',
    }),
    R('r2', 'Nan’s Christmas pudding', 'Christmas', ['p6', 'p10'], {
      servings: '10',
      time: '6 hours steaming',
      date: '1920s',
      ingredients:
        '250 g raisins\n250 g sultanas\n125 g currants\n125 g suet\n125 g brown sugar\n125 g breadcrumbs\n60 g plain flour\n3 eggs\n1 tsp mixed spice\nHalf a cup of brandy\nA few silver threepences',
      method:
        'Soak the fruit in the brandy overnight.\nMix everything together. Everyone in the house gives it a stir and makes a wish.\nPress into a floured calico cloth and tie tightly.\nBoil for 6 hours, then hang it in the laundry until Christmas.\nBoil for another 2 hours on the day.',
      story: 'Mary taught Florence, and Florence made it every year until 1985. The threepences went to whoever found them.',
    }),
    R('r3', 'Lamingtons', 'Baking', ['p14'], {
      servings: '24 squares',
      time: '1 hour',
      date: '1960s',
      placeId: 'brisbane',
      ingredients: '1 day-old butter cake\n3 cups icing sugar\n⅓ cup cocoa\n15 g butter\n½ cup milk\n2 cups desiccated coconut',
      method:
        'Cut the cake into squares.\nMelt butter in the milk, then stir in the icing sugar and cocoa over hot water.\nDip each square in the icing, then roll in coconut.\nLeave on a rack to set.',
      story: 'Margaret made these for every school fete and church stall.',
    }),
  ];

  return {
    stories: [],
    recipes,
    people,
    rels,
    facts,
    sources,
    cites,
    media,
    places,
    hints,
    tasks,
    settings: {
      tree_name: SAMPLE_TREE_NAME,
      subtitle: 'The Pascoes of Cornwall and Queensland',
      root_person: 'p1',
      home_person: 'p22',
      is_sample: '1',
      privacy_default: 'Private',
      backup_schedule: 'daily',
    },
  };
}
