import { useData } from '../../data/store';
import { setUi, useUi } from '../../data/ui';
import { deleteCitation, deleteSource, openMedia, openPerson, saveCitation } from '../../data/actions';
import { openUrl } from '../../data/platform';
import { treeApi } from '../../lib/family';
import { dateLabel, todayLabel } from '../../lib/dates';
import { Icon } from '../../components/ui';
import { MediaThumb } from '../media/MediaThumb';
import type { Quality } from '../../lib/types';

export function SourcePanel({ sid }: { sid: string }) {
  const data = useData((s) => s.data);
  const cf = useUi((s) => s.cf);
  const T = treeApi(data);
  const s = T.source[sid];
  const cites = data.cites.filter((c) => c.sourceId === sid);
  const media = data.media.filter((m) => m.sourceIds.includes(sid));
  const set = (patch: Partial<NonNullable<typeof cf>>) => setUi((st) => ({ cf: st.cf ? { ...st.cf, ...patch } : st.cf }));
  const factOptions = data.facts
    .slice()
    .sort((a, b) => T.sortName(a.personId).localeCompare(T.sortName(b.personId)) || (a.sortYear || 0) - (b.sortYear || 0));

  return (
    <div className="pbody">
      <div>
        <span className="chip">{s.type}</span>
        <h2 className="pname" style={{ marginTop: 8 }}>
          {s.title}
        </h2>
        <div className="muted">{s.repo}</div>
        {s.url && (
          <button className="link small" onClick={() => openUrl(s.url)} style={{ textAlign: 'left', wordBreak: 'break-all' }}>
            {s.url} <Icon name="external" sm />
          </button>
        )}
      </div>
      <div className="row">
        <button className="btn sm" onClick={() => setUi({ modal: { kind: 'source', id: s.id, title: s.title, type: s.type, repo: s.repo, url: s.url } })}>
          <Icon name="edit" sm />
          Edit source
        </button>
        <button className="btn sm" onClick={() => setUi({ modal: { kind: 'upload', forSource: sid } })}>
          <Icon name="upload" sm />
          Attach a scan
        </button>
        <button
          className="btn sm ghost danger"
          onClick={() =>
            setUi({
              modal: {
                kind: 'confirm',
                title: 'Delete this source?',
                body: `“${s.title}” and its ${cites.length} citation${cites.length === 1 ? '' : 's'} will be removed. Facts that relied only on it become Unverified.`,
                action: 'Delete source',
                danger: true,
                onConfirm: () => deleteSource(sid),
              },
            })
          }
        >
          Delete
        </button>
      </div>
      {media.length > 0 && (
        <div className="mgrid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {media.map((m) => (
            <button key={m.id} className="mtile" onClick={() => openMedia(m.id)}>
              <MediaThumb m={m} tag={false} />
              <div className="mt-b">
                <span className="li-t">{m.title}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 className="h3" style={{ flex: 1 }}>
          {cites.length} citation{cites.length === 1 ? '' : 's'}
        </h3>
        <button className="btn sm primary" onClick={() => setUi({ cf: { page: '', accessed: todayLabel(), quality: 'Primary', extract: '', fact: '' } })}>
          New citation
        </button>
      </div>
      {cf && (
        <div className="form">
          <span className="h3">Create a citation from this source</span>
          <div className="frow">
            <label className="fl">
              Page or entry
              <input value={cf.page} onChange={(e) => set({ page: e.target.value })} placeholder="e.g. Reg. 1890/B/4127" autoFocus />
            </label>
            <label className="fl">
              Date accessed
              <input value={cf.accessed} onChange={(e) => set({ accessed: e.target.value })} />
            </label>
          </div>
          <label className="fl">
            Evidence quality
            <select value={cf.quality} onChange={(e) => set({ quality: e.target.value as Quality })}>
              <option value="Primary">Primary — made at the time by someone who was there</option>
              <option value="Secondary">Secondary — recorded later or second-hand</option>
              <option value="Questionable">Questionable — unreliable or conflicting</option>
            </select>
          </label>
          <label className="fl">
            Transcript or extract
            <textarea value={cf.extract} onChange={(e) => set({ extract: e.target.value })} placeholder="Copy the exact words from the record" />
          </label>
          <label className="fl">
            Attach to a fact
            <select value={cf.fact} onChange={(e) => set({ fact: e.target.value })}>
              <option value="">Don’t attach to a fact yet</option>
              {factOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {T.person[f.personId]?.surname}, {T.first(f.personId)} — {f.type}
                  {f.date ? ' ' + dateLabel(f) : ''}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn primary"
              onClick={async () => {
                if (await saveCitation(sid, cf)) setUi({ cf: null });
              }}
            >
              Save citation
            </button>
            <button className="btn" onClick={() => setUi({ cf: null })}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {cites.map((c) => {
        const fs = data.facts.filter((f) => f.citeIds.includes(c.id));
        return (
          <div key={c.id} className="fact-box" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="fact-top">
              <span className="fact-type">{c.page || 'No page recorded'}</span>
              <div className="spacer" />
              <span className={c.quality === 'Primary' ? 'conf conf-proven' : c.quality === 'Secondary' ? 'conf conf-probable' : 'conf conf-unverified'}>{c.quality}</span>
            </div>
            {c.accessed && <span className="small muted">Accessed {c.accessed}</span>}
            {c.extract && <div className="extract small">{c.extract}</div>}
            <div className="small strong">Supports</div>
            {fs.map((f) => (
              <button key={f.id} className="link small" onClick={() => openPerson(f.personId)} style={{ textAlign: 'left' }}>
                {T.nm(f.personId)} — {f.type}
                {f.date ? ', ' + dateLabel(f) : ''}
              </button>
            ))}
            {!fs.length && (
              <div className="row">
                <span className="small muted grow">Not attached to any fact yet.</span>
                <button className="btn sm ghost danger" onClick={() => deleteCitation(c.id)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
