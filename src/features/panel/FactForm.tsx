import { DateInput } from '../../components/DateInput';
import { useData } from '../../data/store';
import { setUi, toast, type FactForm } from '../../data/ui';
import { deleteFact, saveFact } from '../../data/actions';
import { treeApi } from '../../lib/family';
import { confOf } from '../../lib/confidence';
import { QUALIFIERS } from '../../lib/dates';
import { FACT_TYPES, HOME_EVENTS, type Quality } from '../../lib/types';
import { Conf, PlaceInput } from '../../components/ui';

/** Add or edit a fact, with citations and a live preview of its confidence. */
export function FactFormView({ fm }: { fm: FactForm }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const set = (patch: Partial<FactForm>) => setUi((s) => ({ form: s.form ? { ...s.form, ...patch } : s.form }));
  const allCites = [...fm.cites.map((id) => T.cite[id]).filter(Boolean), ...fm.newCites];
  const preview = confOf(fm.q, allCites, fm.conf);
  const types = FACT_TYPES.includes(fm.type) ? FACT_TYPES : [fm.type, ...FACT_TYPES];
  const sources = data.sources.slice().sort((a, b) => a.title.localeCompare(b.title));
  const id = (k: string) => `ff-${fm.fid || 'new'}-${k}`;

  return (
    <div className="form" onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && saveFact(fm)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="h3">{fm.fid ? 'Edit fact' : 'Add a fact'}</span>
        <div className="spacer" />
        <span className="small muted">Will be</span>
        <Conf c={preview} />
      </div>
      <div className="frow">
        <label className="fl" htmlFor={id('type')}>
          Event
          <select id={id('type')} value={fm.type} onChange={(e) => set({ type: e.target.value })}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="fl" htmlFor={id('q')}>
          Date is
          <select id={id('q')} value={fm.q} onChange={(e) => set({ q: e.target.value as FactForm['q'] })}>
            {QUALIFIERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="frow">
        <label className="fl" htmlFor={id('date')}>
          Date
          <DateInput id={id('date')} value={fm.date} onChange={(v) => set({ date: v })} label="date" />
        </label>
        {fm.q === 'between' ? (
          <label className="fl" htmlFor={id('date2')}>
            and
            <DateInput id={id('date2')} value={fm.date2} onChange={(v) => set({ date2: v })} placeholder="e.g. 1892" label="second date" />
          </label>
        ) : (
          <label className="fl" htmlFor={id('place')}>
            Place
            <PlaceInput id={id('place')} value={fm.place} onChange={(v) => set({ place: v })} />
          </label>
        )}
      </div>
      {fm.q === 'between' && (
        <label className="fl" htmlFor={id('place2')}>
          Place
          <PlaceInput id={id('place2')} value={fm.place} onChange={(v) => set({ place: v })} />
        </label>
      )}
      {HOME_EVENTS[fm.type] && (
        <label className="fl" htmlFor={id('home')}>
          {HOME_EVENTS[fm.type]}
          <PlaceInput id={id('home')} value={fm.home || ''} onChange={(v) => set({ home: v })} />
          <span className="fieldnote">Where {fm.type === 'Birth' ? 'the family was living when they were born' : 'they were living when they died'} — this can be different from the {fm.type === 'Birth' ? 'birthplace (such as a hospital)' : 'place of death'}.</span>
        </label>
      )}
      <label className="fl" htmlFor={id('desc')}>
        Description
        <input id={id('desc')} value={fm.desc} onChange={(e) => set({ desc: e.target.value })} placeholder="Optional detail" />
      </label>
      <div className="attach">
        <span className="fl">Citations</span>
        {fm.cites.map((cid) => {
          const c = T.cite[cid];
          const s = c && T.source[c.sourceId];
          return (
            <div key={cid} style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="small">
              <span style={{ flex: 1 }}>
                {s ? s.title : 'Source'} · {c?.page} <span className="muted">({c?.quality})</span>
              </span>
              <button className="btn sm ghost" onClick={() => set({ cites: fm.cites.filter((x) => x !== cid) })} aria-label="Remove citation">
                Remove
              </button>
            </div>
          );
        })}
        {fm.newCites.map((nc, i) => (
          <div key={'n' + i} style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="small">
            <span style={{ flex: 1 }}>
              {T.source[nc.sourceId]?.title} · {nc.page} <span className="muted">({nc.quality} · new)</span>
            </span>
            <button className="btn sm ghost" onClick={() => set({ newCites: fm.newCites.filter((_, j) => j !== i) })} aria-label="Remove citation">
              Remove
            </button>
          </div>
        ))}
        {!allCites.length && <span className="small muted">No evidence attached — this fact will stay Unverified.</span>}
        <select value={fm.newSrc} onChange={(e) => set({ newSrc: e.target.value })} aria-label="Source">
          <option value="">Choose an existing source…</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <div className="frow">
          <input value={fm.newPage} onChange={(e) => set({ newPage: e.target.value })} placeholder="Page or entry" aria-label="Page or entry" />
          <select value={fm.newQual} onChange={(e) => set({ newQual: e.target.value as Quality })} aria-label="Quality">
            {['Primary', 'Secondary', 'Questionable'].map((x) => (
              <option key={x} value={x}>
                {x} evidence
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <button
            className="btn sm"
            onClick={() => {
              if (!fm.newSrc) {
                toast('Choose a source first');
                return;
              }
              set({ newCites: [...fm.newCites, { sourceId: fm.newSrc, page: fm.newPage.trim() || 'Entry not recorded', quality: fm.newQual }], newSrc: '', newPage: '' });
            }}
          >
            Attach citation
          </button>
          <button className="btn sm ghost" onClick={() => setUi({ modal: { kind: 'source', title: '', type: 'Certificate', repo: '', url: '' } })}>
            New source…
          </button>
        </div>
      </div>
      <label className="fl" htmlFor={id('conf')}>
        Confidence
        <select id={id('conf')} value={fm.conf} onChange={(e) => set({ conf: e.target.value as FactForm['conf'] })}>
          <option value="auto">Automatic (from evidence)</option>
          <option value="Proven">Proven</option>
          <option value="Probable">Probable</option>
          <option value="Unverified">Unverified</option>
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={() => saveFact(fm)}>
          Save
        </button>
        <button className="btn" onClick={() => setUi({ form: null })}>
          Cancel
        </button>
        <div className="spacer" />
        {fm.fid && (
          <button className="btn ghost danger" onClick={() => deleteFact(fm.fid!)}>
            Delete fact
          </button>
        )}
      </div>
    </div>
  );
}
