// Life stories: stories written about someone, placed in their timeline.

import type { TreeApi } from './family';
import { yearOf } from './dates';
import type { Fact, Story, TagStatus, TreeData } from './types';

/** The year a story sits at in a timeline: its own date, else the event it's about. */
export function storyYear(d: TreeData, s: Story): number | null {
  if (s.sortYear) return s.sortYear;
  const y = yearOf(s.date);
  if (y) return y;
  const f = s.factId ? d.facts.find((x) => x.id === s.factId) : undefined;
  return f ? yearOf(f.date) : null;
}

/** Stories about someone with a given status (default: the ones showing on their profile). */
export function storiesAbout(d: TreeData, pid: string, status: TagStatus = 'shown'): Story[] {
  return (d.stories || []).filter((s) => s.people[pid] === status);
}

export type TimelineItem = { kind: 'fact'; fact: Fact; year: number | null } | { kind: 'story'; story: Story; year: number | null };

/**
 * Someone's events and stories in date order. A story about an event comes straight after that
 * event; other stories slot in by year; undated stories go at the end.
 */
export function timeline(T: TreeApi, d: TreeData, pid: string): TimelineItem[] {
  const facts = T.factsOf(pid);
  const stories = storiesAbout(d, pid);
  const byFact = new Map<string, Story[]>();
  const loose: Story[] = [];
  for (const s of stories) {
    if (s.factId && facts.some((f) => f.id === s.factId)) byFact.set(s.factId, [...(byFact.get(s.factId) || []), s]);
    else loose.push(s);
  }
  const items: TimelineItem[] = [];
  for (const f of facts) {
    items.push({ kind: 'fact', fact: f, year: yearOf(f.date) });
    for (const s of byFact.get(f.id) || []) items.push({ kind: 'story', story: s, year: yearOf(f.date) });
  }
  // Slot loose stories in by year (after events of the same year), keeping the fact order intact.
  for (const s of loose.sort((a, b) => (storyYear(d, a) ?? 99999) - (storyYear(d, b) ?? 99999))) {
    const y = storyYear(d, s);
    if (y === null) {
      items.push({ kind: 'story', story: s, year: null });
      continue;
    }
    let at = items.length;
    for (let i = 0; i < items.length; i++) {
      const iy = items[i].year;
      if (iy !== null && iy > y) {
        at = i;
        break;
      }
      if (iy === null && items[i].kind === 'story') {
        at = i;
        break;
      }
    }
    items.splice(at, 0, { kind: 'story', story: s, year: y });
  }
  return items;
}

/** A short preview of a story's text. */
export function storyPreview(body: string, max = 260): { text: string; more: boolean } {
  const t = body.trim();
  if (t.length <= max) return { text: t, more: false };
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return { text: (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…', more: true };
}
