import { useMemo } from 'react';
import { useData } from '../data/store';
import { setUi, useUi } from '../data/ui';
import { openSource } from '../data/actions';

export function Sources() {
  const data = useData((s) => s.data);
  const srcType = useUi((s) => s.srcType);
  const rows = useMemo(() => {
    const factsByCite: Record<string, number> = {};
    for (const f of data.facts) for (const c of f.citeIds) factsByCite[c] = (factsByCite[c] || 0) + 1;
    return data.sources
      .filter((s) => srcType === 'all' || s.type === srcType)
      .map((s) => {
        const cs = data.cites.filter((c) => c.sourceId === s.id);
        const facts = new Set<string>();
        for (const f of data.facts) if (f.citeIds.some((c) => cs.some((x) => x.id === c))) facts.add(f.id);
        return { s, cites: cs.length, facts: facts.size, media: data.media.filter((m) => m.sourceIds.includes(s.id)).length };
      })
      .sort((a, b) => a.s.title.localeCompare(b.s.title));
  }, [data, srcType]);
  const types = ['all', ...new Set(data.sources.map((s) => s.type))];
  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">Sources</h1>
            <p className="lede">{rows.length} sources · open one to create a citation or see every fact it supports</p>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setUi({ modal: { kind: 'source', title: '', type: 'Certificate', repo: '', url: '' } })}>
            Add source
          </button>
        </div>
        <label className="tb-field">
          Type
          <select value={srcType} onChange={(e) => setUi({ srcType: e.target.value })} style={{ width: 240 }}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All types' : t}
              </option>
            ))}
          </select>
        </label>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Repository</th>
                <th>Citations</th>
                <th>Facts</th>
                <th>Media</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, cites, facts, media }) => (
                <tr key={s.id}>
                  <td>
                    <button className="link" onClick={() => openSource(s.id)} style={{ color: 'var(--text)', textAlign: 'left' }}>
                      {s.title}
                    </button>
                  </td>
                  <td>
                    <span className="chip">{s.type}</span>
                  </td>
                  <td className="small">{s.repo}</td>
                  <td>{cites}</td>
                  <td>{facts}</td>
                  <td>{media}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No sources yet. Add the certificates, censuses and letters that back up your facts.</div>}
        </div>
      </div>
    </div>
  );
}
