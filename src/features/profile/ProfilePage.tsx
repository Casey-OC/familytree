// A person's full profile page — one page per person, like a social profile:
// cover photo, profile photo, about, photos (theirs and ones they're tagged in), family and life story.

import { useMemo, useState } from 'react';
import { titlePhrase } from '../../lib/kinship';
import { useData } from '../../data/store';
import { setUi, useUi, type ProfileTab } from '../../data/ui';
import { centreOn, go, openMedia, openPerson, openProfile, openSource, setCoverPhoto, setProfilePhoto, setTagStatus } from '../../data/actions';
import { mediaUrl } from '../../data/platform';
import { treeApi, type TreeApi } from '../../lib/family';
import { dateLabel } from '../../lib/dates';
import { closeFamily, visibilityLine, type CloseRelation } from '../../lib/profile';
import { findDuplicatePeople } from '../../lib/merge';
import { storiesAbout } from '../../lib/stories';
import { StoriesTab, StoryCard, TimelineTab } from './Stories';
import type { Media, Person } from '../../lib/types';
import { Avatar, Conf, Icon } from '../../components/ui';
import { MediaThumb } from '../media/MediaThumb';

const REL_LABEL: Record<CloseRelation, string> = {
  parent: 'Parent',
  child: 'Child',
  sibling: 'Brother or sister',
  partner: 'Partner',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
};

export function ProfilePage() {
  const data = useData((s) => s.data);
  const account = useData((s) => s.account);
  const pid = useUi((s) => s.profilePid);
  const tab = useUi((s) => s.profileTab);
  const back = useUi((s) => s.profileBack);
  const T = treeApi(data);
  const dupes = useMemo(() => findDuplicatePeople(data).filter((x) => x.a === pid || x.b === pid), [data, pid]);
  const p = T.person[pid];
  if (!p) {
    return (
      <div className="page">
        <div className="empty">This person isn’t in the tree any more.</div>
      </div>
    );
  }
  const selfId = data.settings.self_person || '';
  const isSelf = p.id === selfId;
  const canManage = !p.accountEmail || p.accountEmail === (account?.email || '');
  const all = T.mediaOf(pid);
  const shown = T.profileMedia(pid);
  const photos = shown.filter((m) => m.kind === 'photo');
  const pending = all.filter((m) => T.tagOf(m, pid).status === 'pending');
  const cover = p.coverMediaId ? T.media[p.coverMediaId] : undefined;
  const coverUrl = cover ? mediaUrl(cover.file || cover.thumb) : '';
  const vis = visibilityLine(T, p, selfId);
  const birth = T.ff(pid, 'Birth');
  const death = T.ff(pid, 'Death');
  const lives = [...T.factsOf(pid)].reverse().find((f) => f.type === 'Residence');
  const stories = storiesAbout(data, pid);
  const pendingStories = storiesAbout(data, pid, 'pending');
  const tabs: [ProfileTab, string][] = [
    ['overview', 'Overview'],
    ['timeline', 'Timeline'],
    ['stories', `Life stories${stories.length ? ` (${stories.length})` : ''}`],
    ['photos', `Photos${photos.length ? ` (${photos.length})` : ''}`],
    ['family', 'Family'],
    ['sources', 'Sources'],
  ];
  const setTab = (t: ProfileTab) => setUi({ profileTab: t });

  return (
    <div className="page profile">
      <button className="btn sm ghost pf-back" onClick={() => go(back === 'profile' ? 'home' : back)}>
        ‹ Back
      </button>
      <div className={'pf-cover' + (coverUrl ? ' has' : '')}>
        {coverUrl && <img className="pf-cover-img" src={coverUrl} alt="" draggable={false} />}
        {canManage && (
          <button className="btn sm pf-cover-btn" onClick={() => setUi({ modal: { kind: 'choosePhoto', pid, purpose: 'cover' } })}>
            <Icon name="media" sm />
            {cover ? 'Change cover' : 'Add a cover photo'}
          </button>
        )}
      </div>
      <div className="pf-head">
        <div className="pf-photo">
          <Avatar pid={pid} size="xl" />
          {canManage && (
            <button
              className="pf-photo-btn"
              aria-label={p.photoMediaId ? 'Change or adjust profile photo' : 'Add a profile photo'}
              title={p.photoMediaId ? 'Change or adjust profile photo' : 'Add a profile photo'}
              onClick={() =>
                setUi({
                  menu: null,
                  modal: p.photoMediaId ? { kind: 'adjustPhoto', pid } : { kind: 'choosePhoto', pid, purpose: 'profile' },
                })
              }
            >
              <Icon name="edit" sm />
            </button>
          )}
        </div>
        <div className="pf-id">
          <h1 className="h1 pf-name">{T.nm(pid)}</h1>
          <div className="muted strong">{T.years(pid)}</div>
          {!isSelf && titlePhrase(T, pid) && <div className="kin-line">{titlePhrase(T, pid)}</div>}
          <div className="chips">
            {isSelf && <span className="chip gold">You</span>}
            <span className="chip">{p.living ? 'Living' : 'Deceased'}</span>
            <span className={'chip' + (p.living ? '' : ' person')} title={vis.detail}>
              <Icon name="lock" sm /> {vis.label}
            </span>
            {T.rootId === pid && !isSelf && <span className="chip gold">Tree starts here</span>}
          </div>
          <div className="pf-actions">
            {canManage && p.photoMediaId && (
              <button
                className="btn sm"
                onClick={() =>
                  setUi({
                    modal: { kind: 'choosePhoto', pid, purpose: 'profile' },
                  })
                }
              >
                Change profile photo
              </button>
            )}
            <button className="btn sm" onClick={() => setUi({ modal: { kind: 'upload', forPid: pid } })}>
              <Icon name="upload" sm />
              Add photos
            </button>
            <button
              className="btn sm"
              onClick={() => {
                setUi({ focus: pid });
                go('tree');
                setTimeout(() => centreOn(pid), 0);
              }}
            >
              <Icon name="tree" sm />
              Show in tree
            </button>
            <button className="btn sm" onClick={() => openPerson(pid)}>
              <Icon name="edit" sm />
              Edit facts
            </button>
            <button className="btn sm ghost" onClick={() => setUi({ modal: { kind: 'merge', keep: pid, other: '' } })}>
              Merge with a duplicate…
            </button>
          </div>
        </div>
      </div>

      <div className="tabs pf-tabs" role="tablist" aria-label="Profile sections">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {dupes.length > 0 && (
        <div className="dupe-warn" role="status">
          <span className="strong">This person may be in the tree twice</span>
          {dupes.map((x) => {
            const other = x.a === pid ? x.b : x.a;
            return (
              <div key={other} className="row" style={{ flexWrap: 'nowrap' }}>
                <Avatar pid={other} size="xs" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="li-t">{T.nm(other)}</span> <span className="li-s">{T.years(other) || 'No dates'} · {x.reasons.slice(0, 2).join(' · ')}</span>
                </span>
                <button className="btn sm primary" onClick={() => setUi({ modal: { kind: 'merge', keep: pid, other } })}>
                  Compare and merge
                </button>
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && tab !== 'photos' && (
        <div className="privacy-note" role="status">
          <Icon name="bell" />
          <span>
            {pending.length} photo{pending.length === 1 ? '' : 's'} {isSelf ? 'you’re' : `${T.first(pid)} is`} tagged in {pending.length === 1 ? 'is' : 'are'} waiting for approval.{' '}
            <button className="link" onClick={() => setTab('photos')}>
              Review
            </button>
          </span>
        </div>
      )}
      {pendingStories.length > 0 && tab !== 'stories' && (
        <div className="privacy-note" role="status">
          <Icon name="bell" />
          <span>
            {pendingStories.length} {pendingStories.length === 1 ? 'story' : 'stories'} about {isSelf ? 'you' : T.first(pid)} {pendingStories.length === 1 ? 'is' : 'are'} waiting for approval.{' '}
            <button className="link" onClick={() => setTab('stories')}>
              Review
            </button>
          </span>
        </div>
      )}

      {tab === 'overview' && (
        <div className="pf-grid">
          <div className="pf-col">
            <section className="card pf-card" aria-labelledby="pf-about">
              <h2 className="h3" id="pf-about">
                About
              </h2>
              <dl className="pf-about">
                {birth && <AboutRow label="Born" value={[dateLabel(birth), T.placeName(birth.placeId)].filter(Boolean).join(' · ')} conf={T.conf(birth)} />}
                {birth?.homePlaceId && <AboutRow label="Home at birth" value={T.placeName(birth.homePlaceId)} />}
                {death && <AboutRow label="Died" value={[dateLabel(death), T.ageAt(pid, death), T.placeName(death.placeId)].filter(Boolean).join(' · ')} conf={T.conf(death)} />}
                {death?.homePlaceId && <AboutRow label="Home at death" value={T.placeName(death.homePlaceId)} />}
                {lives && p.living && <AboutRow label="Lives in" value={T.placeName(lives.placeId) || lives.desc} conf={T.conf(lives)} />}
                {T.factsOf(pid)
                  .filter((f) => f.type === 'Occupation')
                  .slice(-2)
                  .map((f) => (
                    <AboutRow key={f.id} label="Work" value={[f.desc, dateLabel(f)].filter(Boolean).join(' · ')} conf={T.conf(f)} />
                  ))}
                {T.spouses(pid).map((s) => (
                  <AboutRow key={s} label="Partner" value={<PLink pid={s} />} />
                ))}
                {T.parents(pid).length > 0 && (
                  <AboutRow
                    label="Parents"
                    value={
                      <>
                        {T.parents(pid).map((x, i) => (
                          <span key={x}>
                            {i > 0 && ' and '}
                            <PLink pid={x} />
                          </span>
                        ))}
                      </>
                    }
                  />
                )}
              </dl>
              {!birth && !death && (
                <p className="small muted" style={{ margin: 0 }}>
                  No details yet. Add a birth date from Edit facts.
                </p>
              )}
            </section>
            <section className="card pf-card" aria-labelledby="pf-who">
              <h2 className="h3" id="pf-who">
                Who can see this profile
              </h2>
              <p style={{ margin: 0 }}>
                <span className="strong">{vis.label}.</span> {vis.detail}
              </p>
            </section>
          </div>
          <div className="pf-col">
            <section className="card pf-card" aria-labelledby="pf-photos">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="h3" id="pf-photos">
                  Photos
                </h2>
                {photos.length > 0 && (
                  <button className="link" onClick={() => setTab('photos')}>
                    See all {photos.length}
                  </button>
                )}
              </div>
              {photos.length ? (
                <div className="pf-mini">
                  {photos.slice(0, 6).map((m) => (
                    <button key={m.id} className="pf-mini-tile" onClick={() => openMedia(m.id)} aria-label={m.title}>
                      <MediaThumb m={m} tag={false} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>
                  No photos yet. Photos you upload or tag {isSelf ? 'you' : T.first(pid)} in will show here.
                </p>
              )}
            </section>
            <section className="card pf-card" aria-labelledby="pf-stories">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="h3" id="pf-stories">
                  Life stories
                </h2>
                {stories.length > 0 ? (
                  <button className="link" onClick={() => setTab('stories')}>
                    See all {stories.length}
                  </button>
                ) : (
                  <button className="btn sm" onClick={() => setUi({ modal: { kind: 'story', pid } })}>
                    <Icon name="plus" sm />
                    Write a story
                  </button>
                )}
              </div>
              {stories.length ? (
                [...stories]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 2)
                  .map((st) => <StoryCard key={st.id} T={T} pid={pid} s={st} canManage={canManage} compact />)
              ) : (
                <p className="small muted" style={{ margin: 0 }}>
                  No stories yet. Anyone in the family can write one about {isSelf ? 'you' : T.first(pid)}.
                </p>
              )}
            </section>
            <section className="card pf-card" aria-labelledby="pf-fam">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="h3" id="pf-fam">
                  Close family
                </h2>
                <button className="link" onClick={() => setTab('family')}>
                  See all
                </button>
              </div>
              <FamilyCards T={T} ids={[...closeFamily(T, pid)].slice(0, 6)} />
            </section>
          </div>
        </div>
      )}

      {tab === 'photos' && <PhotosTab T={T} p={p} canManage={canManage} isSelf={isSelf} all={all} />}
      {tab === 'family' && <FamilyTab T={T} pid={pid} />}
      {tab === 'timeline' && <TimelineTab T={T} pid={pid} canManage={canManage} />}
      {tab === 'stories' && <StoriesTab T={T} pid={pid} canManage={canManage} isSelf={isSelf} />}
      {tab === 'sources' && <SourcesTab T={T} pid={pid} />}
    </div>
  );
}

function AboutRow({ label, value, conf }: { label: string; value: React.ReactNode; conf?: ReturnType<TreeApi['conf']> }) {
  return (
    <div className="pf-row">
      <dt>{label}</dt>
      <dd>
        {value}
        {conf && (
          <>
            {' '}
            <Conf c={conf} />
          </>
        )}
      </dd>
    </div>
  );
}

function PLink({ pid }: { pid: string }) {
  const T = treeApi(useData((s) => s.data));
  return (
    <button className="link" onClick={() => openProfile(pid)}>
      {T.nm(pid)}
    </button>
  );
}

function FamilyCards({ T, ids }: { T: TreeApi; ids: [string, CloseRelation | string][] }) {
  if (!ids.length)
    return (
      <p className="small muted" style={{ margin: 0 }}>
        No family linked yet.
      </p>
    );
  return (
    <div className="pf-fam">
      {ids.map(([id, rel]) => (
        <button key={id} className="pf-fam-card" onClick={() => openProfile(id)}>
          <Avatar pid={id} size="lg" />
          <span className="li-t">{T.nm(id)}</span>
          <span className="li-s">
            {REL_LABEL[rel as CloseRelation] || rel}
            {T.years(id) ? ' · ' + T.years(id) : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

function FamilyTab({ T, pid }: { T: TreeApi; pid: string }) {
  const close = closeFamily(T, pid);
  const groups: [string, CloseRelation[]][] = [
    ['Parents', ['parent']],
    ['Partners', ['partner']],
    ['Children', ['child']],
    ['Brothers and sisters', ['sibling']],
    ['Grandparents', ['grandparent']],
    ['Grandchildren', ['grandchild']],
  ];
  return (
    <div className="pf-stack">
      <p className="muted" style={{ margin: 0 }}>
        Close family can see each other’s profiles without an invite. More distant relatives need an invite.
      </p>
      {groups.map(([label, rels]) => {
        const ids = [...close].filter(([, r]) => rels.includes(r));
        if (!ids.length) return null;
        return (
          <section key={label} className="card pf-card">
            <h2 className="h3">{label}</h2>
            <FamilyCards T={T} ids={ids} />
          </section>
        );
      })}
      {!close.size && <div className="empty">No family linked yet. Add parents, partners or children from Edit facts.</div>}
    </div>
  );
}

function PhotosTab({ T, p, canManage, isSelf, all }: { T: TreeApi; p: Person; canManage: boolean; isSelf: boolean; all: Media[] }) {
  const pid = p.id;
  const [open, setOpen] = useState<string | null>(null);
  const by = (s: string) => all.filter((m) => T.tagOf(m, pid).status === s);
  const shown = by('shown');
  const pending = by('pending');
  const hidden = by('hidden');
  const photos = shown.filter((m) => m.kind === 'photo');
  const other = shown.filter((m) => m.kind !== 'photo');
  const first = isSelf ? 'you' : T.first(pid);

  const tile = (m: Media, kind: 'shown' | 'pending' | 'hidden') => {
    const tag = T.tagOf(m, pid);
    const added = m.addedBy;
    const tagger = tag.by && tag.by !== added ? tag.by : '';
    return (
      <div key={m.id} className={'pf-tile' + (kind === 'hidden' ? ' dim' : '')}>
        <button className="pf-tile-img" onClick={() => openMedia(m.id)} aria-label={`Open ${m.title}`}>
          <MediaThumb m={m} tag={m.kind !== 'photo'} />
        </button>
        <div className="pf-tile-b">
          <span className="li-t">{m.title}</span>
          <span className="li-s">{[m.date, added && `Added by ${added}`, tagger && `Tagged by ${tagger}`].filter(Boolean).join(' · ') || 'Added to this tree'}</span>
          <div className="chips">
            {p.photoMediaId === m.id && <span className="badge wall">Profile photo</span>}
            {p.coverMediaId === m.id && <span className="badge wall">Cover photo</span>}
          </div>
          {kind === 'pending' &&
            (canManage ? (
              <div className="row">
                <button className="btn sm primary" onClick={() => setTagStatus(m.id, pid, 'shown')}>
                  Show on profile
                </button>
                <button className="btn sm" onClick={() => setTagStatus(m.id, pid, 'hidden')}>
                  Hide
                </button>
              </div>
            ) : (
              <span className="small muted">Waiting for {T.first(pid)} to approve</span>
            ))}
          {kind === 'hidden' && canManage && (
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setTagStatus(m.id, pid, 'shown')}>
              Show again
            </button>
          )}
          {kind === 'shown' && canManage && (
            <div className="pf-opts">
              <button className="btn sm ghost" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                Options
              </button>
              {open === m.id && (
                <div className="pf-opts-menu" role="menu">
                  {m.kind === 'photo' && m.file && p.photoMediaId !== m.id && (
                    <button
                      role="menuitem"
                      onClick={async () => {
                        setOpen(null);
                        await setProfilePhoto(pid, m.id);
                        setUi({ modal: { kind: 'adjustPhoto', pid } });
                      }}
                    >
                      Make profile photo
                    </button>
                  )}
                  {m.kind === 'photo' && m.file && p.coverMediaId !== m.id && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setOpen(null);
                        setCoverPhoto(pid, m.id);
                      }}
                    >
                      Make cover photo
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setOpen(null);
                      setTagStatus(m.id, pid, 'hidden');
                    }}
                  >
                    Hide from this profile
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pf-stack">
      {pending.length > 0 && (
        <section className="card pf-card" aria-labelledby="pf-pending">
          <h2 className="h3" id="pf-pending">
            Waiting for approval
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            Someone tagged {first} in {pending.length === 1 ? 'this photo' : 'these photos'}. {canManage ? 'Choose whether each one shows on the profile.' : ''}
          </p>
          <div className="pf-tiles">{pending.map((m) => tile(m, 'pending'))}</div>
        </section>
      )}
      <section aria-labelledby="pf-all">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 className="h3" id="pf-all">
            Photos of {isSelf ? 'you' : T.first(pid)}
          </h2>
          <button className="btn sm primary" onClick={() => setUi({ modal: { kind: 'upload', forPid: pid } })}>
            <Icon name="upload" sm />
            Add photos
          </button>
        </div>
        {photos.length ? (
          <div className="pf-tiles">{photos.map((m) => tile(m, 'shown'))}</div>
        ) : (
          <div className="empty">No photos yet. Upload a photo, or tag {first} in one from Media.</div>
        )}
      </section>
      {other.length > 0 && (
        <section aria-labelledby="pf-docs">
          <h2 className="h3" id="pf-docs" style={{ marginBottom: 8 }}>
            Documents and recordings
          </h2>
          <div className="pf-tiles">{other.map((m) => tile(m, 'shown'))}</div>
        </section>
      )}
      {hidden.length > 0 && canManage && (
        <section aria-labelledby="pf-hidden">
          <h2 className="h3" id="pf-hidden" style={{ marginBottom: 8 }}>
            Hidden from this profile
          </h2>
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            These stay in Media and on other people’s profiles. They just don’t show here.
          </p>
          <div className="pf-tiles">{hidden.map((m) => tile(m, 'hidden'))}</div>
        </section>
      )}
    </div>
  );
}

function SourcesTab({ T, pid }: { T: TreeApi; pid: string }) {
  const map: Record<string, string[]> = {};
  T.factsOf(pid).forEach((f) =>
    f.citeIds.forEach((cid) => {
      const c = T.cite[cid];
      if (c && T.source[c.sourceId]) (map[c.sourceId] = map[c.sourceId] || []).push(f.type);
    }),
  );
  const ids = Object.keys(map);
  return ids.length ? (
    <div className="list">
      {ids.map((sid) => (
        <button key={sid} className="li" onClick={() => openSource(sid)}>
          <Icon name="sources" />
          <span>
            <span className="li-t">{T.source[sid].title}</span>
            <span className="li-s">
              {T.source[sid].type} · Supports: {[...new Set(map[sid])].join(', ')}
            </span>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">No sources cited yet.</div>
  );
}
