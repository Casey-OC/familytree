import { describe, expect, it } from 'vitest';
import { demoMessages } from '../messages/demo';
import { conversationName } from '../messages/types';

const contacts = [
  { userId: 'u1', name: 'Helen Cho', personId: 'p26', treeName: 'Pascoe' },
  { userId: 'u2', name: 'Peter Pascoe', personId: 'p22', treeName: 'Pascoe' },
  { userId: 'u3', name: 'Susan Kerr', personId: 'p24', treeName: 'Pascoe' },
];

describe('private messages', () => {
  it('lists conversations newest first with unread counts', async () => {
    const b = demoMessages('Casey', contacts);
    const list = await b.conversations();
    expect(list.map((c) => conversationName(c, b.myId()))).toEqual(['Helen Cho', 'Reunion planning']);
    expect(list.every((c) => c.unread > 0)).toBe(true);
    await b.markRead(list[0].id);
    expect((await b.conversations())[0].unread).toBe(0);
  });
  it('reuses a one-to-one conversation, and starts groups', async () => {
    const b = demoMessages('Casey', contacts);
    const c1 = await b.start(['u1'], '', 'Casey');
    expect(c1).toBe('c1');
    const g = await b.start(['u1', 'u3'], '', 'Casey');
    const conv = (await b.conversations()).find((c) => c.id === g)!;
    expect(conversationName(conv, b.myId())).toBe('Helen, Susan');
  });
  it('sends, deletes and leaves', async () => {
    const b = demoMessages('Casey', contacts);
    const m = await b.send('c1', 'k1', 'Hello', 'Casey');
    expect((await b.messages('c1')).at(-1)!.body).toBe('Hello');
    await b.remove(m.id);
    expect((await b.messages('c1')).at(-1)!.deleted).toBe(true);
    await b.leave('c2');
    expect((await b.conversations()).find((c) => c.id === 'c2')!.left).toBe(true);
  });
});
