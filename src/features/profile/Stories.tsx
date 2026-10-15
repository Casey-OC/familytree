// Life stories (written by you or by family) and the Timeline that weaves them in with events.

import { useState } from 'react';
import { useData } from '../../data/store';
import { setUi } from '../../data/ui';
import { deleteStory, isMyStory, openMedia, openPerson, openPlace, openProfile, saveStory, setStoryStatus } from '../../data/actions';
import { treeApi, type TreeApi } from '../../lib/family';
import { dateLabel } from '../../lib/dates';
import { ageBetween } from '../../lib/ages';
import { storiesAbout, storyPreview, storyYear, timeline } from '../../lib/stories';
import type { Story } from '../../lib/types';
import { DateInput } from '../../components/DateInput';
import { Avatar, Conf, Icon, ModalFrame, PlaceInput } from '../../components/ui';
import { MediaThumb } from '../media/MediaThumb';

const writtenOn = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "aged 34" at the time of a story, worked out from its date or its event. */
function storyAge(T: TreeApi, pid: string, s: Story) {
  const birth = T.ff(pid, 'Birth');
  const fact = s.factId ? T.data.facts.find((f) => f.id === s.factId) : undefined;
  const when = s.date || fact?.date || '';
  if (!birth || !when) return '';
  const a = ageBetween(birth.date, when, birth.q, fact && !s.date ? fact.q : 'exact');
  if (!a) return '';
  if (a.years === 0) return a.months !== undefined ? `aged ${a.months} month${a.months === 1 ? '' : 's'}` : 'aged under 1';
  return `aged ${a.approx ? 'about ' : ''}${a.years}`;
}

export function StoryCard({ T, pid, s, canManage, compact }: { T: TreeApi; pid: string; s: Story; canManage: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const fact = s.factId ? T.data.facts.find((f) => f.id === s.factId) : undefined;
  const status = s.people[pid];
  const mine = isMyStory(s);
  const others = Object.keys(s.people).filter((x) => x !== pid && T.person[x] && s.people[x] !== 'hidden');
  const prev = storyPreview(s.body, compact ? 180 : 600);
  const when = s.date || (fact ? dateLabel(fact) : '');
  const age = storyAge(T, pid, s);
  return (
    <article className={'story' + (compact ? ' compact' : '') + (status === 'hidden' ? ' dim' : '')} aria-labelledby={'st-' + s.id}>
      <div className="story-top">
        <span className="badge story-badge">
          <Icon name="sources" sm /> Story
        </span>
        <span className="small muted">{[when, age, T.placeName(s.placeId)].filter(Boolean).join(' · ')}</span>
      </div>
      <h3 className="h3 story-title" id={'st-' + s.id}>
        {s.title || 'Untitled story'}
      </h3>
      {fact && (
        <span className="small">
          About: <span className="strong">{fact.type}</span> {dateLabel(fact)}
        </span>
      )}
      {s.body && <div className="story-body">{open ? s.body : prev.text}</div>}
      {s.body && prev.more && (
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Show less' : 'Read the whole story'}
        </button>
      )}
      {s.mediaIds.length > 0 && (
        <div className="story-photos">
          {s.mediaIds
            .map((id) => T.media[id])
            .filter(Boolean)
            .slice(0, compact ? 3 : 8)
            .map((m) => (
              <button key={m.id} className="pf-mini-tile" onClick={() => openMedia(m.id)} aria-label={m.title}>
                <MediaThumb m={m} tag={false} />
              </button>
            ))}
        </div>
      )}
      {others.length > 0 && (
        <span className="small">
          Also about:{' '}
          {others.map((x, i) => (
            <span key={x}>
              {i > 0 && ', '}
              <button className="link small" onClick={() => openProfile(x, 'stories')}>
                {T.nm(x)}
              </button>
            </span>
          ))}
        </span>
      )}
      <div className="story-foot">
        <span className="small muted">
          Written by {s.author || 'you'}
          {writtenOn(s.createdAt) && ` · ${writtenOn(s.createdAt)}`}
          {s.updatedAt && s.updatedAt !== s.createdAt && writtenOn(s.updatedAt) !== writtenOn(s.createdAt) ? ` · edited ${writtenOn(s.updatedAt)}` : ''}
        </span>
        <div className="row">
          {status === 'pending' &&
            (canManage ? (
              <>
                <button className="btn sm primary" onClick={() => setStoryStatus(s.id, pid, 'shown')}>
                  Show on profile
                </button>
                <button className="btn sm" onClick={() => setStoryStatus(s.id, pid, 'hidden')}>
                  Hide
                </button>
              </>
            ) : (
              <span className="small muted">Waiting for {T.first(pid)} to approve</span>
            ))}
          {status === 'hidden' && canManage && (
            <button className="btn sm" onClick={() => setStoryStatus(s.id, pid, 'shown')}>
              Show again
            </button>
          )}
          {status === 'shown' && canManage && !mine && (
            <button className="btn sm ghost" onClick={() => setStoryStatus(s.id, pid, 'hidden')}>
              Hide from this profile
            </button>
          )}
          {mine && (
            <>
              <button className="btn sm ghost" onClick={() => setUi({ modal: { kind: 'story', pid, id: s.id } })}>
                <Icon name="edit" sm />
                Edit
              </button>
              <button
                className="btn sm ghost"
                onClick={() =>
                  setUi({
                    modal: {
                      kind: 'confirm',
                      title: 'Delete this story?',
                      body: `“${s.title || 'Untitled story'}” will be removed from everyone’s profile and timeline. This can’t be undone (except by restoring a backup).`,
                      action: 'Delete story',
                      danger: true,
                      onConfirm: () => deleteStory(s.id),
                    },
                  })
                }
              >
                <Icon name="trash" sm />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function StoriesTab({ T, pid, canManage, isSelf }: { T: TreeApi; pid: string; canManage: boolean; isSelf: boolean }) {
  const d = T.data;
  const byYear = (a: Story, b: Story) => (storyYear(d, a) ?? 99999) - (storyYear(d, b) ?? 99999);
  const shown = storiesAbout(d, pid).sort(byYear);
  const pending = storiesAbout(d, pid, 'pending');
  const hidden = storiesAbout(d, pid, 'hidden');
  const first = isSelf ? 'you' : T.first(pid);
  return (
    <div className="pf-stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 640 }}>
          <h2 className="h3">Life stories</h2>
          <span className="muted">
            Memories and stories about {first}, written by {isSelf ? 'you and your family' : 'anyone in the family'}. Each story sits in the timeline at its date or with the event
            it’s about.
          </span>
        </div>
        <button className="btn primary" onClick={() => setUi({ modal: { kind: 'story', pid } })}>
          <Icon name="plus" sm />
          Write a story
        </button>
      </div>
      {pending.length > 0 && (
        <section className="card pf-card" aria-labelledby="st-pending">
          <h2 className="h3" id="st-pending">
            Waiting for approval
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            Family wrote {pending.length === 1 ? 'a story' : 'these stories'} about {first}. {canManage ? 'Choose whether each one shows on the profile.' : ''}
          </p>
          {pending.map((s) => (
            <StoryCard key={s.id} T={T} pid={pid} s={s} canManage={canManage} />
          ))}
        </section>
      )}
      {shown.length ? (
        shown.map((s) => <StoryCard key={s.id} T={T} pid={pid} s={s} canManage={canManage} />)
      ) : (
        <div className="empty">
          No stories yet. Write about a day you remember, how {first === 'you' ? 'you' : 'they'} met someone, where {first === 'you' ? 'you' : 'they'} worked — anything worth
          keeping.
          <button className="btn primary sm" onClick={() => setUi({ modal: { kind: 'story', pid } })}>
            Write the first story
          </button>
        </div>
      )}
      {hidden.length > 0 && canManage && (
        <section aria-labelledby="st-hidden" className="pf-stack" style={{ gap: 10 }}>
          <h2 className="h3" id="st-hidden">
            Hidden from this profile
          </h2>
          {hidden.map((s) => (
            <StoryCard key={s.id} T={T} pid={pid} s={s} canManage={canManage} compact />
          ))}
        </section>
      )}
    </div>
  );
}

export function TimelineTab({ T, pid, canManage }: { T: TreeApi; pid: string; canManage: boolean }) {
  const items = timeline(T, T.data, pid);
  return (
    <section className="card pf-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="h3">Timeline</h2>
        <div className="row">
          <button className="btn sm" onClick={() => setUi({ modal: { kind: 'story', pid } })}>
            <Icon name="plus" sm />
            Write a story
          </button>
          <button className="btn sm" onClick={() => openPerson(pid)}>
            <Icon name="edit" sm />
            Edit facts
          </button>
        </div>
      </div>
      {items.length ? (
        <ol className="pf-life">
          {items.map((it) =>
            it.kind === 'fact' ? (
              <li key={it.fact.id}>
                <span className="pf-life-date">
                  {dateLabel(it.fact) || 'Date unknown'}
                  {T.ageAt(pid, it.fact) && <span className="pf-life-age">{T.ageAt(pid, it.fact)}</span>}
                </span>
                <span className="pf-life-body">
                  <span className="strong">{it.fact.type}</span>
                  {it.fact.placeId && (
                    <span>
                      {' · '}
                      <button className="link" onClick={() => openPlace(it.fact.placeId)}>
                        {T.placeName(it.fact.placeId)}
                      </button>
                    </span>
                  )}
                  {it.fact.homePlaceId && (
                    <span className="small">
                      {' · '}
                      {it.fact.type === 'Birth' ? 'family home' : 'home'}: {T.placeName(it.fact.homePlaceId)}
                    </span>
                  )}
                  {it.fact.desc && <span className="small"> — {it.fact.desc}</span>}
                  <span className="small muted"> · {it.fact.citeIds.length ? `${it.fact.citeIds.length} source${it.fact.citeIds.length === 1 ? '' : 's'}` : 'No sources yet'}</span>
                </span>
                <Conf c={T.conf(it.fact)} />
              </li>
            ) : (
              <li key={'s' + it.story.id} className="pf-life-story">
                <span className="pf-life-date">
                  {it.story.date || (it.story.factId ? '' : it.year ? String(it.year) : 'Undated')}
                  {storyAge(T, pid, it.story) && it.story.date && <span className="pf-life-age">{storyAge(T, pid, it.story)}</span>}
                </span>
                <StoryCard T={T} pid={pid} s={it.story} canManage={canManage} compact />
              </li>
            ),
          )}
        </ol>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Nothing here yet.
        </p>
      )}
    </section>
  );
}

/** Write or edit a life story. */
export function StoryModal({ pid, id, close }: { pid: string; id?: string; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const existing = id ? data.stories.find((s) => s.id === id) : undefined;
  const [f, setF] = useState(() => ({
    title: existing?.title || '',
    body: existing?.body || '',
    date: existing?.date || '',
    place: existing ? T.placeName(existing.placeId) : '',
    factId: existing?.factId || '',
    people: existing ? [pid, ...Object.keys(existing.people).filter((x) => x !== pid)] : [pid],
    mediaIds: existing?.mediaIds || [],
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const subject = T.person[pid];
  if (!subject) return null;
  const facts = T.factsOf(pid);
  const photos = [
    ...new Map(
      f.people
        .flatMap((x) => T.profileMedia(x))
        .filter((m) => m.kind === 'photo')
        .map((m) => [m.id, m]),
    ).values(),
  ];
  const addable = T.peopleSorted().filter((p) => !f.people.includes(p.id));
  const self = data.settings.self_person;
  const title = existing ? 'Edit story' : pid === self ? 'Write a story about your life' : `Write a story about ${T.first(pid)}`;

  return (
    <ModalFrame label={title} onClose={close} width={760}>
      <h2 className="h2">{title}</h2>
      <label className="fl">
        Title
        <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. The summer we moved to Cairns" autoFocus />
      </label>
      <div className="frow">
        <label className="fl">
          When
          <DateInput value={f.date} onChange={(v) => set({ date: v })} placeholder="e.g. 1962 or 14 Mar 1962" label="when it happened" />
        </label>
        <label className="fl">
          Where
          <PlaceInput value={f.place} onChange={(v) => set({ place: v })} />
        </label>
      </div>
      <label className="fl">
        Is it about one of {T.first(pid)}’s events? <span className="muted">(optional)</span>
        <select
          value={f.factId}
          onChange={(e) => {
            const fact = facts.find((x) => x.id === e.target.value);
            set({ factId: e.target.value, date: f.date || fact?.date || '', place: f.place || (fact ? T.placeName(fact.placeId) : '') });
          }}
        >
          <option value="">No — it goes in the timeline by its date</option>
          {facts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.type}
              {dateLabel(x) ? ' · ' + dateLabel(x) : ''}
              {x.placeId ? ' · ' + T.placeName(x.placeId).split(',')[0] : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="fl">
        The story
        <textarea value={f.body} onChange={(e) => set({ body: e.target.value })} style={{ minHeight: 220 }} placeholder="Write it the way you’d tell it…" />
      </label>
      <div className="fl">
        <span>Who it’s about</span>
        <div className="chips">
          {f.people.map((x, i) => (
            <span key={x} className="chip person">
              {T.nm(x)}
              {i > 0 && (
                <button type="button" className="fx" aria-label={`Remove ${T.nm(x)} from this story`} onClick={() => set({ people: f.people.filter((y) => y !== x) })}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        <select
          value=""
          onChange={(e) => e.target.value && set({ people: [...f.people, e.target.value] })}
          aria-label="Add someone else this story is about"
          style={{ maxWidth: 360 }}
        >
          <option value="">Add someone else…</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.surname}, {p.given}
            </option>
          ))}
        </select>
        <span className="fieldnote">The story shows on each person’s profile and timeline. If they have their own account, it waits for them to approve it.</span>
      </div>
      {photos.length > 0 && (
        <div className="fl">
          <span>Photos to go with it</span>
          <div className="story-pick">
            {photos.map((m) => {
              const on = f.mediaIds.includes(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  className={'pf-mini-tile' + (on ? ' on' : '')}
                  aria-pressed={on}
                  aria-label={m.title}
                  onClick={() => set({ mediaIds: on ? f.mediaIds.filter((x) => x !== m.id) : [...f.mediaIds, m.id] })}
                >
                  <MediaThumb m={m} tag={false} />
                  {on && (
                    <span className="pick-tick" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mfoot">
        <span className="small muted" style={{ marginRight: 'auto' }}>
          <Avatar pid={pid} size="xs" /> Saved on this computer with the tree
        </span>
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await saveStory({ ...f, id });
            setBusy(false);
            if (ok) close();
          }}
        >
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Save story'}
        </button>
      </div>
    </ModalFrame>
  );
}
