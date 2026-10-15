// Screen state (what's open, filters, forms). Not saved to the tree file.

import { create } from 'zustand';
import type { Qualifier, Quality } from '../lib/types';

export type Section = 'home' | 'tree' | 'people' | 'wall' | 'sources' | 'media' | 'map' | 'charts' | 'research' | 'settings';
export type Screen = 'loading' | 'locked' | 'first' | 'empty' | 'import' | 'app';
export type Panel = { kind: 'person' | 'source' | 'media' | 'place'; id: string } | null;
export type PersonTab = 'facts' | 'relationships' | 'media' | 'notes' | 'sources' | 'research';

export interface FactForm {
  fid: string | null;
  pid: string;
  type: string;
  q: Qualifier;
  date: string;
  date2: string;
  place: string; // place name as typed
  desc: string;
  conf: 'auto' | 'Proven' | 'Probable' | 'Unverified';
  cites: string[];
  newCites: { sourceId: string; page: string; quality: Quality }[];
  newSrc: string;
  newPage: string;
  newQual: Quality;
}

export type Modal =
  | { kind: 'theme' }
  | { kind: 'add'; relTo: string; rel: 'none' | 'child' | 'parent' | 'spouse' | 'sibling'; given: string; surname: string; sex: 'M' | 'F' | 'X' | 'U'; bq: Qualifier; bdate: string; bplace: string; living: boolean; other: string }
  | { kind: 'editPerson'; pid: string; given: string; surname: string; sex: 'M' | 'F' | 'X' | 'U'; living: boolean; root: boolean }
  | { kind: 'upload'; forPid?: string; forSource?: string }
  | { kind: 'source'; id?: string; title: string; type: string; repo: string; url: string }
  | { kind: 'task'; title: string; pid: string; priority: 'High' | 'Medium' | 'Low'; notes: string; factId?: string }
  | { kind: 'confirm'; title: string; body: string; action: string; danger?: boolean; onConfirm: () => void | Promise<void> }
  | { kind: 'renameTree'; name: string }
  | { kind: 'shortcuts' }
  | { kind: 'comingSoon'; title: string; body: string }
  | { kind: 'setPassword' }
  | { kind: 'changePassword' }
  | { kind: 'removePassword' }
  | { kind: 'encrypt'; on: boolean }
  | { kind: 'geocodeAll' };

export interface UiState {
  screen: Screen;
  section: Section;
  panel: Panel;
  pinned: boolean;
  ptab: PersonTab;
  form: FactForm | null;
  modal: Modal | null;
  toast: string | null;
  q: string;
  searchOpen: boolean;
  menu: 'tree' | 'bell' | 'profile' | 'more' | null;
  treeView: 'family' | 'pedigree' | 'descendants';
  focus: string;
  tz: { x: number; y: number; k: number };
  smooth: boolean;
  collapsed: Record<string, boolean>;
  ctx: { pid: string; x: number; y: number } | null;
  pq: string;
  pfilter: 'all' | 'living' | 'deceased' | 'unv';
  psort: 'name' | 'birth';
  srcType: string;
  cf: { page: string; accessed: string; quality: Quality; extract: string; fact: string } | null;
  mf: { type: string; person: string; place: string; decade: string };
  tagMode: boolean;
  pendingFace: { x: number; y: number } | null;
  rtab: 'tasks' | 'unv' | 'hints';
  tfilter: 'open' | 'To do' | 'In progress' | 'Done' | 'all';
  hintSel: string;
  taskOpen: string | null;
  stab: 'gedcom' | 'sync' | 'backup' | 'privacy' | 'appearance';
  online: boolean;
  fitRequest: number; // bump to ask the tree to fit/centre
  centreRequest: { pid: string; n: number } | null;
}

export const initialUi = (): UiState => ({
  screen: 'loading',
  section: 'home',
  panel: null,
  pinned: false,
  ptab: 'facts',
  form: null,
  modal: null,
  toast: null,
  q: '',
  searchOpen: false,
  menu: null,
  treeView: 'family',
  focus: '',
  tz: { x: 0, y: 0, k: 0.55 },
  smooth: true,
  collapsed: {},
  ctx: null,
  pq: '',
  pfilter: 'all',
  psort: 'name',
  srcType: 'all',
  cf: null,
  mf: { type: 'all', person: 'all', place: 'all', decade: 'all' },
  tagMode: false,
  pendingFace: null,
  rtab: 'tasks',
  tfilter: 'open',
  hintSel: '',
  taskOpen: null,
  stab: 'gedcom',
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  fitRequest: 0,
  centreRequest: null,
});

export const useUi = create<UiState>(() => initialUi());
export const ui = () => useUi.getState();
export const setUi = (patch: Partial<UiState> | ((s: UiState) => Partial<UiState>)) =>
  useUi.setState(typeof patch === 'function' ? patch(useUi.getState()) : patch);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  clearTimeout(toastTimer);
  setUi({ toast: text });
  toastTimer = setTimeout(() => setUi({ toast: null }), 3800);
}
