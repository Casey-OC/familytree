import { describe, expect, it } from 'vitest';
import { demoBackend } from '../wall/demo';
import { LIFE_TO_FACT, LIFE_TYPES, NO_SHARING } from '../wall/types';
import { FACT_TYPES } from '../lib/types';

const names = { p22: 'Peter Pascoe', p24: 'Susan Kerr', p26: 'Helen Cho', p28: 'Lynette Bates', p29: 'Robyn Morgan', p23: 'Karen Pascoe', p12: 'Jack Pascoe' };

describe('Family Wall', () => {
  it('every life event becomes a real tree fact type when approved', () => {
    for (const t of LIFE_TYPES) expect(FACT_TYPES).toContain(LIFE_TO_FACT[t]);
  });
  it('new invitations never start with anything shared', () => {
    expect(Object.values(NO_SHARING).every((v) => v === false)).toBe(true);
  });
  it('the demo wall posts, likes, comments, hides, invites and accepts', async () => {
    const b = demoBackend('Casey', names);
    const [w] = await b.walls();
    const before = (await b.feed(w)).length;
    const p = await b.post(w, { clientId: 'c1', type: 'text', body: 'Hello', tags: [{ id: 'p12', name: 'Jack Pascoe' }] }, 'Casey');
    expect((await b.feed(w)).length).toBe(before + 1);
    await b.setLike(w, p.id, true);
    await b.setLike(w, p.id, true);
    expect((await b.feed(w)).find((x) => x.id === p.id)!.likes).toBe(1);
    await b.comment(w, p.id, 'k1', 'Nice', 'Casey');
    expect((await b.feed(w)).find((x) => x.id === p.id)!.comments).toHaveLength(1);
    await b.setHidden(w, p.id, true);
    expect(await b.hiddenPosts(w)).toContain(p.id);
    const m = await b.invite(w, { personId: 'p12', personName: 'Jack Pascoe', email: 'Jack@Example.com ', perms: { post: true, photos: false, suggest: false } });
    expect(m).toMatchObject({ status: 'pending', email: 'jack@example.com', sharing: NO_SHARING });
    await b.accept(
      { memberId: m.id, treeId: w.treeId, treeName: w.name, ownerName: 'Casey', personName: 'Jack Pascoe', invitedAt: '' },
      { ...NO_SHARING, birthday: true },
      '14 Mar',
      'Cairns',
    );
    const jack = (await b.members(w)).find((x) => x.id === m.id)!;
    expect(jack).toMatchObject({ status: 'accepted', birthday: '14 Mar', location: '' }); // town not shared, so not kept
  });
  it('the demo wall has a life event waiting for approval, and approving records it', async () => {
    const b = demoBackend('Casey', names);
    const [w] = await b.walls();
    const pending = (await b.feed(w)).filter((p) => p.lifeStatus === 'pending');
    expect(pending).toHaveLength(1);
    await b.setLifeStatus(w, pending[0].id, 'approved');
    expect((await b.feed(w)).filter((p) => p.lifeStatus === 'pending')).toHaveLength(0);
  });
});
