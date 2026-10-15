// Map and migration (ported from the prototype's vmMap). A stylised world map that works
// fully offline, with pins for every place that has coordinates and arrows between the
// places each person lived, played along a timeline.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../data/store';
import { openPerson, openPlace } from '../../data/actions';
import { treeApi } from '../../lib/family';
import { dateLabel, factYear } from '../../lib/dates';
import { Icon, Seg } from '../../components/ui';
import { LAND, MED } from './land';
import { DetailedMap, type MapMove, type MapPin } from './DetailedMap';
import { isTauri } from '../../data/platform';
import { setUi } from '../../data/ui';

const KIND_KEY = 'familytree.mapKind';
const savedKind = (): 'detailed' | 'simple' => {
  try {
    return (localStorage.getItem(KIND_KEY) as 'detailed' | 'simple') || (isTauri() ? 'detailed' : 'simple');
  } catch {
    return isTauri() ? 'detailed' : 'simple';
  }
};

type Mode = 'all' | 'line' | 'person';
type Cat = 'Birth' | 'Marriage' | 'Death' | 'Residence';
const REGIONS: Record<string, [number, number, number, number]> = {
  world: [-22, -66, 204, 120],
  uk: [-11.5, -59.5, 16, 11],
  aus: [134, 8.5, 28, 35],
};
const pts = (a: number[][]) => a.map((p) => p[0] + ',' + -p[1]).join(' ');
const LAND_PTS = LAND.map(pts);
const MED_PTS = pts(MED);
const SEA_ROUTE = [[-6, 48], [-10, 40], [-6, 36], [12, 37.5], [32.3, 31.3], [43.5, 12.5], [60, 14], [79.8, 6.9], [95, 5.5], [106.8, -6.1], [125, -9], [142.2, -10.6]];
const THIS_YEAR = new Date().getFullYear();

export function MapView() {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const [mode, setMode] = useState<Mode>('line');
  const lines = useMemo(() => {
    const out: { v: string; l: string }[] = [];
    const label = (id: string) => {
      const sp = T.spouses(id)[0];
      return sp ? `${T.short(id)} & ${T.short(sp)}` : T.short(id);
    };
    if (T.rootId) out.push({ v: T.rootId, l: label(T.rootId) + (data.settings.is_sample ? ' — the emigrants' : '') });
    for (const c of T.children(T.rootId)) if (T.children(c).length || T.spouses(c).length) out.push({ v: c, l: label(c) });
    const seen = new Set(out.map((x) => x.v));
    for (const b of T.branches()) if (b.key.startsWith('fam-')) {
      const id = b.key.slice(4);
      if (!seen.has(id) && T.person[id]) out.push({ v: id, l: label(id) });
    }
    return out;
  }, [data]);
  const [line, setLine] = useState(lines[0]?.v || '');
  const [person, setPerson] = useState(T.rootId);
  const [types, setTypes] = useState<Record<Cat, boolean>>({ Birth: true, Marriage: true, Death: true, Residence: true });
  const [year, setYear] = useState(THIS_YEAR);
  const [playing, setPlaying] = useState(false);
  const [region, setRegion] = useState<'world' | 'uk' | 'aus' | 'fit'>('world');
  const [sel, setSel] = useState<string | null>(null);
  const [kind, setKindState] = useState<'detailed' | 'simple'>(savedKind);
  const [failNote, setFailNote] = useState('');
  const setKind = (k: 'detailed' | 'simple') => {
    setKindState(k);
    setFailNote('');
    try {
      localStorage.setItem(KIND_KEY, k);
    } catch {
      /* remembered for this session only */
    }
  };
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 700 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 900, h: el.clientHeight || 700 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setYear((y) => {
        if (y + 1 >= THIS_YEAR) {
          setPlaying(false);
          return THIS_YEAR;
        }
        return y + 1;
      });
    }, 110);
    return () => clearInterval(t);
  }, [playing]);

  const geoPlaces = data.places.filter((p) => p.lat !== null && p.lon !== null);
  const fitBox = useMemo((): [number, number, number, number] => {
    if (!geoPlaces.length) return REGIONS.world;
    const xs = geoPlaces.map((p) => p.lon!);
    const ys = geoPlaces.map((p) => -p.lat!);
    const x0 = Math.min(...xs) - 6;
    const y0 = Math.min(...ys) - 6;
    return [x0, y0, Math.max(14, Math.max(...xs) + 6 - x0), Math.max(10, Math.max(...ys) + 6 - y0)];
  }, [data.places]);
  const R = region === 'fit' ? fitBox : REGIONS[region];
  const upp = Math.max(R[2] / size.w, R[3] / size.h);

  const vm = useMemo(() => {
    let ids = mode === 'all' ? data.people.map((p) => p.id) : mode === 'line' ? T.lineOf(line) : [person];
    ids = ids.filter((id) => T.person[id]);
    const cat = (t: string): Cat => (({ Birth: 'Birth', Baptism: 'Birth', Marriage: 'Marriage', Death: 'Death', Burial: 'Death' }) as Record<string, Cat>)[t] || 'Residence';
    const evs: { pid: string; f: (typeof data.facts)[number]; pl: (typeof data.places)[number]; y: number; cat: Cat }[] = [];
    for (const pid of ids)
      for (const f of T.factsOf(pid)) {
        const pl = T.place[f.placeId];
        const y = factYear(f);
        if (pl && pl.lat !== null && pl.lon !== null && y) evs.push({ pid, f, pl, y, cat: cat(f.type) });
        // Where they lived at their birth or death counts as a residence on the map
        const home = f.homePlaceId ? T.place[f.homePlaceId] : undefined;
        if (home && home.id !== f.placeId && home.lat !== null && home.lon !== null && y)
          evs.push({ pid, f: { ...f, type: f.type === 'Birth' ? 'Family home at birth' : 'Home at death' }, pl: home, y, cat: 'Residence' });
      }
    const shown = evs.filter((e) => e.y <= year && types[e.cat]);
    const by: Record<string, typeof evs> = {};
    shown.forEach((e) => (by[e.pl.id] = by[e.pl.id] || []).push(e));
    const segs: Record<string, { a: typeof data.places[number]; b: typeof data.places[number]; y: number }> = {};
    if (mode !== 'all')
      for (const pid of ids) {
        const L = evs.filter((e) => e.pid === pid).sort((a, b) => a.y - b.y);
        for (let i = 1; i < L.length; i++) {
          const a = L[i - 1].pl;
          const b = L[i].pl;
          if (a.id === b.id || L[i].y > year) continue;
          const k = a.id + '>' + b.id;
          if (!segs[k]) segs[k] = { a, b, y: L[i].y };
          segs[k].y = Math.min(segs[k].y, L[i].y);
        }
      }
    const alive: Record<string, number> = {};
    let aliveN = 0;
    for (const pid of ids) {
      const p = T.person[pid];
      const b = factYear(T.ff(pid, 'Birth'));
      const de = factYear(T.ff(pid, 'Death'));
      if (!b || b > year) continue;
      if (de && de < year) continue;
      if (!de && !p.living && year > b + 90) continue;
      const L = evs.filter((e) => e.pid === pid && e.y <= year).sort((a, b2) => a.y - b2.y);
      const last = L[L.length - 1];
      if (!last) continue;
      aliveN++;
      alive[last.pl.id] = (alive[last.pl.id] || 0) + 1;
    }
    return { evs, shown, by, segs: Object.values(segs), alive, aliveN };
  }, [data, mode, line, person, year, types]);

  const route = (a: { lat: number | null; lon: number | null }, b: { lat: number | null; lon: number | null }): number[][] | null => {
    if (a.lon! < 45 && b.lon! > 100) {
      const ps = [[a.lon!, a.lat!], ...SEA_ROUTE];
      [[146.2, -17.6], [149.8, -21.5], [152.8, -25]].forEach((p) => {
        if (p[1] > b.lat!) ps.push(p);
      });
      ps.push([b.lon!, b.lat!]);
      return ps;
    }
    if (b.lon! < 45 && a.lon! > 100) return route(b, a)!.reverse();
    return null;
  };

  const arrows = vm.segs.map((s) => {
    let d: string;
    let px: number;
    let py: number;
    let ex: number;
    let ey: number;
    const rt = route(s.a, s.b);
    if (rt) {
      d = 'M' + rt.map((p) => p[0] + ' ' + -p[1]).join(' L');
      const p1 = rt[rt.length - 2];
      const p2 = rt[rt.length - 1];
      [px, py, ex, ey] = [p1[0], -p1[1], p2[0], -p2[1]];
    } else {
      const [x1, y1, x2, y2] = [s.a.lon!, -s.a.lat!, s.b.lon!, -s.b.lat!];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const cxp = mx - (y2 - y1) * 0.22;
      const cyp = my + (x2 - x1) * 0.22;
      d = `M${x1} ${y1} Q${cxp} ${cyp} ${x2} ${y2}`;
      [px, py, ex, ey] = [cxp, cyp, x2, y2];
    }
    const ang = Math.atan2(ey - py, ex - px);
    const sz = 10 * upp;
    const bx = ex - Math.cos(ang) * sz;
    const by = ey - Math.sin(ang) * sz;
    const nx = -Math.sin(ang) * sz * 0.5;
    const ny = Math.cos(ang) * sz * 0.5;
    const recent = year - s.y <= 10;
    return { d, recent, head: `${ex},${ey} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`, key: s.a.id + s.b.id };
  });

  const detailedPins: MapPin[] = useMemo(
    () =>
      Object.keys(vm.by).map((id) => {
        const pl = T.place[id];
        return { id, label: pl.name.split(',')[0], lon: pl.lon!, lat: pl.lat!, n: vm.by[id].length, sel: sel === id };
      }),
    [vm, sel],
  );
  const detailedMoves: MapMove[] = useMemo(
    () =>
      vm.segs.map((s) => {
        const rt = route(s.a, s.b);
        let coords: [number, number][];
        if (rt) coords = rt.map((p) => [p[0], p[1]] as [number, number]);
        else {
          // A gentle curve between the two places.
          const [x1, y1, x2, y2] = [s.a.lon!, s.a.lat!, s.b.lon!, s.b.lat!];
          const cx = (x1 + x2) / 2 + (y2 - y1) * 0.22;
          const cy = (y1 + y2) / 2 - (x2 - x1) * 0.22;
          coords = Array.from({ length: 21 }, (_, i) => {
            const t = i / 20;
            return [(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2] as [number, number];
          });
        }
        return { key: s.a.id + '>' + s.b.id, coords, recent: year - s.y <= 10 };
      }),
    [vm, year],
  );

  const maxA = Math.max(1, ...Object.values(vm.alive));
  const summary = Object.keys(vm.alive)
    .sort((a, b) => vm.alive[b] - vm.alive[a])
    .slice(0, 8);
  const mp = sel ? T.place[sel] : null;
  const placeEvents = mp ? vm.evs.filter((e) => e.pl.id === sel && e.y <= year).sort((a, b) => a.y - b.y) : [];
  const showVoyage = data.settings.is_sample === '1' && mode === 'line' && T.lineOf(line).includes('p1') && year >= 1885 && region === 'world';
  const minYear = Math.min(1850, ...vm.evs.map((e) => e.y));
  const noCoords = data.places.length - geoPlaces.length;

  return (
    <div className="view">
      <div className="mapwrap">
        <div className="mapside">
          <h1 className="h2">Map and migration</h1>
          <Seg label="Show" value={mode} onChange={(k) => { setPlaying(false); setMode(k); }} options={[['all', 'All places'], ['line', 'Family line'], ['person', 'One person']]} />
          {mode === 'line' && (
            <label className="fl">
              Family line
              <select value={line} onChange={(e) => { setLine(e.target.value); setRegion('world'); }}>
                {lines.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === 'person' && (
            <label className="fl">
              Person
              <select value={person} onChange={(e) => setPerson(e.target.value)}>
                {T.peopleSorted().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.surname}, {p.given}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <div className="fl" style={{ marginBottom: 4 }}>
              Show events
            </div>
            {(['Birth', 'Marriage', 'Death', 'Residence'] as Cat[]).map((t) => (
              <label key={t} className="ck">
                <input type="checkbox" checked={types[t]} onChange={() => setTypes({ ...types, [t]: !types[t] })} />
                {t === 'Residence' ? 'Residence & travel' : t}
              </label>
            ))}
          </div>
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <span className="yearbig" aria-live="polite">
                {year}
              </span>
              <span className="muted small" style={{ paddingBottom: 6 }}>
                {vm.aliveN} relatives alive
              </span>
            </div>
            <input type="range" min={minYear} max={THIS_YEAR} step={1} value={year} onChange={(e) => { setPlaying(false); setYear(+e.target.value); }} aria-label="Timeline year" />
            <div style={{ display: 'flex', justifyContent: 'space-between' }} className="muted small">
              <span>{minYear}</span>
              <span>{THIS_YEAR}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                style={{ flex: 1 }}
                onClick={() => {
                  if (!playing && year >= THIS_YEAR) setYear(1880);
                  setPlaying(!playing);
                }}
              >
                <Icon name={playing ? 'pause' : 'play'} sm />
                {playing ? 'Pause' : 'Play timeline'}
              </button>
              <button className="btn" onClick={() => { setPlaying(false); setYear(1880); }}>
                1880
              </button>
            </div>
            {summary.map((id) => (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 24px', gap: 8, alignItems: 'center' }} className="small">
                <span>{T.place[id].name.split(',')[0]}</span>
                <span style={{ background: 'var(--surface2)', borderRadius: 4 }}>
                  <span className="bar" style={{ width: Math.round((vm.alive[id] / maxA) * 100) + '%' }} />
                </span>
                <span className="strong">{vm.alive[id]}</span>
              </div>
            ))}
          </div>
          {mp && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 className="h3">
                    <button className="link" style={{ font: 'inherit' }} onClick={() => openPlace(mp.id)}>
                      {mp.name}
                    </button>
                  </h2>
                  {mp.hist && <div className="muted small">Historically: {mp.hist}</div>}
                </div>
                <button className="btn sm ghost" onClick={() => setSel(null)} aria-label="Close place details">
                  <Icon name="close" sm />
                </button>
              </div>
              <div className="list" style={{ marginTop: 8 }}>
                {placeEvents.map((e) => (
                  <button key={e.f.id} className="li" onClick={() => openPerson(e.pid)}>
                    <span>
                      <span className="li-t">{T.nm(e.pid)}</span>
                      <span className="li-s">
                        {e.f.type} · {dateLabel(e.f)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {!placeEvents.length && <p className="muted small">No events here by {year}.</p>}
            </div>
          )}
          {noCoords > 0 && (
            <div className="privacy-note" style={{ flexDirection: 'column', gap: 8 }}>
              <span>
                {noCoords} place{noCoords === 1 ? ' has' : 's have'} no map position yet.
              </span>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setUi({ modal: { kind: 'geocodeAll' } })}>
                <Icon name="map" sm />
                Find them on the map…
              </button>
            </div>
          )}
        </div>
        <div className="mapcanvas" ref={boxRef}>
          {kind === 'detailed' && !failNote && (
            <DetailedMap
              pins={detailedPins}
              moves={detailedMoves}
              bounds={[R[0], -(R[1] + R[3]), R[0] + R[2], -R[1]]}
              onSelect={setSel}
              onFail={(why) => {
                console.warn('Detailed map unavailable:', why);
                setFailNote('The detailed map needs the internet the first time you look at an area. Showing the simple map instead.');
              }}
            />
          )}
          {(kind === 'simple' || failNote) && (
          <svg viewBox={R.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of family places and migrations">
            <rect x={R[0] - 50} y={R[1] - 50} width={R[2] + 100} height={R[3] + 100} style={{ fill: 'var(--sea)' }} />
            {LAND_PTS.map((p, i) => (
              <polygon key={i} className="land" points={p} vectorEffect="non-scaling-stroke" />
            ))}
            <polygon className="medsea" points={MED_PTS} vectorEffect="non-scaling-stroke" />
            {arrows.map((a) => (
              <g key={a.key}>
                <path className={a.recent ? 'mv recent' : 'mv'} d={a.d} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                <polygon className={a.recent ? 'mvh recent' : 'mvh'} points={a.head} />
              </g>
            ))}
            {showVoyage && (
              <text x={62} y={-8} className="plabel" style={{ fontSize: 12 * upp, strokeWidth: 3 * upp }}>
                1885 · RMS Carnmarth, Liverpool → Brisbane
              </text>
            )}
            {Object.keys(vm.by).map((id) => {
              const pl = T.place[id];
              const n = vm.by[id].length;
              const r = (9 + Math.min(7, n / 2)) * upp;
              return (
                <g key={id} onClick={() => setSel(id)} role="button" aria-label={`${pl.name}: ${n} events`} style={{ cursor: 'pointer' }}>
                  <circle className={sel === id ? 'pin sel' : 'pin'} cx={pl.lon!} cy={-pl.lat!} r={r} vectorEffect="non-scaling-stroke" />
                  <text className="pintx" x={pl.lon!} y={-pl.lat! + 3.8 * upp} textAnchor="middle" style={{ fontSize: (n > 9 ? 10 : 11) * upp }}>
                    {n}
                  </text>
                  <text className="plabel" x={pl.lon! + r + 4 * upp} y={-pl.lat! + 4.5 * upp} style={{ fontSize: 13 * upp, strokeWidth: 3 * upp }}>
                    {pl.name.split(',')[0]}
                  </text>
                </g>
              );
            })}
          </svg>
          )}
          <div className="mapbtns" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', left: 16 }}>
            <Seg label="Map style" value={kind} onChange={setKind} options={[['detailed', 'Detailed'], ['simple', 'Simple']]} />
            <Seg label="Map area" value={region} onChange={setRegion} options={[['world', 'World'], ['uk', 'British Isles'], ['aus', 'Eastern Australia'], ['fit', 'All my places']]} />
          </div>
          <div className="mapnote">
            {vm.shown.length} events shown · {failNote || (kind === 'detailed' ? 'areas you’ve viewed are saved for offline use' : 'simple map · works offline')}
          </div>
        </div>
      </div>
    </div>
  );
}
