import { useState } from 'react';
import { useData } from '../../data/store';
import { openPerson, updatePlace } from '../../data/actions';
import { treeApi } from '../../lib/family';
import { dateLabel } from '../../lib/dates';
import { Icon } from '../../components/ui';
import { FindOnMap } from '../map/Geocode';

export function PlacePanel({ id }: { id: string }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const p = T.place[id];
  const [editing, setEditing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [d, setD] = useState({ name: p.name, hist: p.hist, lat: p.lat?.toString() || '', lon: p.lon?.toString() || '' });
  const events = data.facts.filter((f) => f.placeId === id).sort((a, b) => (a.sortYear || 9999) - (b.sortYear || 9999));
  const media = data.media.filter((m) => m.placeId === id);
  const num = (s: string) => (s.trim() === '' || isNaN(+s) ? null : +s);
  return (
    <div className="pbody">
      <div>
        <span className="chip">Place</span>
        <h2 className="pname" style={{ marginTop: 8 }}>
          {p.name}
        </h2>
        {p.hist && p.hist !== p.name && <div className="muted">Historically: {p.hist}</div>}
        {p.lat !== null && p.lon !== null && (
          <div className="small muted">
            {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
          </div>
        )}
      </div>
      {editing ? (
        <div className="form">
          <label className="fl">
            Name
            <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </label>
          <label className="fl">
            Historical name
            <input value={d.hist} onChange={(e) => setD({ ...d, hist: e.target.value })} placeholder="e.g. Brisbane, Colony of Queensland" />
          </label>
          <div className="frow">
            <label className="fl">
              Latitude
              <input value={d.lat} onChange={(e) => setD({ ...d, lat: e.target.value })} placeholder="-27.47" inputMode="decimal" />
            </label>
            <label className="fl">
              Longitude
              <input value={d.lon} onChange={(e) => setD({ ...d, lon: e.target.value })} placeholder="153.03" inputMode="decimal" />
            </label>
          </div>
          <span className="fieldnote">Coordinates put this place on the map.</span>
          <div className="row">
            <button
              className="btn primary"
              onClick={async () => {
                await updatePlace(id, { name: d.name.trim() || p.name, hist: d.hist.trim(), lat: num(d.lat), lon: num(d.lon) });
                setEditing(false);
              }}
            >
              Save
            </button>
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : finding ? (
        <FindOnMap place={p} onDone={() => setFinding(false)} />
      ) : (
        <div className="row">
          <button className="btn sm" onClick={() => setEditing(true)}>
            <Icon name="edit" sm />
            Edit place
          </button>
          <button className="btn sm" onClick={() => setFinding(true)}>
            <Icon name="map" sm />
            {p.lat === null ? 'Find on map' : 'Change map position'}
          </button>
        </div>
      )}
      <h3 className="h3">
        {events.length} event{events.length === 1 ? '' : 's'} here
      </h3>
      <div className="list">
        {events.map((e) => (
          <button key={e.id} className="li" onClick={() => openPerson(e.personId)}>
            <span>
              <span className="li-t">{T.nm(e.personId)}</span>
              <span className="li-s">
                {e.type} · {dateLabel(e)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {media.length > 0 && <div className="muted small">{media.length} photos and documents are from here.</div>}
    </div>
  );
}
