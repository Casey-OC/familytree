import { useData } from '../../data/store';
import { setUi, useUi, type PersonTab } from '../../data/ui';
import {
  addRelModal,
  centreOn,
  createTask,
  go,
  openMedia,
  openPerson,
  openPlace,
  openProfile,
  openSource,
  removeRelationship,
  setNotes,
  startAdd,
  startEdit,
} from '../../data/actions';
import { treeApi } from '../../lib/family';
import { dateLabel } from '../../lib/dates';
import { Avatar, Conf, Empty, Icon } from '../../components/ui';
import { FactFormView } from './FactForm';
import { MediaThumb } from '../media/MediaThumb';

export function PersonPanel({ pid }: { pid: string }) {
  const data = useData((s) => s.data);
  const ptab = useUi((s) => s.ptab);
  const form = useUi((s) => s.form);
  const T = treeApi(data);
  const p = T.person[pid];
  const fm = form && form.pid === pid ? form : null;
  const facts = T.factsOf(pid);
  const tabs: [PersonTab, string][] = [
    ['facts', 'Facts'],
    ['relationships', 'Relationships'],
    ['media', 'Media'],
    ['notes', 'Notes'],
    ['sources', 'Sources'],
    ['research', 'Research'],
  ];
  const editDetails = () =>
    setUi({ modal: { kind: 'editPerson', pid, given: p.given, surname: p.surname, sex: p.sex, living: p.living, root: T.rootId === pid } });

  return (
    <div className="pbody">
      <div className="phead">
        <button className="av-btn" onClick={() => openProfile(pid)} aria-label={`Open ${T.nm(pid)}’s profile page`} title="Open profile page">
          <Avatar pid={pid} size="lg" />
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 className="pname">{T.nm(pid)}</h2>
          <div className="muted strong">{T.years(pid)}</div>
          <div className="chips" style={{ marginTop: 6 }}>
            <span className="chip">{p.living ? 'Living' : 'Deceased'}</span>
            <span className={p.living ? 'chip' : 'chip person'}>{p.living ? 'Private' : 'Shared'}</span>
            {T.rootId === pid && <span className="chip gold">Tree starts here</span>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm primary" onClick={() => openProfile(pid)}>
          <Icon name="people" sm />
          Open profile
        </button>
        <button
          className="btn sm"
          onClick={() => {
            setUi({ focus: pid, treeView: useUi.getState().treeView });
            go('tree');
            setTimeout(() => centreOn(pid), 0);
          }}
        >
          Show in tree
        </button>
        <button className="btn sm" onClick={editDetails}>
          <Icon name="edit" sm />
          Edit details
        </button>
      </div>
      {p.living && (
        <div className="privacy-note">
          <Icon name="lock" />
          <span>Living relatives stay private. Nothing about {T.first(pid)} is shared or exported unless you choose to.</span>
        </div>
      )}
      <div className="tabs" role="tablist" style={{ flexWrap: 'wrap' }}>
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={ptab === k} className={ptab === k ? 'on' : ''} onClick={() => setUi({ ptab: k, form: null })} style={{ padding: '8px 10px' }}>
            {l}
          </button>
        ))}
      </div>

      {ptab === 'facts' && (
        <>
          <button className="btn sm" onClick={() => startAdd(pid)} style={{ alignSelf: 'flex-start' }}>
            <Icon name="plus" sm />
            Add fact
          </button>
          {fm && !fm.fid && <FactFormView fm={fm} />}
          <div className="timeline">
            {facts.map((f) => {
              const c = T.conf(f);
              const editing = fm?.fid === f.id;
              return (
                <div key={f.id} className="fact">
                  <span className={c === 'Unverified' ? 'fact-dot u' : 'fact-dot'} aria-hidden="true" />
                  {editing ? (
                    <FactFormView fm={fm!} />
                  ) : (
                    <div className={c === 'Unverified' ? 'fact-box unv' : 'fact-box'}>
                      <div className="fact-top">
                        <span className="fact-type">{f.type}</span>
                        <span className="fact-date">{dateLabel(f)}</span>
                        {T.ageAt(pid, f) && <span className="fact-age">{T.ageAt(pid, f)}</span>}
                        <div className="spacer" />
                        <Conf c={c} />
                      </div>
                      {f.placeId && (
                        <button className="link small" onClick={() => openPlace(f.placeId)}>
                          {T.placeName(f.placeId)}
                        </button>
                      )}
                      {f.homePlaceId && (
                        <div className="small">
                          {f.type === 'Birth' ? 'Family home: ' : 'Home: '}
                          <button className="link small" onClick={() => openPlace(f.homePlaceId)}>
                            {T.placeName(f.homePlaceId)}
                          </button>
                        </div>
                      )}
                      {f.desc && <div className="small">{f.desc}</div>}
                      <div className="citeline">
                        {f.citeIds.map((cid) => {
                          const ci = T.cite[cid];
                          const s = ci && T.source[ci.sourceId];
                          return (
                            <button key={cid} className="cite" onClick={() => s && openSource(s.id)}>
                              <Icon name="sources" sm />
                              <span>
                                {s ? s.title : 'Source'}
                                {ci?.page && <span className="muted"> · {ci.page}</span>}
                              </span>
                            </button>
                          );
                        })}
                        {!f.citeIds.length && <span className="small muted">No sources yet</span>}
                        <button className="btn sm ghost" onClick={() => startEdit(f)} style={{ marginLeft: 'auto' }}>
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!facts.length && !fm && <div className="empty">No facts yet. Add a birth to get started.</div>}
        </>
      )}

      {ptab === 'relationships' && <Relationships pid={pid} />}

      {ptab === 'media' && (
        <>
          <button className="btn sm" onClick={() => setUi({ modal: { kind: 'upload', forPid: pid } })} style={{ alignSelf: 'flex-start' }}>
            <Icon name="upload" sm />
            Upload a photo
          </button>
          {T.mediaOf(pid).length ? (
            <div className="mgrid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {T.mediaOf(pid).map((m) => (
                <button key={m.id} className="mtile" onClick={() => openMedia(m.id)}>
                  <MediaThumb m={m} tag={false} />
                  <div className="mt-b">
                    <span className="li-t">{m.title}</span>
                    <span className="li-s">{[m.date, T.placeName(m.placeId).split(',')[0]].filter(Boolean).join(' · ')}</span>
                    {p.photoMediaId === m.id && <span className="badge wall" style={{ alignSelf: 'flex-start' }}>Profile photo</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty illo="photo">
              No photos of {T.nm(pid)} yet.
              <button className="btn primary sm" onClick={() => setUi({ modal: { kind: 'upload', forPid: pid } })}>
                Upload a photo
              </button>
            </Empty>
          )}
        </>
      )}

      {ptab === 'notes' && (
        <>
          <label className="fl">
            Research notes
            <textarea value={p.notes} onChange={(e) => setNotes(pid, e.target.value)} style={{ minHeight: 220 }} placeholder="Stories, theories, things to check…" />
          </label>
          <span className="muted small">Saved automatically. Notes are never shown on the Family Wall.</span>
        </>
      )}

      {ptab === 'sources' && <PersonSources pid={pid} />}
      {ptab === 'research' && <PersonResearch pid={pid} />}
    </div>
  );
}

function Relationships({ pid }: { pid: string }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const groups: [string, string[], string, 'parent' | 'spouse' | 'child' | 'sibling'][] = [
    ['Parents', T.parents(pid), 'No parents recorded.', 'parent'],
    ['Spouses and partners', T.spouses(pid), 'None recorded.', 'spouse'],
    ['Children', T.children(pid), 'No children recorded.', 'child'],
    ['Siblings', T.siblings(pid), 'No siblings recorded.', 'sibling'],
  ];
  const direct = (other: string) => data.rels.some((r) => (r.a === pid && r.b === other) || (r.a === other && r.b === pid));
  return (
    <>
      {groups.map(([label, ids, none, kind]) => (
        <div key={label} className="relgrp">
          <div className="fl">{label}</div>
          {ids.map((id) => {
            const rid = kind === 'spouse' ? T.spouseRelId(pid, id) : undefined;
            const start = rid ? data.rels.find((r) => r.id === rid)?.start : '';
            return (
              <div key={id} className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="li grow" onClick={() => openPerson(id)}>
                  <Avatar pid={id} size="xs" />
                  <span>
                    <span className="li-t">{T.nm(id)}</span>
                    <span className="li-s">
                      {T.years(id)}
                      {start ? ' · married ' + start : ''}
                    </span>
                  </span>
                </button>
                {direct(id) && (
                  <button
                    className="xbtn"
                    aria-label={`Remove the link between ${T.short(pid)} and ${T.short(id)}`}
                    title="Remove this relationship"
                    onClick={() =>
                      setUi({
                        modal: {
                          kind: 'confirm',
                          title: 'Remove this relationship?',
                          body: `${T.nm(pid)} and ${T.nm(id)} will no longer be linked as ${kind === 'child' ? 'parent and child' : kind === 'parent' ? 'child and parent' : kind === 'spouse' ? 'partners' : 'siblings'}. Neither person is deleted.`,
                          action: 'Remove link',
                          danger: true,
                          onConfirm: () => removeRelationship(pid, id),
                        },
                      })
                    }
                  >
                    <Icon name="close" sm />
                  </button>
                )}
              </div>
            );
          })}
          {!ids.length && <span className="small muted">{none}</span>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['parent', 'spouse', 'child', 'sibling'] as const).map((r) => (
          <button key={r} className="btn sm" onClick={() => addRelModal(pid, r)}>
            Add {r}
          </button>
        ))}
      </div>
    </>
  );
}

function PersonSources({ pid }: { pid: string }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const srcMap: Record<string, string[]> = {};
  T.factsOf(pid).forEach((f) =>
    f.citeIds.forEach((cid) => {
      const c = T.cite[cid];
      if (c) (srcMap[c.sourceId] = srcMap[c.sourceId] || []).push(f.type);
    }),
  );
  const ids = Object.keys(srcMap).filter((s) => T.source[s]);
  return ids.length ? (
    <div className="list">
      {ids.map((sid) => (
        <button key={sid} className="li" onClick={() => openSource(sid)}>
          <span>
            <span className="li-t">{T.source[sid].title}</span>
            <span className="li-s">
              {T.source[sid].type} · Supports: {[...new Set(srcMap[sid])].join(', ')}
            </span>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">No sources cited yet.</div>
  );
}

function PersonResearch({ pid }: { pid: string }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const unv = T.factsOf(pid).filter((f) => T.conf(f) === 'Unverified');
  const tasks = data.tasks.filter((t) => t.personId === pid);
  const hints = data.hints.filter((h) => h.personId === pid && (h.status === 'pending' || h.status === 'later'));
  return (
    <>
      {unv.length > 0 && (
        <div>
          <div className="fl" style={{ marginBottom: 6 }}>
            Unverified facts
          </div>
          {unv.map((f) => {
            const t = data.tasks.find((x) => x.factId === f.id);
            return (
              <div key={f.id} className="li">
                <span className="conf conf-unverified">?</span>
                <span style={{ flex: 1 }}>
                  {f.type} · {dateLabel(f)}
                </span>
                {t ? (
                  <span className="chip">Task exists</span>
                ) : (
                  <button className="btn sm primary" onClick={() => createTask(f)}>
                    Create task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div>
        <div className="fl" style={{ marginBottom: 6 }}>
          Research tasks
        </div>
        {tasks.map((t) => (
          <button key={t.id} className="li" onClick={() => setUi({ section: 'research', rtab: 'tasks', tfilter: 'all', taskOpen: t.id })}>
            <span className={'conf ' + (t.status === 'Done' ? 'st-done' : t.status === 'In progress' ? 'st-prog' : 'st-todo')}>{t.status}</span>
            <span className="li-t">{t.title}</span>
          </button>
        ))}
        {!tasks.length && <span className="muted small">No tasks for this person.</span>}
        <div style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => setUi({ modal: { kind: 'task', title: '', pid, priority: 'Medium', notes: '' } })}>
            <Icon name="plus" sm />
            New task
          </button>
        </div>
      </div>
      {hints.length > 0 && (
        <div>
          <div className="fl" style={{ marginBottom: 6 }}>
            Record hints
          </div>
          {hints.map((h) => (
            <button key={h.id} className="li" onClick={() => setUi({ section: 'research', rtab: 'hints', hintSel: h.id })}>
              <span className="badge hint">Hint</span>
              <span>
                {h.provider} · {h.collection}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
