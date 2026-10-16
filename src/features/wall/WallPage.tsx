// The Family Wall: a private, Facebook-style feed for invited living relatives.

import { useEffect, useMemo, useRef, useState } from 'react';
import { titlePhrase } from '../../lib/kinship';
import { useData } from '../../data/store';
import { setUi, useUi } from '../../data/ui';
import { openProfile } from '../../data/actions';
import { treeApi } from '../../lib/family';
import {
  approveLife,
  cancelInvite,
  currentWall,
  declineLife,
  leaveWall,
  myWallName,
  openWallFeed,
  rejoinWall,
  removeMember,
  removePost,
  sendComment,
  sendPost,
  setMemberPerms,
  setMySharing,
  setPostHidden,
  startWall,
  toggleLike,
  useWall,
  type Draft,
} from '../../wall/store';
import { LIFE_TO_FACT, LIFE_TYPES, type Sharing, type WallMember, type WallPost } from '../../wall/types';
import { Avatar, Icon, Seg, Switch } from '../../components/ui';
import { toWallRecipe, WallRecipeCard } from './ShareRecipe';
import { DateInput } from '../../components/DateInput';
import { ConnectWall } from './Connect';

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'Yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/** A person's round photo if they're in the open tree, otherwise their initials. */
function WhoAv({ personId, name, size = 'sm' }: { personId?: string; name: string; size?: '' | 'sm' | 'xs' }) {
  const has = useData((s) => !!personId && s.data.people.some((p) => p.id === personId));
  if (has) return <Avatar pid={personId!} size={size} />;
  return (
    <span className={'av' + (size ? ' ' + size : '')} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function WallPage() {
  const mode = useWall((s) => s.mode);
  const error = useWall((s) => s.error);
  const treeId = useData((s) => s.treeId);
  const account = useData((s) => s.account);
  useEffect(() => {
    startWall();
  }, [treeId, account?.id]);

  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">Home</h1>
            <p className="lede">Your Family Wall — a private space for invited living relatives. Nothing here is ever public.</p>
          </div>
          <div className="spacer" />
          {mode === 'ready' && <HeadActions />}
        </div>
        {mode === 'loading' && <div className="empty">Opening the Family Wall…</div>}
        {mode === 'off' && <WallOff />}
        {mode === 'connect' && <ConnectWall />}
        {mode === 'error' && (
          <div className="card" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="strong">The Family Wall couldn’t open.</span>
            <span className="muted">{error}</span>
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => startWall(true)}>
              Try again
            </button>
          </div>
        )}
        {mode === 'ready' && <WallReady />}
      </div>
    </div>
  );
}

function WallOff() {
  const prefs = useData((s) => s.prefs);
  const name = useData((s) => s.account?.name || '');
  const data = useData((s) => s.data);
  const sample = prefs.trees.find((t) => t.sample);
  const self = data.settings.self_person;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2">Welcome{name ? `, ${name}` : ''}</h2>
        <p style={{ margin: 0 }}>
          This is where your Family Wall lives: news, photos and life events from invited relatives. It switches on when the app is connected to the online service. Your
          tree, profiles, stories and recipes all work on this computer in the meantime.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => setUi({ section: 'tree' })}>
            <Icon name="tree" sm />
            Open my tree
          </button>
          {self && data.people.some((p) => p.id === self) && (
            <button className="btn" onClick={() => openProfile(self)}>
              <Icon name="people" sm />
              My profile
            </button>
          )}
          <button className="btn" onClick={() => setUi({ section: 'home' })}>
            <Icon name="charts" sm />
            Overview
          </button>
        </div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="h3">See what the Family Wall will look like</h2>
        <p className="muted" style={{ margin: 0 }}>
          The sample tree has a demo wall with posts, comments, life events and members you can try.
        </p>
        <button
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={async () => {
            const { openSample } = await import('../FirstRun');
            await openSample();
            setUi({ section: 'wall' });
          }}
        >
          {sample ? 'See the wall in the sample tree' : 'Try the wall with the sample tree'}
        </button>
      </div>
    </div>
  );
}

function HeadActions() {
  const w = useWall((s) => s.walls.find((x) => x.treeId === s.wallId));
  if (!w?.isOwner) return null;
  return (
    <button className="btn primary" onClick={() => setUi({ modal: { kind: 'wallInvite' } })}>
      <Icon name="plus" sm />
      Invite a relative
    </button>
  );
}

function WallReady() {
  const s = useWall();
  const tab = useUi((u) => u.wtab);
  const w = s.walls.find((x) => x.treeId === s.wallId);
  const isSample = useData((d) => d.data.settings.is_sample === '1');
  const accepted = s.members.filter((m) => m.status === 'accepted');
  const pendingLife = s.posts.filter((p) => p.lifeStatus === 'pending' && !p.removed);
  const me = s.members.find((m) => m.isMe);
  const tabs: [typeof tab, string][] = [
    ['feed', 'Feed'],
    ['members', `Members · ${accepted.length}`],
    w?.isOwner ? ['mod', `Moderation${pendingLife.length ? ' · ' + pendingLife.length : ''}`] : ['mine', 'My wall settings'],
  ];
  const cur = tabs.some(([k]) => k === tab) ? tab : 'feed';

  return (
    <>
      {isSample && (
        <div className="privacy-note" role="note">
          <Icon name="wall" />
          <span>This is a demo wall for the sample tree, so you can try everything. Nothing here is sent anywhere.</span>
        </div>
      )}
      {s.invites.map((inv) => (
        <div key={inv.memberId} className="card invite-banner">
          <Icon name="wall" />
          <span style={{ flex: 1 }}>
            <span className="strong">{inv.ownerName || 'A relative'}</span> invited you to the <span className="strong">{inv.treeName}</span> Family Wall.
          </span>
          <button className="btn primary sm" onClick={() => setUi({ modal: { kind: 'wallAccept', invite: inv } })}>
            View invitation
          </button>
        </div>
      ))}
      {s.walls.length > 1 && (
        <div className="row" role="group" aria-label="Choose a wall">
          <span className="muted strong">Wall:</span>
          {s.walls.map((x) => (
            <button key={x.treeId} className={'chip' + (x.treeId === s.wallId ? ' on' : '')} aria-pressed={x.treeId === s.wallId} onClick={() => openWallFeed(x.treeId)}>
              {x.name}
              {x.isOwner ? ' (yours)' : x.ownerName ? ` (${x.ownerName})` : ''}
            </button>
          ))}
        </div>
      )}
      {!w ? (
        <div className="empty">No wall yet.</div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {tabs.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={cur === k} className={cur === k ? 'on' : ''} onClick={() => setUi({ wtab: k })}>
                {l}
              </button>
            ))}
          </div>
          {cur === 'feed' && <Feed />}
          {cur === 'members' && <Members />}
          {cur === 'mod' && <Moderation />}
          {cur === 'mine' && me && <MySettings me={me} />}
        </>
      )}
    </>
  );
}

// ---------- feed ----------

function Feed() {
  const s = useWall();
  const filter = useUi((u) => u.wfilter);
  const w = currentWall()!;
  const me = s.members.find((m) => m.isMe);
  const left = !w.isOwner && me?.status === 'left';
  const myId = s.backend?.me()?.id || '';
  const visible = s.posts.filter((p) => !p.removed && !s.hidden.includes(p.id));
  const posts = visible.filter(
    (p) =>
      filter === 'all' ||
      (filter === 'life' ? p.type === 'life' : filter === 'photo' ? p.type === 'photo' : filter === 'recipe' ? p.type === 'recipe' : p.authorId === myId || p.queued),
  );
  const queued = s.queue.length;
  const filters: [typeof filter, string][] = [
    ['all', 'All'],
    ['life', 'Life events'],
    ['photo', 'Photos'],
    ['recipe', 'Recipes'],
    ['mine', 'My posts'],
  ];
  return (
    <div className="wallwrap">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {!s.online && (
          <div className="offbar" role="status">
            <Icon name="offline" />
            <span style={{ flex: 1 }}>
              You’re offline. Showing posts saved on this computer{s.savedAt ? ` (${timeAgo(s.savedAt).toLowerCase()})` : ''}. New posts and comments will send when you reconnect.
            </span>
          </div>
        )}
        {s.online && queued > 0 && (
          <div className="privacy-note" role="status">
            Sending {queued} thing{queued === 1 ? '' : 's'} you wrote offline…
          </div>
        )}
        {left ? <div className="privacy-note">You’ve left this Family Wall. Rejoin from My wall settings to post again.</div> : <Composer />}
        <div className="row" role="group" aria-label="Show">
          {filters.map(([k, l]) => (
            <button
              key={k}
              className={'chip' + (filter === k ? ' on' : '')}
              aria-pressed={filter === k}
              style={{ minHeight: 36, padding: '0 14px' }}
              onClick={() => setUi({ wfilter: k })}
            >
              {l}
            </button>
          ))}
        </div>
        {s.hidden.length > 0 && (
          <div className="privacy-note">
            {s.hidden.length} post{s.hidden.length === 1 ? '' : 's'} hidden from your feed.{' '}
            {!w.isOwner && (
              <button className="link" onClick={() => setUi({ wtab: 'mine' })}>
                Manage
              </button>
            )}
          </div>
        )}
        {posts.map((p) => (
          <PostCard key={p.clientId || p.id} p={p} />
        ))}
        {!posts.length && (
          <div className="card empty">{s.loading ? 'Loading posts…' : filter === 'all' ? 'No posts yet. Say hello to the family!' : 'No posts match this filter yet.'}</div>
        )}
      </div>
      <Aside />
    </div>
  );
}

const emptyDraft = (): Draft => ({ type: 'text', body: '', photo: null, photoAlt: '', life: { type: 'New home', date: '', place: '' }, suggestForTree: true, tags: [] });

function Composer() {
  const w = currentWall()!;
  const s = useWall();
  const data = useData((d) => d.data);
  const T = treeApi(data);
  const [d, setD] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (d.photo ? URL.createObjectURL(d.photo) : ''), [d.photo]);
  const me = s.members.find((m) => m.isMe);
  const canPhoto = w.isOwner || !!me?.perms.photos;
  const name = myWallName(w);
  const accepted = s.members.filter((m) => m.status === 'accepted').length;
  // Owners tag people from their tree; members tag fellow members (they don't have the owner's tree).
  const tagOpts = w.isOwner
    ? T.peopleSorted().map((p) => ({ id: p.id, name: T.nm(p.id), label: `${p.surname}, ${p.given}` }))
    : s.members.filter((m) => m.status === 'accepted').map((m) => ({ id: m.personId, name: m.name, label: m.name }));
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const types: [Draft['type'], string][] = [
    ['text', 'Status update'],
    ...(canPhoto ? ([['photo', 'Photo']] as [Draft['type'], string][]) : []),
    ['life', 'Life event'],
    ['recipe', 'Recipe'],
  ];
  const myRecipes = data.recipes || [];

  return (
    <div className="card composer">
      <div className="post-head">
        <WhoAv personId={w.isOwner ? data.settings.self_person : me?.personId} name={name} />
        <span className="strong">Posting as {name}</span>
        <div className="spacer" />
        <Seg label="Post type" value={d.type} onChange={(t) => set({ type: t })} options={types} />
      </div>
      {d.type === 'life' && (
        <div className="frow" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <label className="fl">
            Life event
            <select value={d.life.type} onChange={(e) => set({ life: { ...d.life, type: e.target.value } })}>
              {LIFE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="fl">
            When
            <DateInput value={d.life.date} onChange={(v) => set({ life: { ...d.life, date: v } })} placeholder="e.g. Oct 2026" label="when it happened" />
          </label>
          <label className="fl">
            Where
            <input value={d.life.place} onChange={(e) => set({ life: { ...d.life, place: e.target.value } })} placeholder="Town, state" list="wall-places" />
            <datalist id="wall-places">
              {data.places.slice(0, 200).map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </label>
        </div>
      )}
      {d.type === 'recipe' && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {myRecipes.length ? (
            <label className="fl" style={{ flex: '1 1 260px' }}>
              Recipe from your family cookbook
              <select
                value={myRecipes.find((r) => r.title === d.recipe?.title)?.id || ''}
                onChange={(e) => {
                  const r = myRecipes.find((x) => x.id === e.target.value);
                  set({
                    recipe: r ? toWallRecipe(T, r) : null,
                    tags: r ? r.people.filter((p) => T.person[p] && (w.isOwner || tagOpts.some((o) => o.id === p))).map((p) => ({ id: p, name: T.nm(p) })) : d.tags,
                  });
                }}
              >
                <option value="">Choose a recipe…</option>
                {myRecipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="muted">Your family cookbook is empty.</span>
          )}
          <button className="btn" onClick={() => setUi({ modal: { kind: 'editRecipe' } })}>
            <Icon name="plus" sm />
            Write a new recipe
          </button>
        </div>
      )}
      <textarea
        value={d.body}
        onChange={(e) => set({ body: e.target.value })}
        placeholder={d.type === 'life' ? 'Tell the family what happened…' : d.type === 'recipe' ? 'Say something about it (optional)…' : 'Share an update with the family…'}
        aria-label="Post text"
      />
      {d.type === 'life' && !w.isOwner && (
        <label className="ck">
          <input type="checkbox" checked={d.suggestForTree} onChange={(e) => set({ suggestForTree: e.target.checked })} />
          Suggest adding this to the family tree (the owner approves it first)
        </label>
      )}
      {d.type === 'photo' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) set({ photo: f, photoAlt: d.photoAlt || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') });
              e.target.value = '';
            }}
          />
          {!d.photo ? (
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => fileRef.current?.click()}>
              <Icon name="media" sm />
              Choose a photo
            </button>
          ) : (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <img src={preview} alt="" className="cmp-photo" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 200 }}>
                <label className="fl">
                  Describe the photo <span className="muted">(helps people who use screen readers)</span>
                  <input value={d.photoAlt} onChange={(e) => set({ photoAlt: e.target.value })} />
                </label>
                <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ photo: null })}>
                  Remove photo
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <div className="row">
        <select
          value=""
          onChange={(e) => {
            const o = tagOpts.find((x) => x.id === e.target.value);
            if (o && !d.tags.some((t) => t.id === o.id)) set({ tags: [...d.tags, { id: o.id, name: o.name }] });
          }}
          aria-label="Tag a relative"
          style={{ width: 240 }}
        >
          <option value="">Tag a relative…</option>
          {tagOpts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {d.tags.map((t) => (
          <button key={t.id} className="chip person" onClick={() => set({ tags: d.tags.filter((x) => x.id !== t.id) })} aria-label={`Remove tag ${t.name}`}>
            {t.name} ×
          </button>
        ))}
      </div>
      <div className="row">
        <span className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon name="lock" sm />
          Only {w.isOwner ? `the ${accepted} accepted member${accepted === 1 ? '' : 's'} and you` : 'the wall’s members'} can see this
        </span>
        <div className="spacer" />
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await sendPost(d);
            setBusy(false);
            if (ok) {
              setD(emptyDraft());
              setUi({ wfilter: 'all' });
            }
          }}
        >
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

function PostCard({ p }: { p: WallPost }) {
  const s = useWall();
  const w = currentWall()!;
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const author = s.members.find((m) => m.id === p.authorMemberId);
  const isMine = p.authorId === s.backend?.me()?.id;
  const ownerSelf = useData((d) => d.data.settings.self_person);
  const authorPid = p.authorMemberId ? author?.personId : w.isOwner ? ownerSelf : undefined;
  const lifeStatus = p.life
    ? p.lifeStatus === 'pending'
      ? 'Waiting for the owner to approve it for the tree'
      : p.lifeStatus === 'approved'
        ? '✓ Added to the family tree'
        : ''
    : '';
  const comments = showAll ? p.comments : p.comments.slice(-3);
  const send = () => {
    sendComment(p.id, draft);
    setDraft('');
  };
  const inTree = (id: string) => useData.getState().data.people.some((x) => x.id === id);
  return (
    <article className={'card post' + (p.queued ? ' queued' : '')} aria-label={`Post by ${p.authorName}`}>
      <div className="post-head">
        <WhoAv personId={authorPid} name={p.authorName} size="" />
        <div>
          {authorPid && inTree(authorPid) ? (
            <button className="link" style={{ color: 'var(--text)' }} onClick={() => openProfile(authorPid)}>
              {p.authorName}
            </button>
          ) : (
            <span className="strong">{p.authorName}</span>
          )}
          <div className="muted small">
            {p.authorMemberId ? 'Wall member' : 'Tree owner'} · {p.queued ? 'Waiting to send' : timeAgo(p.createdAt)}
          </div>
        </div>
        <div className="spacer" />
        {!p.queued && !isMine && (
          <button className="btn sm ghost" onClick={() => setPostHidden(p.id, true)}>
            Hide
          </button>
        )}
        {!p.queued && w.isOwner && (
          <button
            className="btn sm ghost danger"
            onClick={() =>
              setUi({
                modal: {
                  kind: 'confirm',
                  title: 'Remove this post?',
                  body: 'It will be taken off the wall for everyone.',
                  action: 'Remove post',
                  danger: true,
                  onConfirm: () => removePost(p.id),
                },
              })
            }
          >
            Remove
          </button>
        )}
      </div>
      {p.life && (
        <div className="life">
          <Icon name="star" />
          <div>
            <div className="life-t">{p.life.type}</div>
            <div className="small">{[p.life.date, p.life.place].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="spacer" />
          {lifeStatus && <span className={'conf ' + (p.lifeStatus === 'approved' ? 'conf-proven' : 'conf-probable')}>{lifeStatus}</span>}
        </div>
      )}
      {p.body && <p className="post-text">{p.body}</p>}
      {p.type === 'recipe' && <WallRecipeCard p={p} />}
      {p.type === 'photo' &&
        (p.photoUrl ? (
          <img className="post-img" src={p.photoUrl} alt={p.photoAlt || `Photo shared by ${p.authorName}`} loading="lazy" />
        ) : p.photoScene ? (
          <div className={'post-photo scene ' + p.photoScene} role="img" aria-label={p.photoAlt} />
        ) : (
          <div className="post-photo nophoto">{s.online ? 'Loading photo…' : 'The photo will show when you’re back online'}</div>
        ))}
      {p.tags.length > 0 && (
        <div className="chips">
          <span className="muted small">With</span>
          {p.tags.map((t) =>
            inTree(t.id) ? (
              <button key={t.id} className="chip person" onClick={() => openProfile(t.id)}>
                {t.name}
              </button>
            ) : (
              <span key={t.id} className="chip person">
                {t.name}
              </span>
            ),
          )}
        </div>
      )}
      <div className="post-actions">
        <button className={'react' + (p.likedByMe ? ' on' : '')} onClick={() => toggleLike(p.id)} aria-pressed={p.likedByMe} disabled={p.queued}>
          <svg className="ico sm" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
          </svg>
          {p.likedByMe ? 'Liked' : 'Like'} · {p.likes}
        </button>
        <span className="muted small">
          {p.comments.length} comment{p.comments.length === 1 ? '' : 's'}
        </span>
      </div>
      {!p.queued && (
        <div className="comments">
          {p.comments.length > 3 && !showAll && (
            <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(true)}>
              Show all {p.comments.length} comments
            </button>
          )}
          {comments.map((c) => (
            <div key={c.clientId || c.id} className={'comment' + (c.queued ? ' queued' : '')}>
              <span className="strong">{c.authorName}</span> {c.body}
              {c.queued && <span className="muted small"> · waiting to send</span>}
            </div>
          ))}
          <div className="cbox">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Write a comment…"
              aria-label={`Write a comment on ${p.authorName}’s post`}
            />
            <button className="btn sm" onClick={send} disabled={!draft.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Aside() {
  const s = useWall();
  const w = currentWall()!;
  const accepted = s.members.filter((m) => m.status === 'accepted');
  const pending = s.members.filter((m) => m.status === 'pending');
  const bdays = accepted
    .filter((m) => m.sharing.birthday && m.birthday)
    .map((m) => ({ m, days: daysUntil(m.birthday) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);
  const online = accepted.filter((m) => m.online && !m.isMe);
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="card">
        <h2 className="h3" style={{ marginBottom: 8 }}>
          Upcoming birthdays
        </h2>
        <div className="list">
          {bdays.map(({ m, days }) => (
            <MemberLi key={m.id} m={m} sub={days === 0 ? 'Today 🎂' : days === 1 ? 'Tomorrow' : m.birthday} />
          ))}
          {!bdays.length && <span className="small muted">No birthdays shared yet.</span>}
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Only members who share their birthday appear here.
        </p>
      </section>
      <section className="card">
        <h2 className="h3" style={{ marginBottom: 8 }}>
          Members online
        </h2>
        <div className="list">
          {online.map((m) => (
            <MemberLi key={m.id} m={m} sub="Online now" dot />
          ))}
          {!online.length && <span className="small muted">Nobody else is online right now.</span>}
        </div>
      </section>
      {w.isOwner && (
        <section className="card">
          <h2 className="h3" style={{ marginBottom: 8 }}>
            Pending invitations
          </h2>
          <div className="list">
            {pending.map((m) => (
              <div key={m.id} className="li" style={{ flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>
                  <span className="li-t">{m.name}</span>
                  <span className="li-s">Invited {timeAgo(m.invitedAt).toLowerCase()}</span>
                </span>
                {s.backend?.kind === 'demo' && (
                  <button
                    className="btn sm"
                    onClick={() =>
                      setUi({
                        modal: {
                          kind: 'wallAccept',
                          preview: true,
                          invite: { memberId: m.id, treeId: w.treeId, treeName: w.name, ownerName: w.ownerName, personName: m.name, invitedAt: m.invitedAt },
                        },
                      })
                    }
                  >
                    Preview their welcome
                  </button>
                )}
              </div>
            ))}
            {!pending.length && <span className="small muted">No invitations waiting.</span>}
          </div>
        </section>
      )}
      <div className="privacy-note">
        <Icon name="lock" />
        <span>Deceased relatives can be shared freely. Living relatives stay private unless they opt in, and can change their mind any time.</span>
      </div>
    </aside>
  );
}

function MemberLi({ m, sub, dot }: { m: WallMember; sub: string; dot?: boolean }) {
  const inTree = useData((d) => d.data.people.some((p) => p.id === m.personId));
  return (
    <button className="li" onClick={() => inTree && openProfile(m.personId)} disabled={!inTree} style={{ cursor: inTree ? 'pointer' : 'default' }}>
      <WhoAv personId={m.personId} name={m.name} size="xs" />
      <span>
        <span className="li-t">{m.name}</span>
        <span className="li-s">{sub}</span>
      </span>
      {dot && <span className="dot" style={{ marginLeft: 'auto' }} aria-label="online" />}
    </button>
  );
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function daysUntil(dm: string): number {
  const m = dm.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  if (!m) return 999;
  const mi = MON.findIndex((x) => x.toLowerCase() === m[2].slice(0, 3).toLowerCase());
  if (mi < 0) return 999;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(now.getFullYear(), mi, +m[1]);
  if (d < today) d = new Date(now.getFullYear() + 1, mi, +m[1]);
  return Math.round((d.getTime() - today.getTime()) / 864e5);
}

// ---------- members ----------

const permLabel = (m: WallMember) => [m.perms.post && 'Post', m.perms.photos && 'Add photos', m.perms.suggest && 'Suggest edits'].filter(Boolean).join(' · ') || 'View only';
const shareLabel = (s: Sharing) =>
  [s.status && 'Status', s.photos && 'Photos', s.birthday && 'Birthday', s.location && 'Town', s.contact && 'Contact'].filter(Boolean).join(' · ') || 'Nothing shared yet';

function Members() {
  const s = useWall();
  const w = currentWall()!;
  const [editing, setEditing] = useState<string | null>(null);
  const list = s.members.filter((m) => m.status === 'accepted' || (w.isOwner && m.status === 'pending'));
  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Relative</th>
            <th>Can</th>
            <th>Shares</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => (
            <tr key={m.id}>
              <td>
                <span className="namecell">
                  <WhoAv personId={m.personId} name={m.name} size="xs" />
                  <span>
                    {m.name}
                    {m.isMe ? ' (you)' : ''}
                    <KinTag pid={m.personId} />
                    {m.email && (
                      <span className="li-s" style={{ fontWeight: 400 }}>
                        {m.email}
                      </span>
                    )}
                    {m.location && <span className="li-s">{m.location}</span>}
                  </span>
                </span>
              </td>
              <td className="small">
                {editing === m.id && w.isOwner ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(['post', 'photos', 'suggest'] as const).map((k) => (
                      <label key={k} className="ck">
                        <input type="checkbox" checked={m.perms[k]} onChange={(e) => setMemberPerms(m.id, { ...m.perms, [k]: e.target.checked })} />
                        {k === 'post' ? 'Post' : k === 'photos' ? 'Add photos' : 'Suggest edits'}
                      </label>
                    ))}
                  </div>
                ) : (
                  permLabel(m)
                )}
              </td>
              <td className="small">{m.status === 'accepted' ? shareLabel(m.sharing) : 'Chooses when they accept'}</td>
              <td>
                <span className={'conf ' + (m.status === 'accepted' ? 'conf-proven' : 'conf-probable')}>{m.status === 'accepted' ? '✓ Wall member' : '~ Invite pending'}</span>
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {m.status === 'accepted' && !m.isMe && m.userId && (
                  <button
                    className="btn sm"
                    onClick={async () => {
                      const { messagePeople, startMessages } = await import('../../messages/store');
                      await startMessages();
                      if (await messagePeople([m.userId!])) setUi({ section: 'messages' });
                    }}
                  >
                    <Icon name="message" sm />
                    Message
                  </button>
                )}
                {w.isOwner && !m.isMe && (
                  <>
                    {m.status === 'accepted' && (
                      <button className="btn sm ghost" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                        {editing === m.id ? 'Done' : 'Change'}
                      </button>
                    )}
                    <button
                      className="btn sm ghost danger"
                      onClick={() =>
                        setUi({
                          modal: {
                            kind: 'confirm',
                            title: m.status === 'pending' ? 'Cancel this invitation?' : `Remove ${m.name} from the wall?`,
                            body:
                              m.status === 'pending'
                                ? `${m.name} won’t be able to join with this invitation.`
                                : `${m.name} won’t see the wall any more. Their posts stay unless you remove them.`,
                            action: m.status === 'pending' ? 'Cancel invitation' : 'Remove',
                            danger: true,
                            onConfirm: () => (m.status === 'pending' ? cancelInvite(m.id) : removeMember(m.id, m.name)),
                          },
                        })
                      }
                    >
                      {m.status === 'pending' ? 'Cancel' : 'Remove'}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={5} className="muted">
                {w.isOwner ? 'Nobody yet. Use “Invite a relative” to bring family in.' : 'No members yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- moderation (owner) ----------

function Moderation() {
  const s = useWall();
  const pending = s.posts.filter((p) => p.lifeStatus === 'pending' && !p.removed);
  const all = s.posts.filter((p) => !p.removed && !p.queued);
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="card">
        <h2 className="h2" style={{ marginBottom: 4 }}>
          Life events waiting for approval
        </h2>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          Approving adds a fact to the member’s profile in your tree, cited to their wall post.
        </p>
        {pending.map((p) => {
          const m = s.members.find((x) => x.id === p.authorMemberId);
          return (
            <div key={p.id} className="fact-box" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              <div className="post-head">
                <WhoAv personId={m?.personId} name={p.authorName} />
                <div>
                  <span className="strong">{p.authorName}</span>
                  <div className="muted small">{timeAgo(p.createdAt)}</div>
                </div>
              </div>
              <div className="strong">{[p.life?.type, p.life?.date, p.life?.place].filter(Boolean).join(' · ')}</div>
              {p.body && <div>{p.body}</div>}
              <div className="muted small">
                Will be added to {m?.name || 'them'} as: {LIFE_TO_FACT[p.life?.type || ''] || 'Family event'} (~ Probable)
              </div>
              <div className="row">
                <button className="btn primary sm" onClick={() => approveLife(p)}>
                  Approve for the tree
                </button>
                <button className="btn sm" onClick={() => declineLife(p)}>
                  Keep on the wall only
                </button>
              </div>
            </div>
          );
        })}
        {!pending.length && <div className="empty">Nothing waiting for approval.</div>}
      </section>
      <section className="card">
        <h2 className="h2" style={{ marginBottom: 12 }}>
          All posts
        </h2>
        <div className="list">
          {all.map((p) => (
            <div key={p.id} className="li">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="li-t">
                  {p.authorName} ·{' '}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {timeAgo(p.createdAt)}
                  </span>
                </span>
                <span className="li-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                  {p.body || (p.type === 'photo' ? 'Photo' : p.type === 'recipe' ? 'Recipe: ' + (p.recipe?.title || '') : '')}
                </span>
              </span>
              <button className="btn sm ghost danger" onClick={() => removePost(p.id)}>
                Remove
              </button>
            </div>
          ))}
          {!all.length && <span className="muted small">No posts yet.</span>}
        </div>
      </section>
    </div>
  );
}

// ---------- my wall settings (members) ----------

export const SHARE_ITEMS: [keyof Sharing, string, string][] = [
  ['status', 'Status updates', 'Your posts appear in the feed for everyone on the wall'],
  ['photos', 'Photos', 'Photos you add can be shown on the family tree'],
  ['birthday', 'Birthday', 'Your day and month appear in Upcoming birthdays'],
  ['location', 'Town', 'Your town appears on your profile and the map'],
  ['contact', 'Contact details', 'Members can see your email address'],
];

function MySettings({ me }: { me: WallMember }) {
  const s = useWall();
  const [sh, setSh] = useState<Sharing>(me.sharing);
  const [bday, setBday] = useState(me.birthday || myBirthday());
  const [town, setTown] = useState(me.location || myTown());
  const hiddenPosts = s.posts.filter((p) => s.hidden.includes(p.id));
  const changed = JSON.stringify(sh) !== JSON.stringify(me.sharing) || (sh.birthday && bday !== me.birthday) || (sh.location && town !== me.location);
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 className="h2">What I share</h2>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          Change these any time. Nothing is shared unless it’s switched on.
        </p>
        {SHARE_ITEMS.map(([k, l, sub]) => (
          <div key={k} className="toggle">
            <span style={{ flex: 1 }}>
              <span className="li-t">{l}</span>
              <span className="li-s">{sub}</span>
              {k === 'birthday' && sh.birthday && (
                <input
                  value={bday}
                  onChange={(e) => setBday(e.target.value)}
                  placeholder="e.g. 14 Mar"
                  aria-label="Your birthday (day and month)"
                  style={{ maxWidth: 160, marginTop: 6 }}
                />
              )}
              {k === 'location' && sh.location && (
                <input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Your town" aria-label="Your town" style={{ maxWidth: 260, marginTop: 6 }} />
              )}
            </span>
            <Switch on={sh[k]} onToggle={() => setSh({ ...sh, [k]: !sh[k] })} label={l} />
          </div>
        ))}
        <button className="btn primary" style={{ alignSelf: 'flex-start', marginTop: 8 }} disabled={!changed} onClick={() => setMySharing(sh, bday, town)}>
          Save
        </button>
      </section>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="h2">Hidden posts</h2>
        {hiddenPosts.map((p) => (
          <div key={p.id} className="li">
            <span style={{ flex: 1 }}>{(p.body || 'Photo').slice(0, 80)}</span>
            <button className="btn sm" onClick={() => setPostHidden(p.id, false)}>
              Show again
            </button>
          </div>
        ))}
        <p className="muted small" style={{ margin: 0 }}>
          Posts you hide only disappear from your own feed.
        </p>
        <div className="dd-sep" />
        <h2 className="h3">Leave the Family Wall</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Your posts are removed and your details become private again.
        </p>
        {me.status === 'left' ? (
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => rejoinWall()}>
            Rejoin the wall
          </button>
        ) : (
          <button
            className="btn danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              setUi({
                modal: {
                  kind: 'confirm',
                  title: 'Leave the Family Wall?',
                  body: 'Your posts and comments are removed and your details become private again. You can rejoin later.',
                  action: 'Leave the wall',
                  danger: true,
                  onConfirm: () => leaveWall(),
                },
              })
            }
          >
            Leave the wall
          </button>
        )}
      </section>
    </div>
  );
}

/** Your day and month of birth, from your own profile in your tree. */
export function myBirthday(): string {
  const { data } = useData.getState();
  const T = treeApi(data);
  const self = data.settings.self_person;
  const b = self ? T.ff(self, 'Birth') : undefined;
  const m = b?.date.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  return m ? `${+m[1]} ${m[2]}` : '';
}

/** Your town, from the latest residence on your profile. */
export function myTown(): string {
  const { data } = useData.getState();
  const T = treeApi(data);
  const self = data.settings.self_person;
  if (!self) return '';
  const r = [...T.factsOf(self)].reverse().find((f) => f.type === 'Residence' && f.placeId);
  return r ? T.placeName(r.placeId).split(',')[0] : '';
}

/** "Your cousin" next to a member's name, when they're in your tree. */
function KinTag({ pid }: { pid: string }) {
  const data = useData((d) => d.data);
  const T = treeApi(data);
  const phrase = pid && T.person[pid] ? titlePhrase(T, pid) : '';
  return phrase && phrase !== 'You' ? <span className="li-s kin-line">{phrase}</span> : null;
}
