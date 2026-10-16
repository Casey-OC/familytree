// Private messages: conversation list, the open conversation, unread counts and messages waiting to send.

import { create } from 'zustand';
import { useData } from '../data/store';
import { toast } from '../data/ui';
import { cacheGet, cacheSet } from '../wall/cache';
import { wallConfigured, client } from '../wall/supabase';
import { newClientId, useWall } from '../wall/store';
import { demoMessages } from './demo';
import { supabaseMessages } from './supabase';
import type { Contact, Conversation, Message, MessagesBackend } from './types';

export type MsgMode = 'loading' | 'off' | 'connect' | 'ready' | 'error';
type Queued = { conversationId: string; clientId: string; body: string; myName: string };

interface MsgState {
  mode: MsgMode;
  error: string;
  key: string;
  backend: MessagesBackend | null;
  contacts: Contact[];
  conversations: Conversation[];
  openId: string;
  messages: Message[];
  queue: Queued[];
  online: boolean;
}

export const useMessages = create<MsgState>(() => ({
  mode: 'loading',
  error: '',
  key: '',
  backend: null,
  contacts: [],
  conversations: [],
  openId: '',
  messages: [],
  queue: [],
  online: true,
}));
const set = useMessages.setState;
const get = useMessages.getState;
const accountId = () => useData.getState().account?.id || 'local';
const qKey = () => `msgqueue:${accountId()}`;
const listKey = () => `msglist:${accountId()}`;

export const myMessageName = () => useData.getState().account?.name || useData.getState().prefs.ownerName || 'Me';
export const unreadTotal = (s: MsgState) => s.conversations.reduce((n, c) => n + (c.left ? 0 : c.unread), 0);

let unsub: (() => void) | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

/** Starts messages for the signed-in account (the demo version on the sample tree). */
export async function startMessages(force = false) {
  const { data, treeId, account } = useData.getState();
  const key = `${account?.id || ''}:${data.settings.is_sample === '1' ? 'demo:' + treeId : 'online'}`;
  if (!force && get().key === key && get().mode === 'ready') return;
  unsub?.();
  unsub = null;
  set({ key, mode: 'loading', error: '', conversations: [], messages: [], openId: '' });

  let b: MessagesBackend | null = null;
  if (data.settings.is_sample === '1') {
    // The sample tree's demo wall members are your demo contacts.
    const w = useWall.getState();
    const wb = w.backend?.kind === 'demo' ? w.backend : null;
    const wall = wb ? (await wb.walls())[0] : null;
    const members = wb && wall ? await wb.members(wall) : [];
    const contacts: Contact[] = members
      .filter((m) => m.status === 'accepted' && m.userId)
      .map((m) => ({ userId: m.userId!, name: m.name, personId: m.personId, treeName: wall!.name }));
    b = demoMessages(account?.name || 'You', contacts);
  } else if (!wallConfigured()) {
    set({ mode: 'off' });
    return;
  } else {
    b = await supabaseMessages(accountId()).catch(() => null);
    if (!b) {
      const { data: s } = await client(accountId()).auth.getSession();
      set({ mode: s.session ? 'error' : 'connect', error: s.session ? 'Messages couldn’t start.' : '' });
      return;
    }
  }
  set({ backend: b, mode: 'ready' });
  const q = await cacheGet<Queued[]>(qKey());
  if (q?.length) set({ queue: q });
  await refreshConversations();
  unsub = b.subscribe(() => {
    refreshConversations();
    if (get().openId) loadMessages(get().openId);
  });
  if (!poll) poll = setInterval(() => get().mode === 'ready' && refreshConversations(), 60_000);
}

export async function refreshConversations() {
  const b = get().backend;
  if (!b) return;
  try {
    const [contacts, conversations] = await Promise.all([b.contacts(), b.conversations()]);
    set({ contacts, conversations, online: true });
    if (b.kind === 'supabase') cacheSet(listKey(), { contacts, conversations });
    if (get().queue.length) flush();
  } catch {
    const cached = await cacheGet<{ contacts: Contact[]; conversations: Conversation[] }>(listKey());
    set({ online: false, ...(cached && !get().conversations.length ? cached : {}) });
  }
}

async function loadMessages(id: string) {
  const b = get().backend;
  if (!b) return;
  try {
    const list = await b.messages(id);
    if (get().openId !== id) return;
    const waiting = get().messages.filter((m) => m.queued && m.conversationId === id && !list.some((x) => x.clientId === m.clientId));
    set({ messages: [...list, ...waiting], online: true });
    if (b.kind === 'supabase') cacheSet(`msgs:${accountId()}:${id}`, list);
    await b.markRead(id);
    set({ conversations: get().conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) });
  } catch {
    const cached = await cacheGet<Message[]>(`msgs:${accountId()}:${id}`);
    if (get().openId === id) set({ online: false, messages: cached || get().messages });
  }
}

export async function openConversation(id: string) {
  set({ openId: id, messages: [] });
  await loadMessages(id);
}

export async function sendMessage(body: string) {
  const b = get().backend;
  const id = get().openId;
  const text = body.trim();
  if (!b || !id || !text) return;
  const clientId = newClientId();
  const myName = myMessageName();
  const draft: Message = {
    id: clientId,
    clientId,
    conversationId: id,
    senderId: b.myId(),
    senderName: myName,
    body: text,
    createdAt: new Date().toISOString(),
    deleted: false,
    queued: true,
  };
  set({ messages: [...get().messages, draft] });
  try {
    if (!navigator.onLine) throw new Error('offline');
    const m = await b.send(id, clientId, text, myName);
    set({ messages: get().messages.map((x) => (x.clientId === clientId ? m : x)) });
    refreshConversations();
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg !== 'offline' && navigator.onLine && !/internet|fetch|network/i.test(msg)) {
      set({ messages: get().messages.filter((x) => x.clientId !== clientId) });
      return toast('Couldn’t send: ' + msg);
    }
    set({ queue: [...get().queue, { conversationId: id, clientId, body: text, myName }], online: false });
    cacheSet(qKey(), get().queue);
    toast('Saved — it will send when you’re back online');
  }
}

let flushing = false;
async function flush() {
  const b = get().backend;
  if (!b || flushing) return;
  flushing = true;
  try {
    while (get().queue.length) {
      const q = get().queue[0];
      await b.send(q.conversationId, q.clientId, q.body, q.myName);
      set({ queue: get().queue.slice(1) });
      await cacheSet(qKey(), get().queue);
    }
    if (get().openId) await loadMessages(get().openId);
  } catch {
    set({ online: false });
  } finally {
    flushing = false;
  }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => get().backend && refreshConversations());

/** Opens (or creates) a conversation with these people and shows it. */
export async function messagePeople(userIds: string[], title = ''): Promise<string | null> {
  const b = get().backend;
  if (!b) return null;
  try {
    const id = await b.start(userIds, title.trim(), myMessageName());
    await refreshConversations();
    await openConversation(id);
    return id;
  } catch (e) {
    toast(String((e as Error)?.message || e));
    return null;
  }
}

export async function deleteMessage(id: string) {
  const b = get().backend;
  if (!b) return;
  try {
    await b.remove(id);
    set({ messages: get().messages.map((m) => (m.id === id ? { ...m, deleted: true } : m)) });
    refreshConversations();
  } catch (e) {
    toast(String((e as Error)?.message || e));
  }
}

export async function leaveConversation(id: string) {
  const b = get().backend;
  if (!b) return;
  try {
    await b.leave(id);
    set({ openId: '' });
    await refreshConversations();
    toast('You left the conversation');
  } catch (e) {
    toast(String((e as Error)?.message || e));
  }
}

export async function stopMessages() {
  unsub?.();
  unsub = null;
  set({ mode: 'loading', key: '', backend: null, conversations: [], messages: [], openId: '' });
}
