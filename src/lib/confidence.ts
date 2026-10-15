import type { Citation, Confidence, Fact, Qualifier } from './types';

/**
 * The confidence rule from the handover (matches the prototype's confOf):
 *  - a manual override wins
 *  - no citations → Unverified
 *  - an exact date and at least one Primary citation → Proven
 *  - otherwise → Probable
 */
export function confOf(
  q: Qualifier | undefined,
  cites: Pick<Citation, 'quality'>[],
  override?: Fact['conf'] | null,
): Confidence {
  if (override && override !== 'auto') return override;
  if (!cites.length) return 'Unverified';
  const primary = cites.some((c) => c.quality === 'Primary');
  return (!q || q === 'exact') && primary ? 'Proven' : 'Probable';
}

/** Text label that never relies on colour alone. */
export function confLabel(c: Confidence): string {
  return c === 'Proven' ? '✓ Proven' : c === 'Probable' ? '~ Probable' : '? Unverified';
}
