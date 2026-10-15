import type { ThemeId } from '../data/store';

export const THEMES: { id: ThemeId; name: string; desc: string }[] = [
  { id: 'heritage', name: 'Heritage Green', desc: 'Deep green, soft gold' },
  { id: 'ink', name: 'Ink & Parchment', desc: 'Ink blue on old paper' },
  { id: 'euc', name: 'Eucalyptus', desc: 'Sage leaves and wattle' },
  { id: 'ochre', name: 'Outback Ochre', desc: 'Red earth and dot painting' },
  { id: 'reef', name: 'Coral Coast', desc: 'Reef teal and coral' },
  { id: 'jac', name: 'Jacaranda', desc: 'Purple bloom, gold' },
  { id: 'rose', name: 'Rosewood', desc: 'Vintage rose and brass' },
  { id: 'slate', name: 'Slate & Brass', desc: 'Quiet charcoal, brass rules' },
  { id: 'harbour', name: 'Harbour Blue', desc: 'Navy and sunlit amber' },
  { id: 'sepia', name: 'Sepia Album', desc: 'Warm browns of old photos' },
];
