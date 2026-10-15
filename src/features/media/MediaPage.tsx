import { useMemo } from 'react';
import { useData } from '../../data/store';
import { setUi, useUi } from '../../data/ui';
import { openMedia } from '../../data/actions';
import { treeApi } from '../../lib/family';
import { yearOf } from '../../lib/dates';
import { Empty, Icon } from '../../components/ui';
import { MediaThumb } from './MediaThumb';

export function MediaPage() {
  const data = useData((s) => s.data);
  const f = useUi((s) => s.mf);
  const T = treeApi(data);
  const dec = (d: string) => {
    const y = yearOf(d);
    return y ? String(Math.floor(y / 10) * 10) : '';
  };
  const tagged = (m: (typeof data.media)[number]) => [...new Set([...m.faces.map((x) => x.personId), ...m.people])];
  const rows = useMemo(
    () =>
      data.media.filter(
        (m) =>
          (f.type === 'all' || m.kind === f.type) &&
          (f.person === 'all' || tagged(m).includes(f.person)) &&
          (f.place === 'all' || m.placeId === f.place) &&
          (f.decade === 'all' || dec(m.date) === f.decade),
      ),
    [data, f],
  );
  const decades = [...new Set(data.media.map((m) => dec(m.date)).filter(Boolean))].sort();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setUi((s) => ({ mf: { ...s.mf, [k]: e.target.value } }));
  const usedPlaces = data.places.filter((p) => data.media.some((m) => m.placeId === p.id));

  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">Media</h1>
            <p className="lede">{rows.length} items · photos, documents and recordings</p>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setUi({ modal: { kind: 'upload' } })}>
            <Icon name="upload" sm />
            Upload
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="tb-field">
            Type
            <select value={f.type} onChange={set('type')}>
              <option value="all">All types</option>
              <option value="photo">Photos</option>
              <option value="document">Documents</option>
              <option value="audio">Audio</option>
            </select>
          </label>
          <label className="tb-field">
            Person
            <select value={f.person} onChange={set('person')}>
              <option value="all">Anyone</option>
              {T.peopleSorted().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.surname}, {p.given}
                </option>
              ))}
            </select>
          </label>
          <label className="tb-field">
            Place
            <select value={f.place} onChange={set('place')}>
              <option value="all">Anywhere</option>
              {usedPlaces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tb-field">
            Decade
            <select value={f.decade} onChange={set('decade')}>
              <option value="all">Any decade</option>
              {decades.map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </select>
          </label>
          <button className="btn sm ghost" onClick={() => setUi({ mf: { type: 'all', person: 'all', place: 'all', decade: 'all' } })}>
            Clear filters
          </button>
        </div>
        <div className="mgrid">
          {rows.map((m) => {
            const n = tagged(m).length;
            return (
              <button key={m.id} className="mtile" onClick={() => openMedia(m.id)}>
                <MediaThumb m={m} />
                <div className="mt-b">
                  <span className="li-t">{m.title}</span>
                  <span className="li-s">{[m.date, T.placeName(m.placeId).split(',')[0]].filter(Boolean).join(' · ') || 'No date'}</span>
                  <span className="li-s">{n ? n + (n > 1 ? ' people' : ' person') : 'No one tagged'}</span>
                </div>
              </button>
            );
          })}
        </div>
        {!rows.length && (
          <div className="card">
            <Empty illo="photo">
              <span className="strong" style={{ color: 'var(--text)' }}>
                {data.media.length ? 'Nothing matches these filters' : 'No photos or documents yet'}
              </span>
              <button className="btn primary" onClick={() => setUi({ modal: { kind: 'upload' } })}>
                Upload a photo
              </button>
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
