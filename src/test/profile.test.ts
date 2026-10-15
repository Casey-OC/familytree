import { describe, expect, it } from 'vitest';
import { defaultCrop, frameRect, normaliseCrop, panCrop } from '../lib/photoFrame';
import { closeFamily, visibilityLine } from '../lib/profile';
import { treeApi } from '../lib/family';
import { sampleTree } from '../lib/sample';
import type { Media } from '../lib/types';

describe('profile photo framing', () => {
  it('fills the circle with no empty edges at any zoom', () => {
    for (const aspect of [0.5, 0.75, 1, 1.5, 3]) {
      for (const z of [1, 1.4, 2.6, 5]) {
        for (const [x, y] of [[0, 0], [50, 50], [100, 100], [20, 80]]) {
          const r = frameRect(aspect, { x, y, z });
          expect(r.left).toBeLessThanOrEqual(0);
          expect(r.top).toBeLessThanOrEqual(0);
          expect(r.left + r.w).toBeGreaterThanOrEqual(1 - 1e-9);
          expect(r.top + r.h).toBeGreaterThanOrEqual(1 - 1e-9);
        }
      }
    }
  });
  it('keeps the shape of the photo (no stretching)', () => {
    const r = frameRect(1.5, { x: 50, y: 50, z: 2 });
    expect(r.w / r.h).toBeCloseTo(1.5);
  });
  it('centres on the chosen point when there is room', () => {
    const r = frameRect(1, { x: 30, y: 40, z: 3 });
    expect(r.left + 0.3 * r.w).toBeCloseTo(0.5);
    expect(r.top + 0.4 * r.h).toBeCloseTo(0.5);
  });
  it('uses a gentle zoom on the face tag for portraits and more for group photos', () => {
    const s = sampleTree();
    const p = s.people.find((x) => x.id === 'p12')!;
    const solo = { faces: [{ personId: 'p12', x: 50, y: 30 }] } as Media;
    const group = { faces: [{ personId: 'p12', x: 20, y: 30 }, { personId: 'a', x: 50, y: 30 }, { personId: 'b', x: 80, y: 30 }] } as Media;
    expect(defaultCrop(p, solo)).toEqual({ x: 50, y: 30, z: 1.4 });
    expect(defaultCrop(p, group).z).toBeGreaterThan(2);
    expect(defaultCrop({ ...p, photoCrop: { x: 1, y: 2, z: 3 } }, group)).toEqual({ x: 1, y: 2, z: 3 });
    expect(defaultCrop(p, undefined)).toEqual({ x: 50, y: 50, z: 1 });
  });
  it('dragging past the edge stops at the edge (no dead zone)', () => {
    const c = panCrop(1, { x: 50, y: 50, z: 2 }, 5, 5);
    expect(c).toEqual(normaliseCrop(1, { x: 0, y: 0, z: 2 }));
    expect(c.x).toBe(25);
  });
});

describe('profile visibility', () => {
  it('close family is parents, children, siblings, partners, grandparents and grandchildren', () => {
    const T = treeApi(sampleTree());
    const fam = closeFamily(T, 'p12');
    for (const id of T.parents('p12')) expect(fam.get(id)).toBe('parent');
    for (const id of T.spouses('p12')) expect(fam.get(id)).toBe('partner');
    for (const id of T.children('p12')) expect(fam.get(id)).toBe('child');
    for (const id of T.siblings('p12')) expect(fam.get(id)).toBe('sibling');
    for (const g of T.parents('p12').flatMap((x) => T.parents(x))) expect(fam.get(g)).toBe('grandparent');
    expect(fam.has('p12')).toBe(false);
    // a cousin is not close family
    const aunt = T.siblings(T.parents('p12')[0])[0];
    const cousin = aunt && T.children(aunt)[0];
    if (cousin) expect(fam.has(cousin)).toBe(false);
  });
  it('explains who can see a profile', () => {
    const d = sampleTree();
    const T = treeApi(d);
    const living = d.people.find((p) => p.living)!;
    const dead = d.people.find((p) => !p.living)!;
    expect(visibilityLine(T, living, living.id).label).toBe('Close family');
    expect(visibilityLine(T, living, '').label).toBe('Private');
    expect(visibilityLine(T, { ...living, accountEmail: 'x@y.z' }, '').label).toBe('Their choice');
    expect(visibilityLine(T, dead, '').label).toBe('Shared with family');
  });
});
