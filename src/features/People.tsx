import { useMemo } from 'react';
import { useData } from '../data/store';
import { setUi, useUi } from '../data/ui';
import { addRelModal, openPerson } from '../data/actions';
import { treeApi } from '../lib/family';
import { dateLabel } from '../lib/dates';
import { Avatar, Seg } from '../components/ui';

export function People() {
  const data = useData((s) => s.data);
  const pq = useUi((s) => s.pq);
  const pfilter = useUi((s) => s.pfilter);
  const psort = useUi((s) => s.psort);
  const panel = useUi((s) => s.panel);
  const T = treeApi(data);

  const rows = useMemo(() => {
    const q = pq.trim().toLowerCase();
    const list = data.people.filter((p) => {
      if (q && !(p.given + ' ' + p.surname).toLowerCase().includes(q)) return false;
      if (pfilter === 'living') return p.living;
      if (pfilter === 'deceased') return !p.living;
      if (pfilter === 'unv') return T.unvCount(p.id) > 0;
      return true;
    });
    list.sort((a, b) => (psort === 'birth' ? T.birthYear(a.id) - T.birthYear(b.id) : (a.surname + ' ' + a.given).localeCompare(b.surname + ' ' + b.given)));
    return list;
  }, [data, pq, pfilter, psort]);

  // Big trees: show the first 500 rows; filtering narrows it down.
  const LIMIT = 500;

  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">People</h1>
            <p className="lede">
              {rows.length} of {data.people.length} people
            </p>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => addRelModal('', 'none')}>
            Add person
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={pq} onChange={(e) => setUi({ pq: e.target.value })} placeholder="Filter by name" aria-label="Filter people by name" style={{ width: 260 }} />
          <Seg
            label="Filter"
            value={pfilter}
            options={[
              ['all', 'All'],
              ['living', 'Living'],
              ['deceased', 'Deceased'],
              ['unv', 'Has unverified facts'],
            ]}
            onChange={(k) => setUi({ pfilter: k })}
          />
          <div className="spacer" />
          <label className="tb-field">
            Sort
            <select value={psort} onChange={(e) => setUi({ psort: e.target.value as 'name' })}>
              <option value="name">Surname</option>
              <option value="birth">Birth year</option>
            </select>
          </label>
        </div>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Born</th>
                <th>Birthplace</th>
                <th>Died</th>
                <th>Branch</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, LIMIT).map((p) => {
                const b = T.ff(p.id, 'Birth') || T.ff(p.id, 'Baptism');
                const de = T.ff(p.id, 'Death') || T.ff(p.id, 'Burial');
                const bi = T.branch(p.id);
                const unv = T.unvCount(p.id);
                return (
                  <tr key={p.id} className={panel?.id === p.id ? 'sel' : ''}>
                    <td>
                      <button className="namecell link" onClick={() => openPerson(p.id)} style={{ color: 'var(--text)' }}>
                        <Avatar pid={p.id} size="xs" />
                        {p.surname}, {p.given}
                      </button>
                    </td>
                    <td>{b ? dateLabel(b) : '—'}</td>
                    <td>{b ? T.placeName(b.placeId) || '—' : '—'}</td>
                    <td>{p.living ? 'Living' : de ? dateLabel(de) : '—'}</td>
                    <td>
                      <span className="bdot" style={{ background: bi.colour }} aria-hidden="true" />
                      {bi.label}
                    </td>
                    <td>{unv > 0 ? <span className="conf conf-unverified">? {unv} unverified</span> : <span className="conf conf-proven">✓ Sourced</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No one matches that filter.</div>}
          {rows.length > LIMIT && <div className="empty">Showing the first {LIMIT}. Type a name to narrow the list.</div>}
        </div>
      </div>
    </div>
  );
}
