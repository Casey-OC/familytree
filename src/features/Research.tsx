import { useMemo } from 'react';
import { useData } from '../data/store';
import { setUi, useUi } from '../data/ui';
import { acceptHint, createTask, deleteTask, openPerson, setHintStatus, startEdit, updateTask } from '../data/actions';
import { treeApi } from '../lib/family';
import { dateLabel } from '../lib/dates';
import { Conf, Empty, PersonLink, Seg, Tabs } from '../components/ui';
import type { Task } from '../lib/types';

export function Research() {
  const data = useData((s) => s.data);
  const rtab = useUi((s) => s.rtab);
  const T = treeApi(data);
  const unvFacts = useMemo(() => data.facts.filter((f) => T.conf(f) === 'Unverified'), [data]);
  const open = data.tasks.filter((t) => t.status !== 'Done').length;
  const pending = data.hints.filter((h) => h.status === 'pending').length;
  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">Research</h1>
            <p className="lede">Track what still needs proving, and review records suggested from outside databases.</p>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setUi({ modal: { kind: 'task', title: '', pid: '', priority: 'Medium', notes: '' } })}>
            New task
          </button>
        </div>
        <Tabs
          value={rtab}
          onChange={(k) => setUi({ rtab: k })}
          tabs={[
            ['tasks', `Tasks · ${open} open`],
            ['unv', `Unverified facts · ${unvFacts.length}`],
            ['hints', `Record hints · ${pending}`],
          ]}
        />
        {rtab === 'tasks' && <TasksTab />}
        {rtab === 'unv' && (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Built automatically from every fact with no citation. Attach evidence and it leaves this list.
            </p>
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Fact</th>
                    <th>Date</th>
                    <th>Place</th>
                    <th>Evidence</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {unvFacts.slice(0, 500).map((f) => {
                    const t = data.tasks.find((x) => x.factId === f.id);
                    return (
                      <tr key={f.id}>
                        <td>
                          <PersonLink pid={f.personId} />
                        </td>
                        <td className="strong">{f.type}</td>
                        <td>{dateLabel(f)}</td>
                        <td>{T.placeName(f.placeId) || '—'}</td>
                        <td>
                          <Conf c="Unverified" />
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn sm ghost" onClick={() => startEdit(f)}>
                            Add evidence
                          </button>
                          {t ? (
                            <span className="chip">Task · {t.status}</span>
                          ) : (
                            <button className="btn sm primary" onClick={() => createTask(f)}>
                              Create task
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!unvFacts.length && <Empty>Every fact has evidence. Well done.</Empty>}
            </div>
          </>
        )}
        {rtab === 'hints' && <HintsTab />}
      </div>
    </div>
  );
}

function TasksTab() {
  const data = useData((s) => s.data);
  const tfilter = useUi((s) => s.tfilter);
  const taskOpen = useUi((s) => s.taskOpen);
  const T = treeApi(data);
  const tasks = data.tasks.filter((t) => tfilter === 'all' || (tfilter === 'open' ? t.status !== 'Done' : t.status === tfilter));
  return (
    <>
      <div style={{ alignSelf: 'flex-start' }}>
        <Seg
          label="Task status filter"
          value={tfilter}
          onChange={(k) => setUi({ tfilter: k })}
          options={[
            ['open', 'Open'],
            ['To do', 'To do'],
            ['In progress', 'In progress'],
            ['Done', 'Done'],
            ['all', 'All'],
          ]}
        />
      </div>
      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Person</th>
              <th>Fact to verify</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const f = T.fact[t.factId];
              const expanded = taskOpen === t.id;
              return (
                <tr key={t.id}>
                  <td className="strong">{t.title}</td>
                  <td>{t.personId && T.person[t.personId] ? <PersonLink pid={t.personId} label={T.short(t.personId)} /> : '—'}</td>
                  <td>
                    {f ? (
                      <>
                        <span className="small">
                          {f.type} · {dateLabel(f)}
                        </span>
                        <br />
                        <Conf c={T.conf(f)} />
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <select value={t.status} onChange={(e) => updateTask(t.id, { status: e.target.value as Task['status'] })} aria-label={`Status for ${t.title}`} style={{ minHeight: 36 }}>
                      {['To do', 'In progress', 'Done'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={t.priority} onChange={(e) => updateTask(t.id, { priority: e.target.value as Task['priority'] })} aria-label={`Priority for ${t.title}`} style={{ minHeight: 36 }}>
                      {['High', 'Medium', 'Low'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {expanded && <TaskNotes t={t} />}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {!expanded && <span className="small muted" style={{ flex: 1 }}>{t.notes ? (t.notes.length > 60 ? t.notes.slice(0, 60) + '…' : t.notes) : 'No notes yet'}</span>}
                      {expanded && <span style={{ flex: 1 }} />}
                      <button className="btn sm ghost" onClick={() => setUi({ taskOpen: expanded ? null : t.id })}>
                        {expanded ? 'Close' : 'Notes'}
                      </button>
                      {expanded && (
                        <button
                          className="btn sm ghost danger"
                          onClick={() =>
                            setUi({ modal: { kind: 'confirm', title: 'Delete this task?', body: `“${t.title}” will be removed.`, action: 'Delete task', danger: true, onConfirm: () => deleteTask(t.id) } })
                          }
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tasks.length && <div className="empty">No tasks with this status.</div>}
      </div>
    </>
  );
}

function TaskNotes({ t }: { t: Task }) {
  return (
    <textarea
      defaultValue={t.notes}
      onBlur={(e) => e.target.value !== t.notes && updateTask(t.id, { notes: e.target.value })}
      aria-label="What was searched and found"
      placeholder="What did you search? What did you find?"
      autoFocus
    />
  );
}

function HintsTab() {
  const data = useData((s) => s.data);
  const hintSel = useUi((s) => s.hintSel);
  const T = treeApi(data);
  const order = (s: string) => (s === 'pending' ? 0 : s === 'later' ? 1 : 2);
  const hs = data.hints.slice().sort((x, y) => order(x.status) - order(y.status));
  const sel = data.hints.find((h) => h.id === hintSel) || hs[0];
  if (!hs.length)
    return (
      <div className="card">
        <Empty>
          <span className="strong" style={{ color: 'var(--text)' }}>
            No record hints yet
          </span>
          <span>Hints from FamilySearch and other record collections arrive with online features in a later phase. The sample tree includes examples to try.</span>
        </Empty>
      </div>
    );
  const tv = (lab: string) => {
    if (!sel) return '—';
    const pid = sel.personId;
    if (lab === 'Name') return T.nm(pid);
    if (lab === 'Birth') {
      const b = T.ff(pid, 'Birth');
      return b ? dateLabel(b) + (b.placeId ? ', ' + T.placeName(b.placeId) : '') : '—';
    }
    if (lab === 'Father' || lab === 'Mother') {
      const ps = T.parents(pid).filter((x) => (T.person[x].sex === 'M') === (lab === 'Father'));
      return ps.length ? T.nm(ps[0]) : '—';
    }
    const map: Record<string, string> = { Residence: 'Residence', Occupation: 'Occupation', Enlisted: 'Military' };
    const fs = T.factsOf(pid).filter((f) => f.type === map[lab]);
    if (!fs.length) return '—';
    return fs.map((f) => (f.desc || '') + (f.date ? ` (${dateLabel(f)})` : '')).join('; ');
  };
  const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const dbcls = (p: string) => (p === 'FamilySearch' ? 'dbtag fs' : p === 'Ancestry' ? 'dbtag an' : 'dbtag');
  return (
    <div className="hintwrap">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hs.map((h) => (
          <button key={h.id} className={'hitem' + (sel?.id === h.id ? ' on' : '') + (h.status === 'accepted' || h.status === 'rejected' ? ' done' : '')} onClick={() => setUi({ hintSel: h.id })}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
              <span className={dbcls(h.provider)}>{h.provider}</span>
              <span className="badge hint">{h.score}%</span>
              <span className="spacer" />
              <span className="small muted">{h.status === 'pending' ? 'New' : h.status === 'later' ? 'Maybe later' : h.status === 'accepted' ? 'Accepted' : 'Rejected'}</span>
            </span>
            <span className="li-t">{T.nm(h.personId)}</span>
            <span className="li-s">{h.collection}</span>
          </button>
        ))}
      </div>
      {sel && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={dbcls(sel.provider)}>{sel.provider}</span>
            <span className="badge hint">{sel.score}% match</span>
            <span className="muted small">{sel.collection}</span>
          </div>
          <h2 className="h2">
            <button className="link" onClick={() => openPerson(sel.personId)} style={{ font: 'inherit' }}>
              {T.nm(sel.personId)}
            </button>
          </h2>
          <div className="tablewrap" style={{ boxShadow: 'none' }}>
            <table className="table cmp">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>In your tree</th>
                  <th>In the record</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sel.record.rec.map(([l, r]) => {
                  const t = tv(l);
                  const same = t !== '—' && (norm(t).includes(norm(r).slice(0, 10)) || norm(r).includes(norm(t).slice(0, 10)));
                  return (
                    <tr key={l}>
                      <td className="strong">{l}</td>
                      <td>{t}</td>
                      <td>{r}</td>
                      <td>
                        <span className={'match ' + (t === '—' ? 'new' : same ? 'same' : 'diff')}>{t === '—' ? '+ New information' : same ? '✓ Matches' : '≠ Differs'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sel.record.extract && <div className="extract">{sel.record.extract}</div>}
          <div>
            <div className="fl" style={{ marginBottom: 6 }}>
              Accepting will
            </div>
            <div className="list">
              {sel.record.props.map((p, i) => (
                <div key={i} className="li">
                  <span className="badge wall">
                    {p.replace ? 'Update ' : 'Add '}
                    {p.type}
                  </span>
                  <span className="small">
                    {p.date} · {T.placeName(p.place) || p.place}
                    {p.desc ? ' · ' + p.desc : ''}
                  </span>
                </div>
              ))}
              <div className="li">
                <span className="badge hint">Add citation</span>
                <span className="small">
                  {sel.record.srcId && T.source[sel.record.srcId] ? T.source[sel.record.srcId].title : (sel.record.srcNew?.title || sel.collection) + ' (new source)'} · {sel.record.page} · {sel.record.qual}
                </span>
              </div>
            </div>
          </div>
          {sel.status === 'pending' || sel.status === 'later' ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => acceptHint(sel)}>
                Accept
              </button>
              <button className="btn" onClick={() => setHintStatus(sel, 'rejected')}>
                Reject
              </button>
              {sel.status === 'pending' && (
                <button className="btn ghost" onClick={() => setHintStatus(sel, 'later')}>
                  Maybe later
                </button>
              )}
            </div>
          ) : (
            <div className="privacy-note">{sel.status === 'accepted' ? 'Accepted — facts and citation added to the profile.' : 'Rejected — this record won’t be suggested again.'}</div>
          )}
        </section>
      )}
    </div>
  );
}
