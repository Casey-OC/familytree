// Private messages on Supabase (same online account as the Family Wall).

import { client } from '../wall/supabase';
import type { Contact, Conversation, Message, MessagesBackend } from './types';

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const msg = (r: Row): Message => ({
  id: str(r.id),
  clientId: str(r.client_id),
  conversationId: str(r.conversation_id),
  senderId: str(r.sender_id),
  senderName: str(r.sender_name),
  body: str(r.body),
  createdAt: str(r.created_at),
  deleted: !!r.deleted,
});

export async function supabaseMessages(accountId: string): Promise<MessagesBackend | null> {
  const c = client(accountId);
  const { data } = await c.auth.getSession();
  if (!data.session) return null;
  const me = data.session.user.id;
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(/fetch|network/i.test(e.message) ? 'Can’t reach the internet right now.' : e.message);
  };
  return {
    kind: 'supabase',
    myId: () => me,
    async contacts() {
      const { data, error } = await c.rpc('my_contacts');
      fail(error);
      return ((data as Row[]) || []).map((r): Contact => ({ userId: str(r.user_id), name: str(r.name), personId: str(r.person_id), treeName: str(r.tree_name) }));
    },
    async conversations() {
      const { data, error } = await c.rpc('my_conversations');
      fail(error);
      return ((data as Row[]) || []).map((r): Conversation => ({
        id: str(r.id),
        title: str(r.title),
        members: Array.isArray(r.members) ? (r.members as Conversation['members']) : [],
        lastBody: str(r.last_body),
        lastSender: str(r.last_sender),
        lastAt: str(r.last_at),
        unread: Number(r.unread || 0),
        left: !!r.left_at,
      }));
    },
    async messages(id) {
      const { data, error } = await c.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }).limit(500);
      fail(error);
      return ((data as Row[]) || []).map(msg);
    },
    async start(userIds, title, myName) {
      const { data, error } = await c.rpc('start_conversation', { others: userIds, group_title: title, my_name: myName });
      fail(error);
      return str(data);
    },
    async send(id, clientId, body, myName) {
      const prior = await c.from('messages').select('*').eq('client_id', clientId).maybeSingle();
      if (prior.data) return msg(prior.data as Row);
      const { data, error } = await c.from('messages').insert({ client_id: clientId, conversation_id: id, sender_name: myName, body }).select('*').single();
      fail(error);
      return msg(data as Row);
    },
    async remove(id) {
      const { error } = await c.from('messages').update({ deleted: true }).eq('id', id);
      fail(error);
    },
    async markRead(id) {
      await c.rpc('mark_read', { c: id });
    },
    async leave(id) {
      const { error } = await c.rpc('leave_conversation', { c: id });
      fail(error);
    },
    subscribe(onChange) {
      let t: ReturnType<typeof setTimeout> | undefined;
      const soon = () => {
        clearTimeout(t);
        t = setTimeout(onChange, 300);
      };
      const ch = c.channel(`messages-${me}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, soon).subscribe();
      return () => {
        clearTimeout(t);
        c.removeChannel(ch);
      };
    },
  };
}
