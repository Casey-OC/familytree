// The Family Wall on Supabase. The project URL and publishable key are built into the app
// from GitHub secrets (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY); both are safe to ship.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Invite, Permissions, Sharing, WallBackend, WallComment, WallMember, WallPost } from './types';

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const wallConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);

const clients = new Map<string, SupabaseClient>();
/** One client per app account, so each account keeps its own online sign-in. */
export function client(accountId: string): SupabaseClient {
  let c = clients.get(accountId);
  if (!c) {
    c = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: `ft-wall-${accountId}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    clients.set(accountId, c);
  }
  return c;
}

export type ConnectResult = { ok: true } | { ok: false; needsCode: true } | { ok: false; error: string };

const friendly = (msg: string) =>
  /invalid login/i.test(msg)
    ? 'That password doesn’t match your online account. Use the password you sign in to the app with.'
    : /rate limit|too many/i.test(msg)
      ? 'Too many tries — please wait a few minutes and try again.'
      : /fetch|network|failed to/i.test(msg)
        ? 'Can’t reach the Family Wall right now. Check your internet connection.'
        : msg;

/** Signs in to the online account with the app's email and password, creating it the first time. */
export async function connect(accountId: string, email: string, password: string): Promise<ConnectResult> {
  const c = client(accountId);
  const si = await c.auth.signInWithPassword({ email, password });
  if (!si.error) return { ok: true };
  if (/not confirmed/i.test(si.error.message)) return { ok: false, needsCode: true };
  if (!/invalid login/i.test(si.error.message)) return { ok: false, error: friendly(si.error.message) };
  const su = await c.auth.signUp({ email, password });
  if (su.error) {
    if (/already registered/i.test(su.error.message)) return { ok: false, error: friendly('invalid login') };
    return { ok: false, error: friendly(su.error.message) };
  }
  if (su.data.session) return { ok: true };
  return { ok: false, needsCode: true };
}

/** The 6-digit code from the confirmation email. */
export async function confirmCode(accountId: string, email: string, code: string, password: string): Promise<ConnectResult> {
  const c = client(accountId);
  const v = await c.auth.verifyOtp({ email, token: code.replace(/\s/g, ''), type: 'signup' });
  if (!v.error) return { ok: true };
  // They may have clicked the link in the email instead — try signing in.
  const si = await c.auth.signInWithPassword({ email, password });
  if (!si.error) return { ok: true };
  return { ok: false, error: /expired|invalid/i.test(v.error.message) ? 'That code isn’t right or has expired. Check the email, or send a new one.' : friendly(v.error.message) };
}

export async function resendCode(accountId: string, email: string) {
  const { error } = await client(accountId).auth.resend({ type: 'signup', email });
  if (error) throw new Error(friendly(error.message));
}

export async function disconnect(accountId: string) {
  if (!wallConfigured()) return;
  await client(accountId)
    .auth.signOut({ scope: 'local' })
    .catch(() => undefined);
}

/** Keeps the online password the same as the app password. */
export async function changeOnlinePassword(accountId: string, password: string) {
  if (!wallConfigured()) return;
  const c = client(accountId);
  const { data } = await c.auth.getSession();
  if (!data.session) return;
  const { error } = await c.auth.updateUser({ password });
  if (error) throw new Error(friendly(error.message));
}

/** Shrinks big photos before upload (longest side 1600 px, JPEG). */
async function prepPhoto(b: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(b);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && b.size < 2_000_000 && /jpe?g/.test(b.type)) return b;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error('Could not prepare the photo'))), 'image/jpeg', 0.86));
  } catch {
    return b;
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function supabaseBackend(accountId: string): WallBackend {
  const c = client(accountId);
  let user: { id: string; email: string } | null = null;
  const must = async () => {
    if (user) return user;
    const { data } = await c.auth.getSession();
    if (!data.session) throw new Error('Not connected to the Family Wall');
    user = { id: data.session.user.id, email: data.session.user.email || '' };
    return user;
  };
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(friendly(e.message));
  };
  const memberFrom = (r: Row): WallMember => ({
    id: str(r.member_id),
    personId: str(r.person_id),
    name: str(r.person_name),
    email: str(r.email),
    status: str(r.status) as WallMember['status'],
    isMe: !!r.is_me,
    perms: { post: !!r.can_post, photos: !!r.can_photos, suggest: !!r.can_suggest },
    sharing: { status: !!r.share_status, photos: !!r.share_photos, birthday: !!r.share_birthday, location: !!r.share_location, contact: !!r.share_contact },
    birthday: str(r.birthday),
    location: str(r.location),
    invitedAt: str(r.invited_at),
    joinedAt: str(r.joined_at),
    online: !!r.online,
    userId: r.user_id ? str(r.user_id) : undefined,
  });

  return {
    kind: 'supabase',
    me: () => (user ? { id: user.id, name: '', email: user.email } : null),

    async walls() {
      await must();
      const { data, error } = await c.rpc('my_walls');
      fail(error);
      return ((data as Row[]) || []).map((r) => ({
        treeId: str(r.tree_id),
        localId: str(r.local_id),
        name: str(r.name),
        ownerName: str(r.owner_name),
        isOwner: !!r.is_owner,
        memberId: r.member_id ? str(r.member_id) : null,
      }));
    },

    async invites() {
      await must();
      const { data, error } = await c.rpc('my_invites');
      fail(error);
      return ((data as Row[]) || []).map((r): Invite => ({
        memberId: str(r.member_id),
        treeId: str(r.tree_id),
        treeName: str(r.tree_name),
        ownerName: str(r.owner_name),
        personName: str(r.person_name),
        invitedAt: str(r.invited_at),
      }));
    },

    async openWall(localId, name, ownerName) {
      const u = await must();
      const found = await c.from('trees').select('*').eq('owner_id', u.id).eq('local_id', localId).maybeSingle();
      fail(found.error);
      let row = found.data as Row | null;
      if (!row) {
        const ins = await c.from('trees').insert({ local_id: localId, name, owner_name: ownerName }).select('*').single();
        fail(ins.error);
        row = ins.data as Row;
      } else if (row.name !== name || row.owner_name !== ownerName) {
        await c.from('trees').update({ name, owner_name: ownerName }).eq('id', str(row.id));
      }
      return { treeId: str(row.id), localId, name, ownerName, isOwner: true, memberId: null };
    },

    async feed(w) {
      const u = await must();
      const { data, error } = await c
        .from('posts')
        .select('*, comments(id, client_id, author_id, author_name, body, created_at), reactions(user_id)')
        .eq('tree_id', w.treeId)
        .eq('removed', false)
        .order('created_at', { ascending: false })
        .limit(200);
      fail(error);
      const rows = (data as Row[]) || [];
      const paths = rows.map((r) => str(r.photo_path)).filter(Boolean);
      const urls: Record<string, string> = {};
      if (paths.length) {
        const signed = await c.storage.from('wall').createSignedUrls(paths, 60 * 60 * 6);
        (signed.data || []).forEach((s) => s.path && s.signedUrl && (urls[s.path] = s.signedUrl));
      }
      return rows.map((r): WallPost => {
        const reactions = (r.reactions as Row[]) || [];
        const comments = ((r.comments as Row[]) || [])
          .map((x): WallComment => ({
            id: str(x.id),
            clientId: str(x.client_id),
            authorId: str(x.author_id),
            authorName: str(x.author_name),
            body: str(x.body),
            createdAt: str(x.created_at),
          }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return {
          id: str(r.id),
          clientId: str(r.client_id),
          authorId: str(r.author_id),
          authorMemberId: r.author_member_id ? str(r.author_member_id) : null,
          authorName: str(r.author_name),
          type: str(r.type) as WallPost['type'],
          body: str(r.body),
          photoPath: r.photo_path ? str(r.photo_path) : null,
          photoUrl: r.photo_path ? urls[str(r.photo_path)] || '' : '',
          photoAlt: str(r.photo_alt),
          life: (r.life as WallPost['life']) || null,
          lifeStatus: (r.life_status as WallPost['lifeStatus']) || null,
          recipe: (r.recipe as WallPost['recipe']) || null,
          tags: Array.isArray(r.tags) ? (r.tags as WallPost['tags']) : [],
          createdAt: str(r.created_at),
          removed: !!r.removed,
          likes: reactions.length,
          likedByMe: reactions.some((x) => x.user_id === u.id),
          comments,
        };
      });
    },

    async hiddenPosts() {
      await must();
      const { data, error } = await c.from('hidden_posts').select('post_id');
      fail(error);
      return ((data as Row[]) || []).map((r) => str(r.post_id));
    },

    async members(w) {
      await must();
      const { data, error } = await c.rpc('wall_directory', { t: w.treeId });
      fail(error);
      return ((data as Row[]) || []).map(memberFrom);
    },

    async post(w, p, authorName) {
      const u = await must();
      // Already sent (a queued post retried after a dropped connection)?
      const prior = await c.from('posts').select('id').eq('client_id', p.clientId).maybeSingle();
      if (prior.data) return { ...(await this.feed(w)).find((x) => x.clientId === p.clientId)! };
      let photoPath: string | null = null;
      if (p.photo) {
        const blob = await prepPhoto(p.photo);
        photoPath = `${w.treeId}/${p.clientId}.jpg`;
        const up = await c.storage.from('wall').upload(photoPath, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
        fail(up.error);
      }
      const row = {
        client_id: p.clientId,
        tree_id: w.treeId,
        author_member_id: w.isOwner ? null : w.memberId,
        author_name: authorName,
        type: p.type,
        body: p.body,
        photo_path: photoPath,
        photo_alt: p.photoAlt || '',
        life: p.life || null,
        life_status: p.type === 'life' && p.suggestForTree && !w.isOwner ? 'pending' : null,
        ...(p.type === 'recipe' ? { recipe: p.recipe } : {}),
        tags: p.tags,
      };
      const { data, error } = await c.from('posts').insert(row).select('*').single();
      fail(error);
      const r = data as Row;
      return {
        id: str(r.id),
        clientId: p.clientId,
        authorId: u.id,
        authorMemberId: row.author_member_id,
        authorName,
        type: p.type,
        body: p.body,
        photoPath,
        photoUrl: p.photo ? URL.createObjectURL(p.photo) : '',
        photoAlt: row.photo_alt,
        life: row.life,
        lifeStatus: row.life_status as WallPost['lifeStatus'],
        recipe: p.type === 'recipe' ? p.recipe || null : null,
        tags: p.tags,
        createdAt: str(r.created_at),
        removed: false,
        likes: 0,
        likedByMe: false,
        comments: [],
      };
    },

    async comment(w, postId, clientId, body, authorName) {
      const u = await must();
      const prior = await c.from('comments').select('*').eq('client_id', clientId).maybeSingle();
      let r = prior.data as Row | null;
      if (!r) {
        const ins = await c.from('comments').insert({ client_id: clientId, post_id: postId, tree_id: w.treeId, author_name: authorName, body }).select('*').single();
        fail(ins.error);
        r = ins.data as Row;
      }
      return { id: str(r.id), clientId, authorId: u.id, authorName, body, createdAt: str(r.created_at) };
    },

    async setLike(w, postId, on) {
      const u = await must();
      if (on) {
        const { error } = await c.from('reactions').upsert({ post_id: postId, tree_id: w.treeId, user_id: u.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
        fail(error);
      } else {
        const { error } = await c.from('reactions').delete().eq('post_id', postId).eq('user_id', u.id);
        fail(error);
      }
    },

    async setHidden(_w, postId, hidden) {
      const u = await must();
      const q = hidden
        ? c.from('hidden_posts').upsert({ post_id: postId, user_id: u.id }, { ignoreDuplicates: true })
        : c.from('hidden_posts').delete().eq('post_id', postId).eq('user_id', u.id);
      const { error } = await q;
      fail(error);
    },

    async removePost(_w, postId) {
      const { error } = await c.from('posts').update({ removed: true }).eq('id', postId);
      fail(error);
    },

    async setLifeStatus(_w, postId, status) {
      const { error } = await c.from('posts').update({ life_status: status }).eq('id', postId);
      fail(error);
    },

    async invite(w, i) {
      const email = i.email.trim().toLowerCase();
      const { data, error } = await c
        .from('wall_members')
        .insert({ tree_id: w.treeId, person_id: i.personId, person_name: i.personName, email, can_post: i.perms.post, can_photos: i.perms.photos, can_suggest: i.perms.suggest })
        .select('*')
        .single();
      if (error && /duplicate|unique/i.test(error.message)) throw new Error('That email has already been invited to this wall.');
      fail(error);
      const r = data as Row;
      return memberFrom({ ...r, member_id: r.id, is_me: false, online: false });
    },

    async updateMember(_w, memberId, patch) {
      const row: Row = {};
      if (patch.perms) Object.assign(row, { can_post: patch.perms.post, can_photos: patch.perms.photos, can_suggest: patch.perms.suggest });
      if (patch.status) row.status = patch.status;
      const { error } = await c.from('wall_members').update(row).eq('id', memberId);
      fail(error);
    },

    async cancelInvite(_w, memberId) {
      const { error } = await c.from('wall_members').delete().eq('id', memberId).eq('status', 'pending');
      fail(error);
    },

    async accept(inv, s, birthday, location) {
      await must();
      const { error } = await c.rpc('accept_invite', sharingArgs(inv.memberId, s, birthday, location));
      fail(error);
    },

    async setSharing(w, s, birthday, location) {
      if (!w.memberId) return;
      const { error } = await c.rpc('set_my_sharing', sharingArgs(w.memberId, s, birthday, location));
      fail(error);
    },

    async leave(w) {
      const { error } = await c.rpc('leave_wall', { member: w.memberId });
      fail(error);
    },

    async rejoin(w) {
      const { error } = await c.rpc('rejoin_wall', { member: w.memberId });
      fail(error);
    },

    async touch(w) {
      await c.rpc('touch_wall', { t: w.treeId });
    },

    subscribe(w, onChange) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const soon = () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 400);
      };
      const ch = c
        .channel(`wall-${w.treeId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `tree_id=eq.${w.treeId}` }, soon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `tree_id=eq.${w.treeId}` }, soon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `tree_id=eq.${w.treeId}` }, soon)
        .subscribe();
      return () => {
        clearTimeout(timer);
        c.removeChannel(ch);
      };
    },
  };
}

function sharingArgs(member: string, s: Sharing, birthday: string, location: string) {
  return {
    member,
    s_status: s.status,
    s_photos: s.photos,
    s_birthday: s.birthday,
    s_location: s.location,
    s_contact: s.contact,
    my_birthday: s.birthday ? birthday : '',
    my_location: s.location ? location : '',
  };
}

export type { Permissions };
