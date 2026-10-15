// Fitting a photo into a profile circle (or any box): centre on a point, zoom, never show empty edges.

import type { Media, Person, PhotoCrop } from './types';

/** The framing to use for someone's profile photo: what they chose, else centred on their face tag. */
export function defaultCrop(p: Person, m: Media | undefined): PhotoCrop {
  if (p.photoCrop) return p.photoCrop;
  const face = m?.faces.find((f) => f.personId === p.id);
  if (!face) return { x: 50, y: 50, z: 1 };
  // A face tag marks the middle of a face. Zoom in more on group photos, a little on portraits.
  const z = m!.faces.length >= 3 ? 2.6 : m!.faces.length === 2 ? 2 : 1.4;
  return { x: face.x, y: face.y, z };
}

/**
 * Where to draw the image inside a box, as fractions of the box.
 * aspect = image width / box-relative height (image w/h divided by box w/h).
 */
export function frameRect(aspect: number, crop: PhotoCrop): { w: number; h: number; left: number; top: number } {
  const a = aspect > 0 && isFinite(aspect) ? aspect : 1;
  const z = Math.max(1, crop.z);
  // "cover": the image fills the box on its shorter side
  const w = (a >= 1 ? a : 1) * z;
  const h = (a >= 1 ? 1 : 1 / a) * z;
  const clamp = (v: number, min: number) => Math.min(0, Math.max(min, v));
  const left = clamp(0.5 - (crop.x / 100) * w, 1 - w);
  const top = clamp(0.5 - (crop.y / 100) * h, 1 - h);
  return { w, h, left, top };
}

/** Moving the photo by (dx, dy) box-fractions changes the centre point by this much (percent). */
export function panCrop(aspect: number, crop: PhotoCrop, dx: number, dy: number): PhotoCrop {
  const r = frameRect(aspect, crop);
  return normaliseCrop(aspect, { ...crop, x: crop.x - (dx / r.w) * 100, y: crop.y - (dy / r.h) * 100 });
}

/** Keeps the centre point inside the range that can actually be shown at this zoom (no dead zone when dragging). */
export function normaliseCrop(aspect: number, crop: PhotoCrop): PhotoCrop {
  const z = Math.min(5, Math.max(1, crop.z));
  const r = frameRect(aspect, { x: 50, y: 50, z });
  const lim = (v: number, size: number) => {
    const lo = (0.5 / size) * 100;
    return +Math.min(100 - lo, Math.max(lo, v)).toFixed(2);
  };
  return { x: lim(crop.x, r.w), y: lim(crop.y, r.h), z: +z.toFixed(2) };
}
