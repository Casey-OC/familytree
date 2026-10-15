// Who counts as close family, and who can see a profile.

import type { TreeApi } from './family';
import type { Person } from './types';

export type CloseRelation = 'parent' | 'child' | 'sibling' | 'partner' | 'grandparent' | 'grandchild';

/** Close family see each other's profiles without an invite: parents, children, siblings, partners, grandparents, grandchildren. */
export function closeFamily(T: TreeApi, pid: string): Map<string, CloseRelation> {
  const out = new Map<string, CloseRelation>();
  const put = (ids: string[], r: CloseRelation) => ids.forEach((id) => id !== pid && !out.has(id) && out.set(id, r));
  put(T.parents(pid), 'parent');
  put(T.children(pid), 'child');
  put(T.spouses(pid), 'partner');
  put(T.siblings(pid), 'sibling');
  put(
    T.parents(pid).flatMap((x) => T.parents(x)),
    'grandparent',
  );
  put(
    T.children(pid).flatMap((x) => T.children(x)),
    'grandchild',
  );
  return out;
}

export function isCloseFamily(T: TreeApi, a: string, b: string) {
  return closeFamily(T, a).has(b);
}

/** A plain-English line about who can see this person's profile. */
export function visibilityLine(T: TreeApi, p: Person, selfId: string): { label: string; detail: string } {
  if (!p.living) return { label: 'Shared with family', detail: 'Ancestors who have died can be seen by everyone in the family who has this tree.' };
  if (p.id === selfId)
    return {
      label: 'Close family',
      detail: 'Your parents, children, brothers and sisters, partner, grandparents and grandchildren can see your profile. Other relatives need an invite from you.',
    };
  if (p.accountEmail)
    return { label: 'Their choice', detail: `${T.first(p.id)} has their own account and decides who sees their profile. Close family can see it; others need an invite.` };
  return {
    label: 'Private',
    detail: `${T.first(p.id)} is living, so their profile stays private to you. When they join and accept an invite, their close family will see it too.`,
  };
}
