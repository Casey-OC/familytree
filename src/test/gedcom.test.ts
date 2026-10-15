import { describe, expect, it } from 'vitest';
import { decodeGedcom, parseGedcom } from '../lib/gedcom/parse';
import { buildImport, findDuplicates, mergeAdditions } from '../lib/gedcom/importer';
import { exportGedcom } from '../lib/gedcom/export';
import { treeApi } from '../lib/family';
import { sampleTree } from '../lib/sample';

const SAMPLE = `0 HEAD
1 SOUR PAF
2 NAME Personal Ancestral File
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME George Albert /Hartley/
1 SEX M
1 BIRT
2 DATE ABT 1890
2 PLAC Toowoomba, Queensland, Australia
2 SOUR @S1@
3 PAGE Reg. 1890/B/4127
3 QUAY 3
1 DEAT
2 DATE 1962
1 FAMS @F1@
1 NOTE A long note that
2 CONC  continues here
2 CONT and on a new line.
0 @I2@ INDI
1 NAME Florence /Pascoe/
1 SEX F
1 BIRT
2 DATE 8 APR 1893
1 FAMS @F1@
0 @I3@ INDI
1 NAME Dorothy /Hartley/
1 SEX F
1 BIRT
2 DATE Spring 1921
1 FAMC @F1@
0 @I4@ INDI
1 NAME Robyn /Morgan/
1 SEX F
1 BIRT
2 DATE 1985
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1919
2 PLAC Toowoomba, Queensland, Australia
0 @F2@ FAM
0 @S1@ SOUR
1 TITL Queensland Birth Registrations
1 REPO @R1@
0 @R1@ REPO
1 NAME Qld BDM
0 TRLR
`;

describe('GEDCOM import', () => {
  const plan = buildImport(SAMPLE, 'Hartley.ged', SAMPLE.length, 'UTF-8');
  it('reads people, families, sources and notes', () => {
    expect(plan.counts.people).toBe(4);
    expect(plan.counts.families).toBe(1);
    expect(plan.version).toBe('5.5.1');
    expect(plan.sourceSystem).toBe('Personal Ancestral File');
    const g = plan.data.people.find((p) => p.given === 'George Albert')!;
    expect(g.surname).toBe('Hartley');
    expect(g.notes).toBe('A long note that continues here\nand on a new line.');
    expect(g.living).toBe(false);
    const robyn = plan.data.people.find((p) => p.given === 'Robyn')!;
    expect(robyn.living).toBe(true);
  });
  it('keeps citations with quality and repository', () => {
    const T = treeApi(plan.data);
    const g = plan.data.people.find((p) => p.given === 'George Albert')!;
    const b = T.ff(g.id, 'Birth')!;
    expect(b.q).toBe('about');
    expect(b.date).toBe('1890');
    expect(T.place[b.placeId].name).toBe('Toowoomba, Queensland');
    expect(T.cite[b.citeIds[0]].quality).toBe('Primary');
    expect(T.source[T.cite[b.citeIds[0]].sourceId].repo).toBe('Qld BDM');
    expect(T.conf(b)).toBe('Probable');
    expect(T.children(g.id)).toHaveLength(1);
    expect(T.ff(g.id, 'Marriage')!.desc).toBe('Married Florence Pascoe');
  });
  it('reports problems in the same words as the design', () => {
    const msgs = plan.problems.map((p) => p.msg);
    expect(msgs).toContain('date “Spring 1921” can’t be read — kept as text.');
    expect(msgs).toContain('family record with no members.');
  });
  it('handles CRLF, BOM and Windows-1252', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('0 HEAD\r\n1 CHAR UTF-8\r\n0 TRLR\r\n')]);
    const { text } = decodeGedcom(bytes);
    expect(parseGedcom(text).roots.map((r) => r.tag)).toEqual(['HEAD', 'TRLR']);
    const ansi = new Uint8Array([...new TextEncoder().encode('0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME Ren'), 0xe9, ...new TextEncoder().encode(' /Dubois/\n0 TRLR\n')]);
    expect(decodeGedcom(ansi).text).toContain('René');
  });
  it('merges into the sample tree, linking duplicates', () => {
    const existing = sampleTree();
    const dupes = findDuplicates(plan.data, existing);
    // George (abt 1890), Florence (1893) and Dorothy ("Spring 1921" still gives 1921) already exist.
    expect(Object.values(dupes).sort()).toEqual(['p10', 'p11', 'p19']);
    const { add, added, linked } = mergeAdditions(plan.data, existing, dupes);
    expect(linked).toBe(3);
    expect(added).toBe(1);
    expect(add.rels.find((r) => r.a === 'p11' && r.b === 'p10')).toBeUndefined(); // spouse already linked
  });
});

describe('GEDCOM export', () => {
  const T = treeApi(sampleTree());
  it('writes valid 5.5.1 and leaves living people out', () => {
    const out = exportGedcom(T, { sources: true, media: true, notes: true, excludeLiving: true });
    expect(out.excluded).toBe(8);
    expect(out.people).toBe(22);
    expect(out.text.startsWith('0 HEAD\n')).toBe(true);
    expect(out.text).toContain('2 VERS 5.5.1');
    expect(out.text).not.toContain('Peter John');
    expect(out.text.trimEnd().endsWith('0 TRLR')).toBe(true);
    for (const line of out.text.trimEnd().split('\n')) expect(line.length).toBeLessThanOrEqual(255);
  });
  it('round-trips through the importer', () => {
    const out = exportGedcom(T, { sources: true, media: false, notes: true, excludeLiving: false });
    const plan = buildImport(out.text, 'x.ged', 0, 'UTF-8');
    expect(plan.counts.people).toBe(30);
    const T2 = treeApi(plan.data);
    const john = plan.data.people.find((p) => p.given === 'John Trelawny')!;
    expect(T2.children(john.id)).toHaveLength(4);
    expect(T2.conf(T2.ff(john.id, 'Birth')!)).toBe('Proven');
    expect(T2.ff(john.id, 'Marriage')!.date).toBe('14 Jun 1884');
    expect(plan.problems.filter((p) => p.kind === 'Skipped')).toEqual([]);
  });
});
