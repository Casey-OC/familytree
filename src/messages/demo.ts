// Demo messages for the sample tree, so private messaging can be tried without going online.

import type { Contact, Conversation, Message, MessagesBackend } from './types';

const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

export function demoMessages(myName: string, contacts: Contact[]): MessagesBackend {
  const me = 'me';
  const helen = contacts.find((c) => /Helen/.test(c.name)) || contacts[0];
  const peter = contacts.find((c) => /Peter/.test(c.name)) || contacts[1] || contacts[0];
  const susan = contacts.find((c) => /Susan/.test(c.name)) || contacts[2] || contacts[0];
  const convs: (Omit<Conversation, 'lastBody' | 'lastSender' | 'lastAt' | 'unread'> & { readAt: string })[] = [];
  const msgs: Message[] = [];
  const add = (cid: string, from: Contact | null, body: string, h: number) =>
    msgs.push({
      id: uid(),
      clientId: uid(),
      conversationId: cid,
      senderId: from ? from.userId : me,
      senderName: from ? from.name : myName,
      body,
      createdAt: ago(h),
      deleted: false,
    });
  if (helen) {
    convs.push({
      id: 'c1',
      title: '',
      members: [
        { userId: me, name: myName, left: false },
        { userId: helen.userId, name: helen.name, left: false },
      ],
      left: false,
      readAt: ago(30),
    });
    add('c1', helen, 'Hi! I found Mum’s old address book — it has the Hanlon cousins in it.', 50);
    add('c1', null, 'Oh wonderful. Could you photograph the pages with Cairns addresses?', 49);
    add('c1', helen, 'Will do this weekend. There’s a note about Great-uncle Thomas too.', 3);
  }
  if (peter && susan) {
    convs.push({
      id: 'c2',
      title: 'Reunion planning',
      members: [
        { userId: me, name: myName, left: false },
        { userId: peter.userId, name: peter.name, left: false },
        { userId: susan.userId, name: susan.name, left: false },
      ],
      left: false,
      readAt: ago(200),
    });
    add('c2', peter, 'Are we still thinking Easter for the reunion at Edmonton?', 120);
    add('c2', susan, 'Easter works for us. I can do the slideshow of old photos.', 100);
  }
  const listeners = new Set<() => void>();
  const ping = () => listeners.forEach((f) => f());
  const view = (c: (typeof convs)[number]): Conversation => {
    const mine = msgs.filter((m) => m.conversationId === c.id && !m.deleted);
    const last = mine[mine.length - 1];
    return {
      id: c.id,
      title: c.title,
      members: c.members,
      left: c.left,
      lastBody: last?.body || '',
      lastSender: last?.senderName || '',
      lastAt: last?.createdAt || ago(0),
      unread: mine.filter((m) => m.senderId !== me && m.createdAt > c.readAt).length,
    };
  };
  return {
    kind: 'demo',
    myId: () => me,
    contacts: async () => contacts,
    conversations: async () => convs.map(view).sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    messages: async (id) => msgs.filter((m) => m.conversationId === id),
    async start(userIds, title) {
      const ids = [...new Set(userIds)];
      if (ids.length === 1 && !title) {
        const found = convs.find((c) => !c.title && c.members.length === 2 && c.members.some((m) => m.userId === ids[0]));
        if (found) return found.id;
      }
      const id = uid();
      convs.push({
        id,
        title,
        members: [{ userId: me, name: myName, left: false }, ...ids.map((u) => ({ userId: u, name: contacts.find((c) => c.userId === u)?.name || '', left: false }))],
        left: false,
        readAt: ago(0),
      });
      return id;
    },
    async send(id, clientId, body) {
      const m: Message = { id: uid(), clientId, conversationId: id, senderId: me, senderName: myName, body, createdAt: new Date().toISOString(), deleted: false };
      msgs.push(m);
      const c = convs.find((x) => x.id === id);
      if (c) c.readAt = m.createdAt;
      ping();
      return m;
    },
    async remove(id) {
      const m = msgs.find((x) => x.id === id);
      if (m) m.deleted = true;
    },
    async markRead(id) {
      const c = convs.find((x) => x.id === id);
      if (c) c.readAt = new Date().toISOString();
    },
    async leave(id) {
      const c = convs.find((x) => x.id === id);
      if (c) c.left = true;
    },
    subscribe(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
}
