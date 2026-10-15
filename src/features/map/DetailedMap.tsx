// Street-level map (MapLibre + OpenFreeMap tiles). Tiles go through the app's offline
// cache, so places you've looked at before still show without the internet.

import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { tileUrl } from '../../data/platform';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Testing hook: a different style can be set in localStorage (only localhost or OpenFreeMap are allowed). */
const styleUrl = () => {
  try {
    return localStorage.getItem('familytree.mapStyle') || STYLE_URL;
  } catch {
    return STYLE_URL;
  }
};

export interface MapPin {
  id: string;
  label: string;
  lon: number;
  lat: number;
  n: number;
  sel: boolean;
}
export interface MapMove {
  key: string;
  coords: [number, number][];
  recent: boolean;
}

const css = (name: string) => getComputedStyle(document.querySelector('.app') || document.body).getPropertyValue(name).trim() || '#1F4D3A';

function pinData(pins: MapPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id, label: p.label, n: String(p.n), r: 9 + Math.min(7, p.n / 2), sel: p.sel ? 1 : 0 } })),
  };
}
function moveData(moves: MapMove[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: moves.map((m) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: m.coords }, properties: { recent: m.recent ? 1 : 0 } })),
  };
}

export function DetailedMap({
  pins,
  moves,
  bounds,
  onSelect,
  onFail,
}: {
  pins: MapPin[];
  moves: MapMove[];
  bounds: [number, number, number, number]; // west, south, east, north
  onSelect: (id: string) => void;
  onFail: (why: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef({ pins, moves, onSelect });
  latest.current = { pins, moves, onSelect };

  useEffect(() => {
    if (!box.current) return;
    let failed = false;
    const fail = (why: string) => {
      if (failed || ready.current) return;
      failed = true;
      onFail(why);
    };
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: box.current,
        style: tileUrl(styleUrl()),
        bounds: [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        fitBoundsOptions: { padding: 40 },
        attributionControl: { compact: true },
        transformRequest: (url) => ({ url: tileUrl(url) }),
      });
    } catch (e) {
      fail(String((e as Error)?.message || e));
      return;
    }
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    const timer = setTimeout(() => fail('The detailed map didn’t load in time.'), 15000);
    m.on('error', (e) => {
      if (!ready.current) fail(String(e?.error?.message || 'The detailed map couldn’t load.'));
    });
    m.on('load', () => {
      clearTimeout(timer);
      ready.current = true;
      const pri = css('--pri');
      const gold = css('--gold');
      const onPri = css('--on-pri');
      const surface = css('--surface');
      m.addSource('moves', { type: 'geojson', data: moveData(latest.current.moves) });
      m.addSource('pins', { type: 'geojson', data: pinData(latest.current.pins) });
      // Labels use their own copy of the data, so pins still draw if label fonts can't load.
      m.addSource('pin-labels', { type: 'geojson', data: pinData(latest.current.pins) });
      m.addLayer({ id: 'moves', type: 'line', source: 'moves', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'recent'], 1], gold, pri], 'line-width': ['case', ['==', ['get', 'recent'], 1], 3.5, 2.5], 'line-opacity': ['case', ['==', ['get', 'recent'], 1], 1, 0.6] } });
      m.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': ['get', 'r'], 'circle-color': ['case', ['==', ['get', 'sel'], 1], gold, pri], 'circle-stroke-color': surface, 'circle-stroke-width': 2 } });
      m.addLayer({
        id: 'pin-n',
        type: 'symbol',
        source: 'pin-labels',
        layout: { 'text-field': ['get', 'n'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
        paint: { 'text-color': onPri },
      });
      m.addLayer({
        id: 'pin-label',
        type: 'symbol',
        source: 'pin-labels',
        layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-anchor': 'left', 'text-offset': [1.3, 0], 'text-optional': true },
        paint: { 'text-color': '#1E231F', 'text-halo-color': '#FFFDF8', 'text-halo-width': 2 },
      });
      m.on('click', 'pins', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect(String(id));
      });
      m.on('mouseenter', 'pins', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'pins', () => (m.getCanvas().style.cursor = ''));
    });
    return () => {
      clearTimeout(timer);
      ready.current = false;
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('pins') as GeoJSONSource | undefined)?.setData(pinData(pins));
    (m.getSource('pin-labels') as GeoJSONSource | undefined)?.setData(pinData(pins));
    (m.getSource('moves') as GeoJSONSource | undefined)?.setData(moveData(moves));
  }, [pins, moves]);

  useEffect(() => {
    map.current?.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 40, duration: 600 },
    );
  }, [bounds.join(',')]);

  return <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Detailed map of family places" />;
}
