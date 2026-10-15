import { describe, expect, it } from 'vitest';
import { newSqlJsDb } from '../data/sqljsDb';
import { migrate } from '../data/db';
import { loadTree, SqlLog } from '../data/repo';
import { sampleTree } from '../lib/sample';

describe('saving and loading a tree', () => {
  it('writes the sample tree and reads back the same data', async () => {
    const db = await newSqlJsDb();
    await migrate(db);
    const original = sampleTree();
    const sql = new SqlLog(false);
    sql.all(original);
    await db.batch(sql.stmts);
    const back = await loadTree(db);
    expect(back.people).toHaveLength(30);
    expect(back.facts).toHaveLength(original.facts.length);
    const f = back.facts.find((x) => x.id === original.facts[0].id)!;
    expect(f).toEqual(original.facts[0]);
    const m = back.media.find((x) => x.id === 'm2')!;
    expect(m.faces).toHaveLength(6);
    expect(back.hints.find((h) => h.id === 'h4')!.record.props[0].replace).toBe(true);
    expect(back.settings.tree_name).toBe('Pascoe Family Tree');
  });
  it('is idempotent to migrate twice and logs changes', async () => {
    const db = await newSqlJsDb();
    await migrate(db);
    await migrate(db);
    const sql = new SqlLog();
    sql.setting('a', 'b');
    sql.source({ id: 's', title: 't', type: 'Other', repo: '', url: '' });
    await db.batch(sql.stmts);
    const log = await db.query('SELECT * FROM sync_log');
    expect(log).toHaveLength(1);
  });
  it('deleting a person removes their facts and links', async () => {
    const db = await newSqlJsDb();
    await migrate(db);
    const sql = new SqlLog(false);
    sql.all(sampleTree());
    await db.batch(sql.stmts);
    const del = new SqlLog();
    del.del('person', 'p9');
    await db.batch(del.stmts);
    const back = await loadTree(db);
    expect(back.facts.some((f) => f.personId === 'p9')).toBe(false);
    expect(back.rels.some((r) => r.a === 'p9' || r.b === 'p9')).toBe(false);
    expect(back.tasks.find((t) => t.id === 't1')!.personId).toBe('');
  });
  it('keeps profile framing, cover photo and photo tag approval', async () => {
    const db = await newSqlJsDb();
    await migrate(db);
    const d = sampleTree();
    const p = d.people.find((x) => x.id === 'p12')!;
    p.photoMediaId = 'm13';
    p.photoCrop = { x: 40, y: 30, z: 2.2 };
    p.coverMediaId = 'm15';
    p.accountEmail = 'jack@example.com';
    const m = d.media.find((x) => x.id === 'm15')!;
    m.addedBy = 'Casey';
    m.tags = { p12: { status: 'pending', by: 'Robyn' }, p13: { status: 'hidden', by: '' }, nobody: { status: 'shown', by: '' } };
    const sql = new SqlLog(false);
    sql.all(d);
    await db.batch(sql.stmts);
    const back = await loadTree(db);
    const bp = back.people.find((x) => x.id === 'p12')!;
    expect(bp.photoCrop).toEqual({ x: 40, y: 30, z: 2.2 });
    expect(bp.coverMediaId).toBe('m15');
    expect(bp.profileId).toBe('p12');
    expect(bp.accountEmail).toBe('jack@example.com');
    const bm = back.media.find((x) => x.id === 'm15')!;
    expect(bm.addedBy).toBe('Casey');
    // tags are only kept for people actually in the photo
    expect(bm.tags).toEqual({ p12: { status: 'pending', by: 'Robyn' }, p13: { status: 'hidden', by: '' } });
  });
});
