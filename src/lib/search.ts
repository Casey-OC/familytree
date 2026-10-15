// Global search, grouped into People / Places / Sources / Media (ported from vmSearch).

import type { TreeApi } from './family';
import { dateLabel } from './dates';

export interface SearchItem {
  kind: 'person' | 'place' | 'source' | 'media';
  id: string;
  title: string;
  sub: string;
  go: () => void;
}

export interface SearchGroup {
  label: 'People' | 'Places' | 'Sources' | 'Media';
  count: number;
  items: SearchItem[];
}

export type Nav = Record<SearchItem['kind'], (id: string) => void>;
const noop: Nav = { person: () => {}, place: () => {}, source: () => {}, media: () => {} };

export function searchTree(T: TreeApi, query: string, nav: Nav = noop): SearchGroup[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const d = T.data;
  const pls = d.places.filter((p) => (p.name + ' ' + p.hist).toLowerCase().includes(q));
  const plIds = new Set(pls.map((p) => p.id));
  const out: SearchGroup[] = [];

  const ppl = d.people.filter((p) => {
    if ((p.given + ' ' + p.surname).toLowerCase().includes(q)) return true;
    return T.factsOf(p.id).some((f) => plIds.has(f.placeId) || (f.desc || '').toLowerCase().includes(q));
  });
  if (ppl.length)
    out.push({
      label: 'People',
      count: ppl.length,
      items: ppl.slice(0, 7).map((p) => {
        const f = T.factsOf(p.id).find((f) => plIds.has(f.placeId));
        return { kind: 'person', id: p.id, title: T.nm(p.id), sub: T.years(p.id) + (f ? ` · ${f.type} in ${T.placeName(f.placeId)}` : ''), go: () => nav.person(p.id) };
      }),
    });

  if (pls.length)
    out.push({
      label: 'Places',
      count: pls.length,
      items: pls.slice(0, 6).map((p) => ({
        kind: 'place',
        id: p.id,
        title: p.name,
        sub: `${d.facts.filter((f) => f.placeId === p.id).length} events${p.hist && p.hist !== p.name ? ' · historically ' + p.hist : ''}`,
        go: () => nav.place(p.id),
      })),
    });

  const srcs = d.sources.filter(
    (s) =>
      (s.title + ' ' + s.repo + ' ' + s.type).toLowerCase().includes(q) ||
      d.cites.some((c) => c.sourceId === s.id && d.facts.some((f) => f.citeIds.includes(c.id) && plIds.has(f.placeId))),
  );
  if (srcs.length)
    out.push({
      label: 'Sources',
      count: srcs.length,
      items: srcs.slice(0, 6).map((s) => ({
        kind: 'source',
        id: s.id,
        title: s.title,
        sub: s.type + ' · ' + ((s.title + s.repo).toLowerCase().includes(q) ? s.repo : 'Cites events in ' + pls.map((p) => p.name.split(',')[0]).join(', ')),
        go: () => nav.source(s.id),
      })),
    });

  const med = d.media.filter((m) => (m.title + ' ' + m.desc + ' ' + T.placeName(m.placeId)).toLowerCase().includes(q));
  if (med.length)
    out.push({
      label: 'Media',
      count: med.length,
      items: med.slice(0, 6).map((m) => ({
        kind: 'media',
        id: m.id,
        title: m.title,
        sub: [m.kind, m.date, T.placeName(m.placeId)].filter(Boolean).join(' · '),
        go: () => nav.media(m.id),
      })),
    });
  return out;
}

export { dateLabel };
