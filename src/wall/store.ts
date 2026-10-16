// The Family Wall's state: which wall you're looking at, its posts and members,
// the copy saved for offline, and anything waiting to send.

import { create } from 'zustand';
import { useData } from '../data/store';
import { toast } from '../data/ui';
import { addFactFromWall } from '../data/actions';
import { treeApi } from '../lib/family';
import { cacheGet, cacheSet } from './cache';
import { demoBackend } from './demo';
import * as supa from './supabase';
import type { Invite, LifeEvent, NewInvite, NewPost, Permissions, PostType, Sharing, Wall, WallBackend, WallMember, WallPost } from './types';

export type WallMode = 'loading' | 'off' | 'connect' | 'ready' | 'error';

type Queued =
  | { kind: 'post'; treeId: string; post: NewPost; authorName: string }
  | { kind: 'comment'; treeId: string; postId: string; clientId: string; body: string; authorName: string }
  | { kind: 'like'; treeId: string; postId: string; on: boolean }
  | { kind: 'hide'; treeId: string; postId: string; hidden: boolean };

interface WallState {
  mode: WallMode;
  error: string;
  backend: WallBackend | null;
  key: string; // account + tree the wall was started for
  walls: Wall[];
  wallId: string; // treeId of the wall being shown
  posts: WallPost[];
  members: WallMember[];
  hidden: string[];
  invites: Invite[];
  online: boolean;
  loading: boolean;
  savedAt: string; // when the offline copy was saved
  queue: Queued[];
}

export const useWall = create<WallState>(() => ({
  mode: 'loading',
  error: '',
  backend: null,
  key: '',
  walls: [],
  wallId: '',
  posts: [],
  members: [],
  hidden: [],
  invites: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  loading: false,
  savedAt: '',
  queue: [],
}));
const set = useWall.setState;
const get = useWall.getState;

export const newClientId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const accountId = () => useData.getState().account?.id || 'local';
const cacheKey = (treeId: string) => `wall:${accountId()}:${treeId}`;
const queueKey = () => `queue:${accountId()}`;

export function currentWall(): Wall | undefined {
  const s = get();
  return s.walls.find((w) => w.treeId === s.wallId);
}

/** The name you post under: your account name on your own wall, your name in the owner's tree on theirs. */
export function myWallName(w = currentWall()): string {
  const { account, prefs } = useData.getState();
  if (w && !w.isOwner) {
    const me = get().members.find((m) => m.isMe);
    if (me?.name) return me.name;
  }
  return account?.name || prefs.ownerName || 'Me';
}

let unsubscribe: (() => void) | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;

/** Starts (or restarts) the wall for the open tree and signed-in account. */
export async function startWall(force = false) {
  const { data, treeId, account } = useData.getState();
  const key = `${account?.id || ''}:${treeId}`;
  if (!force && get().key === key && get().mode !== 'loading' && get().mode !== 'error') return;
  unsubscribe?.();
  unsubscribe = null;
  set({ key, mode: 'loading', error: '', posts: [], members: [], hidden: [], walls: [], wallId: '', invites: [] });

  if (data.settings.is_sample === '1') {
    const T = treeApi(data);
    const names: Record<string, string> = {};
    data.people.forEach((p) => (names[p.id] = T.nm(p.id)));
    const b = demoBackend(account?.name || 'You', names);
    set({ backend: b, mode: 'ready' });
    await loadWalls();
    return;
  }
  if (!supa.wallConfigured()) {
    set({ backend: null, mode: 'off' });
    return;
  }
  const c = supa.client(accountId());
  const { data: sess } = await c.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!sess.session) {
    set({ backend: null, mode: 'connect' });
    return;
  }
  set({ backend: supa.supabaseBackend(accountId()), mode: 'ready' });
  const q = await cacheGet<Queued[]>(queueKey());
  if (q?.length) set({ queue: q });
  await loadWalls();
  if (!retryTimer) retryTimer = setInterval(() => get().queue.length && flushQueue(), 30_000);
}

/** After connecting online: switch the wall on. */
export async function wallConnected() {
  await startWall(true);
}

export async function disconnectWall() {
  unsubscribe?.();
  unsubscribe = null;
  await supa.disconnect(accountId());
  set({ mode: supa.wallConfigured() ? 'connect' : 'off', backend: null, walls: [], posts: [], members: [], key: '' });
}

async function loadWalls() {
  const b = get().backend!;
  const { data, treeId, account } = useData.getState();
  try {
    let walls = await b.walls();
    const invites = await b.invites().catch(() => []);
    // Your own tree always has a wall (created online the first time you open it).
    let mine = walls.find((w) => w.isOwner && w.localId === treeId);
    if (!mine && b.kind === 'supabase' && treeId) {
      mine = await b.openWall(treeId, data.settings.tree_name || 'Family tree', account?.name || '');
      walls = [mine, ...walls];
    }
    const wallId = get().wallId && walls.some((w) => w.treeId === get().wallId) ? get().wallId : mine?.treeId || walls[0]?.treeId || '';
    set({ walls, invites, wallId, online: true });
    if (wallId) await openWallFeed(wallId);
  } catch (e) {
    await showOffline(e);
  }
}

async function showOffline(e: unknown) {
  const msg = String((e as Error)?.message || e);
  const s = get();
  const id = s.wallId || s.walls[0]?.treeId;
  const cached = id ? await cacheGet<{ posts: WallPost[]; members: WallMember[]; hidden: string[]; walls: Wall[]; at: string }>(cacheKey(id)) : undefined;
  if (/connect|internet|fetch|network/i.test(msg) || !navigator.onLine) {
    set({
      online: false,
      ...(cached ? { posts: cached.posts, members: cached.members, hidden: cached.hidden, walls: s.walls.length ? s.walls : cached.walls, savedAt: cached.at } : {}),
    });
  } else set({ mode: 'error', error: msg });
}

export async function openWallFeed(wallId: string) {
  const b = get().backend;
  if (!b) return;
  set({ wallId, loading: true });
  const w = get().walls.find((x) => x.treeId === wallId);
  if (!w) return set({ loading: false });
  // Show the saved copy straight away, then the latest.
  const cached = await cacheGet<{ posts: WallPost[]; members: WallMember[]; hidden: string[]; at: string }>(cacheKey(wallId));
  if (cached && !get().posts.length) set({ posts: cached.posts, members: cached.members, hidden: cached.hidden, savedAt: cached.at });
  await refreshWall();
  unsubscribe?.();
  unsubscribe = b.subscribe(w, () => refreshWall());
  b.touch(w).catch(() => undefined);
}

export async function refreshWall() {
  const b = get().backend;
  const w = currentWall();
  if (!b || !w) return;
  try {
    const [posts, members, hidden] = await Promise.all([b.feed(w), b.members(w), b.hiddenPosts(w)]);
    const at = new Date().toISOString();
    // Keep posts still waiting to send at the top.
    const waiting = get().posts.filter((p) => p.queued && !posts.some((x) => x.clientId === p.clientId));
    set({ posts: [...waiting, ...posts], members, hidden, online: true, loading: false, savedAt: at });
    if (b.kind === 'supabase') cacheSet(cacheKey(w.treeId), { posts: posts.map((p) => ({ ...p, photoUrl: '' })), members, hidden, walls: get().walls, at });
    if (get().queue.length) flushQueue();
  } catch (e) {
    set({ loading: false });
    await showOffline(e);
  }
}

// ---------- offline queue ----------

async function saveQueue() {
  // Photos are kept as files (Blobs), which the on-computer store can hold.
  await cacheSet(queueKey(), get().queue);
}

function enqueue(q: Queued) {
  set({ queue: [...get().queue, q] });
  saveQueue();
}

let flushing = false;
export async function flushQueue() {
  const b = get().backend;
  if (!b || flushing || !get().queue.length) return;
  flushing = true;
  try {
    while (get().queue.length) {
      const q = get().queue[0];
      const w = get().walls.find((x) => x.treeId === q.treeId);
      if (!w) {
        set({ queue: get().queue.slice(1) });
        continue;
      }
      if (q.kind === 'post') await b.post(w, q.post, q.authorName);
      else if (q.kind === 'comment') await b.comment(w, q.postId, q.clientId, q.body, q.authorName);
      else if (q.kind === 'like') await b.setLike(w, q.postId, q.on);
      else await b.setHidden(w, q.postId, q.hidden);
      set({ queue: get().queue.slice(1) });
      await saveQueue();
    }
    set({ online: true });
    toast('Everything you wrote offline has been sent');
    await refreshWall();
  } catch {
    set({ online: false });
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    set({ online: true });
    if (get().backend) refreshWall();
  });
  window.addEventListener('offline', () => set({ online: false }));
}

const isNetwork = (e: unknown) => !navigator.onLine || /connect|internet|fetch|network/i.test(String((e as Error)?.message || e));

// ---------- actions ----------

export interface Draft {
  type: PostType;
  body: string;
  photo: Blob | null;
  photoAlt: string;
  life: LifeEvent;
  suggestForTree: boolean;
  tags: { id: string; name: string }[];
}

export async function sendPost(d: Draft): Promise<boolean> {
  const b = get().backend;
  const w = currentWall();
  if (!b || !w) return false;
  if (!d.body.trim() && !d.photo) {
    toast('Write something first');
    return false;
  }
  if (d.type === 'photo' && !d.photo) {
    toast('Choose a photo first');
    return false;
  }
  const post: NewPost = {
    clientId: newClientId(),
    type: d.type,
    body: d.body.trim(),
    photo: d.type === 'photo' ? d.photo : null,
    photoAlt: d.photoAlt,
    life: d.type === 'life' ? d.life : null,
    suggestForTree: d.type === 'life' && d.suggestForTree,
    tags: d.tags,
  };
  const name = myWallName(w);
  const placeholder: WallPost = {
    id: post.clientId,
    clientId: post.clientId,
    authorId: b.me()?.id || '',
    authorMemberId: w.isOwner ? null : w.memberId,
    authorName: name,
    type: post.type,
    body: post.body,
    photoPath: null,
    photoUrl: post.photo ? URL.createObjectURL(post.photo) : '',
    photoAlt: post.photoAlt || '',
    life: post.life || null,
    lifeStatus: post.suggestForTree && !w.isOwner ? 'pending' : null,
    tags: post.tags,
    createdAt: new Date().toISOString(),
    removed: false,
    likes: 0,
    likedByMe: false,
    comments: [],
    queued: true,
  };
  set({ posts: [placeholder, ...get().posts] });
  try {
    if (!get().online) throw new Error('offline');
    const saved = await b.post(w, post, name);
    set({ posts: get().posts.map((p) => (p.clientId === post.clientId ? saved : p)) });
    toast(placeholder.lifeStatus === 'pending' ? 'Posted — the life event is waiting for the owner to approve it for the tree' : 'Posted to the Family Wall');
    return true;
  } catch (e) {
    if (e instanceof Error && e.message !== 'offline' && !isNetwork(e)) {
      set({ posts: get().posts.filter((p) => p.clientId !== post.clientId) });
      toast('Couldn’t post: ' + e.message);
      return false;
    }
    enqueue({ kind: 'post', treeId: w.treeId, post, authorName: name });
    set({ online: false });
    toast('Saved — it will post when you’re back online');
    return true;
  }
}

export async function sendComment(postId: string, body: string) {
  const b = get().backend;
  const w = currentWall();
  const text = body.trim();
  if (!b || !w || !text) return;
  const clientId = newClientId();
  const name = myWallName(w);
  const c = { id: clientId, clientId, authorId: b.me()?.id || '', authorName: name, body: text, createdAt: new Date().toISOString(), queued: true };
  const add = (cm: typeof c) => set({ posts: get().posts.map((p) => (p.id === postId ? { ...p, comments: [...p.comments.filter((x) => x.clientId !== clientId), cm] } : p)) });
  add(c);
  try {
    if (!get().online) throw new Error('offline');
    const saved = await b.comment(w, postId, clientId, text, name);
    add({ ...saved, queued: false });
  } catch (e) {
    if (e instanceof Error && e.message !== 'offline' && !isNetwork(e)) return toast('Couldn’t send that comment: ' + e.message);
    enqueue({ kind: 'comment', treeId: w.treeId, postId, clientId, body: text, authorName: name });
    set({ online: false });
  }
}

export async function toggleLike(postId: string) {
  const b = get().backend;
  const w = currentWall();
  const p = get().posts.find((x) => x.id === postId);
  if (!b || !w || !p || p.queued) return;
  const on = !p.likedByMe;
  set({ posts: get().posts.map((x) => (x.id === postId ? { ...x, likedByMe: on, likes: x.likes + (on ? 1 : -1) } : x)) });
  try {
    if (!get().online) throw new Error('offline');
    await b.setLike(w, postId, on);
  } catch {
    enqueue({ kind: 'like', treeId: w.treeId, postId, on });
  }
}

export async function setPostHidden(postId: string, hidden: boolean) {
  const b = get().backend;
  const w = currentWall();
  if (!b || !w) return;
  set({ hidden: hidden ? [...get().hidden, postId] : get().hidden.filter((x) => x !== postId) });
  try {
    await b.setHidden(w, postId, hidden);
  } catch {
    enqueue({ kind: 'hide', treeId: w.treeId, postId, hidden });
  }
  toast(hidden ? 'Post hidden from your feed. Undo it in My wall settings.' : 'Post shown again');
}

async function onlineOnly<T>(what: string, fn: (b: WallBackend, w: Wall) => Promise<T>): Promise<T | undefined> {
  const b = get().backend;
  const w = currentWall();
  if (!b || !w) return;
  if (!get().online) {
    toast(`You’re offline — ${what} needs the internet`);
    return;
  }
  try {
    const r = await fn(b, w);
    await refreshWall();
    return r;
  } catch (e) {
    toast(String((e as Error)?.message || e));
    return;
  }
}

export const removePost = (postId: string) => onlineOnly('removing a post', (b, w) => b.removePost(w, postId)).then(() => toast('Post removed from the wall'));

/** Owner: add a member's life event to the tree as a Probable fact cited to their post. */
export async function approveLife(p: WallPost) {
  const member = get().members.find((m) => m.id === p.authorMemberId);
  const w = currentWall();
  if (!member || !w || !p.life) return;
  if (!member.personId || !useData.getState().data.people.some((x) => x.id === member.personId)) {
    toast(`${member.name} isn’t linked to anyone in this tree, so there’s nowhere to add it.`);
    return;
  }
  const b = get().backend;
  if (!b) return;
  if (!get().online) return toast('You’re offline — approving needs the internet');
  try {
    await b.setLifeStatus(w, p.id, 'approved');
  } catch (e) {
    return toast(String((e as Error)?.message || e));
  }
  set({ posts: get().posts.map((x) => (x.id === p.id ? { ...x, lifeStatus: 'approved' } : x)) });
  const added = await addFactFromWall(member.personId, p.life, p.body, member.name, p.createdAt, w.name);
  if (added) toast(`${p.life.type} added to ${member.name}’s facts (Probable, cited to the wall post)`);
}

export const declineLife = (p: WallPost) => onlineOnly('this', (b, w) => b.setLifeStatus(w, p.id, 'declined')).then(() => toast('Kept on the wall only — not added to the tree'));

export async function inviteRelative(i: NewInvite): Promise<WallMember | undefined> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim())) {
    toast('Enter a valid email address');
    return;
  }
  return onlineOnly('inviting', (b, w) => b.invite(w, i));
}

export const cancelInvite = (memberId: string) => onlineOnly('cancelling an invitation', (b, w) => b.cancelInvite(w, memberId)).then(() => toast('Invitation cancelled'));
export const removeMember = (memberId: string, name: string) =>
  onlineOnly('removing a member', (b, w) => b.updateMember(w, memberId, { status: 'removed' })).then(() => toast(`${name} removed from the wall`));
export const setMemberPerms = (memberId: string, perms: Permissions) => onlineOnly('changing permissions', (b, w) => b.updateMember(w, memberId, { perms }));

export async function acceptInvite(inv: Invite, s: Sharing, birthday: string, location: string) {
  const b = get().backend;
  if (!b) return false;
  try {
    await b.accept(inv, s, birthday, location);
    if (b.kind === 'supabase') {
      set({ invites: get().invites.filter((x) => x.memberId !== inv.memberId) });
      await loadWalls();
      set({ wallId: inv.treeId });
      await openWallFeed(inv.treeId);
    } else await refreshWall();
    return true;
  } catch (e) {
    toast(String((e as Error)?.message || e));
    return false;
  }
}

export const setMySharing = (s: Sharing, birthday: string, location: string) =>
  onlineOnly('changing what you share', (b, w) => b.setSharing(w, s, birthday, location)).then(() => toast('Saved'));
export const leaveWall = () => onlineOnly('leaving', (b, w) => b.leave(w)).then(() => toast('You left the Family Wall. Your details are private again.'));
export const rejoinWall = () => onlineOnly('rejoining', (b, w) => b.rejoin(w)).then(() => toast('Welcome back'));
