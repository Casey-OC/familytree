import { useMemo } from 'react';
import { useData } from '../data/store';
import { setUi } from '../data/ui';
import { addRelModal, go, openMedia, openPerson } from '../data/actions';
import { treeApi } from '../lib/family';
import { fullDate, greeting, MONTHS } from '../lib/dates';
import { Avatar, Empty } from '../components/ui';
import { MediaThumb } from './media/MediaThumb';

export function Home() {
  const data = useData((s) => s.data);
  const treeId = useData((s) => s.treeId);
  const prefs = useData((s) => s.prefs);
  const T = treeApi(data);

  const vm = useMemo(() => {
    const unv = data.facts.filter((f) => T.conf(f) === 'Unverified').length;
    const recent = (prefs.recent[treeId] || []).filter((id) => T.person[id]);
    if (recent.length < 5) {
      for (const p of data.people.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
        if (recent.length >= 5) break;
        if (!recent.includes(p.id)) recent.push(p.id);
      }
    }
    // On this day — birthdays, anniversaries and remembrances in the next three weeks.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { diff: number; when: string; title: string; sub: string; pid: string }[] = [];
    for (const f of data.facts) {
      if (!['Birth', 'Marriage', 'Death'].includes(f.type) || f.q !== 'exact') continue;
      const fd = fullDate(f.date);
      if (!fd) continue;
      const p = T.person[f.personId];
      if (!p) continue;
      if (f.type === 'Marriage') {
        const sp = T.spouses(p.id).find((s) => (T.ff(s, 'Marriage')?.date || '') === f.date);
        if (sp && sp < p.id) continue; // show each couple once
      }
      let dt = new Date(today.getFullYear(), fd.month, fd.day);
      if (dt < today) dt = new Date(today.getFullYear() + 1, fd.month, fd.day);
      const diff = Math.round((dt.getTime() - today.getTime()) / 864e5);
      if (diff > 21) continue;
      const yrs = dt.getFullYear() - fd.year;
      if (yrs <= 0) continue;
      const what =
        f.type === 'Birth' ? (p.living ? `Birthday · turns ${yrs}` : `Born ${yrs} years ago`) : f.type === 'Marriage' ? `Wedding anniversary · ${yrs} years` : `Died ${yrs} years ago`;
      const title = f.type === 'Marriage' && f.desc.startsWith('Married ') ? f.desc.replace('Married', T.short(p.id) + ' &') : T.nm(p.id);
      days.push({ diff, when: diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${fd.day} ${MONTHS[fd.month]}`, title, sub: what, pid: p.id });
    }
    days.sort((a, b) => a.diff - b.diff);
    return {
      unv,
      recent,
      days,
      hints: data.hints.filter((h) => h.status === 'pending').slice(0, 4),
      tasks: data.tasks.filter((t) => t.status !== 'Done').slice(0, 4),
      media: data.media.slice(0, 6),
    };
  }, [data, treeId, prefs.recent]);

  const stats = [
    { n: data.people.length, l: 'People', go: () => go('people'), cls: '' },
    { n: T.generations(), l: 'Generations', go: () => go('tree'), cls: '' },
    { n: data.sources.length, l: 'Sources', go: () => go('sources'), cls: '' },
    { n: data.media.filter((m) => m.kind === 'photo').length, l: 'Photos', go: () => go('media'), cls: '' },
    { n: vm.unv, l: 'Unverified facts', go: () => setUi({ section: 'research', rtab: 'unv' }), cls: vm.unv ? 'warn' : '' },
  ];
  const name = prefs.ownerName.trim().split(' ')[0];

  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">
              {greeting()}
              {name ? ', ' + name : ''}
            </h1>
            <p className="lede">{data.settings.subtitle || data.settings.tree_name || 'Your family tree'}</p>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => go('people')}>
            All people
          </button>
          <button className="btn primary" onClick={() => go('tree')}>
            Open the tree
          </button>
        </div>
        <div className="stats">
          {stats.map((s) => (
            <button key={s.l} className={'stat ' + s.cls} onClick={s.go}>
              <span className="stat-n">{s.n}</span>
              <span className="stat-l">{s.l}</span>
            </button>
          ))}
        </div>
        {data.people.length === 0 && (
          <section className="card">
            <Empty>
              <span className="strong" style={{ color: 'var(--text)' }}>
                Your tree is empty
              </span>
              <button className="btn primary" onClick={() => addRelModal('', 'none')}>
                Add the first person
              </button>
            </Empty>
          </section>
        )}
        <div className="grid2">
          <section className="card">
            <div className="card-head">
              <h2 className="h2">Continue where you left off</h2>
            </div>
            <div className="list">
              {vm.recent.map((id) => (
                <button key={id} className="li" onClick={() => openPerson(id)}>
                  <Avatar pid={id} size="sm" />
                  <span>
                    <span className="li-t">{T.nm(id)}</span>
                    <span className="li-s">{T.years(id)}</span>
                  </span>
                </button>
              ))}
              {!vm.recent.length && <div className="empty">People you open will appear here.</div>}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2 className="h2">On this day</h2>
              <span className="muted small">Next three weeks</span>
            </div>
            <div className="list">
              {vm.days.map((x) => (
                <button key={x.title + x.sub} className="li" onClick={() => openPerson(x.pid)}>
                  <span className="chip gold" style={{ minWidth: 76, justifyContent: 'center' }}>
                    {x.when}
                  </span>
                  <span>
                    <span className="li-t">{x.title}</span>
                    <span className="li-s">{x.sub}</span>
                  </span>
                </button>
              ))}
              {!vm.days.length && <div className="empty">No birthdays or anniversaries in the next few weeks.</div>}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2 className="h2">Record hints waiting</h2>
            </div>
            <div className="list">
              {vm.hints.map((h) => (
                <button key={h.id} className="li" onClick={() => setUi({ section: 'research', rtab: 'hints', hintSel: h.id, panel: null })}>
                  <span className="badge hint">{h.score}% match</span>
                  <span>
                    <span className="li-t">{T.nm(h.personId)}</span>
                    <span className="li-s">
                      {h.provider} · {h.collection}
                    </span>
                  </span>
                </button>
              ))}
              {!vm.hints.length && <Empty>All caught up — no hints to review.</Empty>}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2 className="h2">Open research tasks</h2>
            </div>
            <div className="list">
              {vm.tasks.map((t) => (
                <button key={t.id} className="li" onClick={() => setUi({ section: 'research', rtab: 'tasks', taskOpen: t.id, panel: null })}>
                  <span className={'conf ' + (t.status === 'In progress' ? 'st-prog' : 'st-todo')}>{t.status}</span>
                  <span>
                    <span className="li-t">{t.title}</span>
                    <span className="li-s">
                      {t.personId ? T.short(t.personId) + ' · ' : ''}
                      {t.priority} priority
                    </span>
                  </span>
                </button>
              ))}
              {!vm.tasks.length && <div className="empty">No open tasks. Create one from any unverified fact.</div>}
            </div>
          </section>
          <section className="card span2">
            <div className="card-head">
              <h2 className="h2">Recently added media</h2>
              <div className="spacer" />
              <button className="btn sm ghost" onClick={() => go('media')}>
                See all
              </button>
            </div>
            {vm.media.length ? (
              <div className="mgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {vm.media.map((m) => (
                  <button key={m.id} className="mtile" onClick={() => openMedia(m.id)}>
                    <MediaThumb m={m} />
                    <div className="mt-b">
                      <span className="li-t">{m.title}</span>
                      <span className="li-s">{m.date}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Empty illo="photo">
                No photos yet.
                <button className="btn primary sm" onClick={() => setUi({ modal: { kind: 'upload' } })}>
                  Upload a photo
                </button>
              </Empty>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
