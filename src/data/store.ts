// App state: the open tree (data), the trees list and preferences, and the UI state.
// Changes go through `commit`, which writes SQL first and only then updates the screen.

import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { Db } from './db';
import { migrate } from './db';
import { loadTree, SqlLog } from './repo';
import * as platform from './platform';
import { emptyTree, type TreeData } from '../lib/types';

export type ThemeId = 'heritage' | 'ink' | 'euc' | 'ochre' | 'reef' | 'jac' | 'rose' | 'slate' | 'harbour' | 'sepia';

export interface TreeEntry {
  id: string;
  name: string;
  people: number;
  lastOpened: string;
  sample?: boolean;
}

export interface Prefs {
  theme: ThemeId;
  dark: boolean;
  compact: boolean;
  ownerName: string;
  trees: TreeEntry[];
  lastTree: string;
  recent: Record<string, string[]>; // per tree: recently opened people
}

export const defaultPrefs = (): Prefs => ({
  theme: 'heritage',
  dark: false,
  compact: false,
  ownerName: '',
  trees: [],
  lastTree: '',
  recent: {},
});

interface DataState {
  treeId: string;
  db: Db | null;
  data: TreeData;
  prefs: Prefs;
  prefsLoaded: boolean;
  busy: string;
}

export const useData = create<DataState>(() => ({
  treeId: '',
  db: null,
  data: emptyTree(),
  prefs: defaultPrefs(),
  prefsLoaded: false,
  busy: '',
}));

export const getData = () => useData.getState().data;

// ---------- preferences ----------
let prefsTimer: ReturnType<typeof setTimeout> | undefined;
export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  const cur = useData.getState().prefs;
  const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) };
  useData.setState({ prefs: next });
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => platform.writePrefs(next as unknown as Record<string, unknown>), 250);
}

export async function loadPrefs() {
  const raw = await platform.readPrefs();
  const p = { ...defaultPrefs(), ...(raw as Partial<Prefs>) };
  if (!Array.isArray(p.trees)) p.trees = [];
  useData.setState({ prefs: p, prefsLoaded: true });
  return p;
}

// ---------- committing changes ----------
export class CommitError extends Error {}

/**
 * Applies a change: `recipe` edits a draft of the tree and records the matching SQL.
 * The SQL is written first; the screen only updates if the write succeeded.
 */
export async function commit(recipe: (d: Draft<TreeData>, sql: SqlLog) => void): Promise<void> {
  const { db, data } = useData.getState();
  const sql = new SqlLog();
  const next = produce(data, (d) => recipe(d, sql));
  if (db && sql.stmts.length) {
    try {
      await db.batch(sql.stmts);
    } catch (e) {
      console.error(e);
      throw new CommitError('Couldn’t save that change: ' + String((e as Error)?.message || e));
    }
  }
  useData.setState({ data: next });
  touchTreeEntry();
}

function touchTreeEntry() {
  const { treeId, data, prefs } = useData.getState();
  const e = prefs.trees.find((t) => t.id === treeId);
  if (!e) return;
  const name = data.settings.tree_name || e.name;
  if (e.people !== data.people.length || e.name !== name) {
    setPrefs({ trees: prefs.trees.map((t) => (t.id === treeId ? { ...t, people: data.people.length, name } : t)) });
  }
}

// ---------- opening trees ----------
export async function openTree(id: string): Promise<TreeData> {
  useData.setState({ busy: 'Opening your tree…' });
  try {
    const opened = await platform.openTreeDb(id);
    await migrate(opened.db);
    const data = await loadTree(opened.db);
    useData.setState({ treeId: id, db: opened.db, data });
    const { prefs } = useData.getState();
    const now = new Date().toISOString();
    const name = data.settings.tree_name || 'Family tree';
    const exists = prefs.trees.some((t) => t.id === id);
    setPrefs({
      lastTree: id,
      trees: exists
        ? prefs.trees.map((t) => (t.id === id ? { ...t, name, people: data.people.length, lastOpened: now } : t))
        : [...prefs.trees, { id, name, people: data.people.length, lastOpened: now, sample: data.settings.is_sample === '1' }],
    });
    platform.setWindowTitle(`${name} — Family Tree`);
    return data;
  } finally {
    useData.setState({ busy: '' });
  }
}

/** Creates a new tree file and fills it with `initial` (empty, the sample, or an import). */
export async function createTree(initial: TreeData): Promise<string> {
  const id = platform.newId();
  useData.setState({ busy: 'Creating your tree…' });
  try {
    const opened = await platform.openTreeDb(id);
    await migrate(opened.db);
    const sql = new SqlLog(false);
    sql.all(initial);
    // Large trees are written in chunks so the window stays responsive.
    const CHUNK = 4000;
    for (let i = 0; i < sql.stmts.length; i += CHUNK) await opened.db.batch(sql.stmts.slice(i, i + CHUNK));
  } finally {
    useData.setState({ busy: '' });
  }
  await openTree(id);
  return id;
}

export async function reloadTree() {
  const { treeId } = useData.getState();
  if (treeId) await openTree(treeId);
}

export async function closeTree() {
  await platform.closeTreeDb();
  useData.setState({ treeId: '', db: null, data: emptyTree() });
  platform.setWindowTitle('Family Tree');
}

export async function removeTree(id: string) {
  const { treeId, prefs } = useData.getState();
  if (treeId === id) await closeTree();
  await platform.deleteTree(id);
  setPrefs({ trees: prefs.trees.filter((t) => t.id !== id), lastTree: prefs.lastTree === id ? '' : prefs.lastTree });
}
