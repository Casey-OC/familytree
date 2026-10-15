// Looking up map positions for places (OpenStreetMap Nominatim, needs the internet).

import { useEffect, useRef, useState } from 'react';
import { useData } from '../../data/store';
import { toast } from '../../data/ui';
import { updatePlace } from '../../data/actions';
import { geocode, type GeoResult } from '../../data/platform';
import { ModalFrame } from '../../components/ui';
import type { Place } from '../../lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Search box + results for one place (used in the place panel). */
export function FindOnMap({ place, onDone }: { place: Place; onDone: () => void }) {
  const [q, setQ] = useState(place.hist || place.name);
  const [res, setRes] = useState<GeoResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    setBusy(true);
    try {
      setRes(await geocode(q));
    } catch (e) {
      toast(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="form">
      <span className="h3">Find on the map</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} aria-label="Place to search for" autoFocus />
        <button className="btn primary" onClick={search} disabled={busy || !q.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {res && !res.length && <span className="small muted">No matches. Try the town and country, e.g. “Redruth, England”.</span>}
      <div className="list">
        {res?.map((r, i) => (
          <button
            key={i}
            className="li"
            onClick={async () => {
              await updatePlace(place.id, { lat: +r.lat.toFixed(5), lon: +r.lon.toFixed(5) });
              toast(`${place.name} is now on the map`);
              onDone();
            }}
          >
            <span>
              <span className="li-t">{r.name}</span>
              <span className="li-s">
                {r.lat.toFixed(3)}, {r.lon.toFixed(3)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <span className="fieldnote">Searches OpenStreetMap. Only the place name is sent.</span>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

/** Finds positions for every place that doesn't have one, one at a time, then lets you confirm. */
export function GeocodeAllModal({ close }: { close: () => void }) {
  const places = useData((s) => s.data.places);
  const todo = places.filter((p) => p.lat === null || p.lon === null);
  const [found, setFound] = useState<Record<string, GeoResult | null>>({});
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const stop = useRef(false);

  useEffect(() => () => void (stop.current = true), []);

  const run = async () => {
    setRunning(true);
    setError('');
    stop.current = false;
    for (const p of todo) {
      if (stop.current) break;
      if (p.id in found) continue;
      try {
        const r = await geocode(p.hist || p.name);
        setFound((f) => ({ ...f, [p.id]: r[0] || null }));
        if (r[0]) setAccept((a) => ({ ...a, [p.id]: true }));
      } catch (e) {
        setError(String((e as Error)?.message || e));
        break;
      }
      await sleep(1100); // OpenStreetMap asks for no more than one search a second
    }
    setRunning(false);
  };

  const save = async () => {
    let n = 0;
    for (const p of todo) {
      const r = found[p.id];
      if (r && accept[p.id]) {
        await updatePlace(p.id, { lat: +r.lat.toFixed(5), lon: +r.lon.toFixed(5) });
        n++;
      }
    }
    toast(`${n} place${n === 1 ? '' : 's'} added to the map`);
    close();
  };

  const done = Object.keys(found).length;
  return (
    <ModalFrame label="Find places on the map" onClose={close} wide>
      <h2 className="h2">Find places on the map</h2>
      <p className="muted" style={{ margin: 0 }}>
        {todo.length} place{todo.length === 1 ? '' : 's'} have no map position. We’ll look each one up on OpenStreetMap (about one a second) and you choose which matches to keep.
      </p>
      {error && <div className="privacy-note" style={{ color: 'var(--bad)' }}>{error}</div>}
      <div className="list" style={{ maxHeight: 380, overflow: 'auto' }}>
        {todo.map((p) => {
          const r = found[p.id];
          return (
            <label key={p.id} className="li" style={{ cursor: r ? 'pointer' : 'default' }}>
              <input type="checkbox" disabled={!r} checked={!!(r && accept[p.id])} onChange={(e) => setAccept({ ...accept, [p.id]: e.target.checked })} aria-label={`Keep the match for ${p.name}`} />
              <span>
                <span className="li-t">{p.name}</span>
                <span className="li-s">{p.id in found ? (r ? '→ ' + r.name : 'No match found — add it by hand from the place panel') : running ? 'Waiting…' : 'Not looked up yet'}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="mfoot">
        <span className="muted small" style={{ flex: 1 }}>
          {done} of {todo.length} looked up
        </span>
        <button className="btn" onClick={close}>
          Cancel
        </button>
        {done < todo.length && (
          <button className="btn" onClick={run} disabled={running}>
            {running ? 'Looking up…' : done ? 'Continue' : 'Look them up'}
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={running || !Object.values(accept).some(Boolean)}>
          Save to map
        </button>
      </div>
    </ModalFrame>
  );
}
