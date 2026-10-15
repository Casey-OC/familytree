// Core data types for one family tree. Mirrors the SQLite schema in data/schema.ts.

export type Sex = 'M' | 'F' | 'X' | 'U';
export type Qualifier = 'exact' | 'about' | 'before' | 'after' | 'between';
export type Confidence = 'Proven' | 'Probable' | 'Unverified';
export type Quality = 'Primary' | 'Secondary' | 'Questionable';
export type MediaKind = 'photo' | 'document' | 'audio';
export type TaskStatus = 'To do' | 'In progress' | 'Done';
export type Priority = 'High' | 'Medium' | 'Low';
export type HintStatus = 'pending' | 'later' | 'accepted' | 'rejected';

export interface Person {
  id: string;
  given: string;
  surname: string; // surname at birth
  sex: Sex;
  living: boolean;
  photoMediaId: string | null; // chosen profile photo (a real media item)
  avatar: string; // sample-tree illustration style ('photo', 'photo t2') or ''
  privacy: 'Private' | 'Shared';
  notes: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  type: 'parent' | 'spouse' | 'sibling';
  a: string; // for 'parent': the parent
  b: string; // for 'parent': the child
  start: string;
  end: string;
}

export interface Fact {
  id: string;
  personId: string;
  type: string;
  date: string; // as written, e.g. "12 Feb 1858", "1890", "Aug 2026"
  q: Qualifier;
  date2: string; // second date for "between"
  sortYear: number | null;
  placeId: string;
  desc: string;
  conf: 'auto' | Confidence; // manual override, or automatic from evidence
  citeIds: string[];
}

export interface Source {
  id: string;
  title: string;
  type: string;
  repo: string;
  url: string;
}

export interface Citation {
  id: string;
  sourceId: string;
  page: string;
  accessed: string;
  quality: Quality;
  extract: string;
}

export interface Face {
  personId: string;
  x: number; // percent of width
  y: number; // percent of height
}

export interface Media {
  id: string;
  kind: MediaKind;
  file: string; // relative to the tree folder, '' for sample illustrations or missing files
  thumb: string; // relative thumbnail path or ''
  scene: string; // sample illustration class when there is no real file
  title: string;
  date: string;
  placeId: string;
  desc: string;
  duration: number; // seconds, audio only
  mime: string;
  originalName: string;
  sizeBytes: number;
  faces: Face[];
  people: string[]; // people linked without a face tag
  sourceIds: string[];
  createdAt: string;
}

export interface Place {
  id: string;
  name: string;
  hist: string; // historical / full name
  lat: number | null;
  lon: number | null;
}

export interface HintProposal {
  type: string;
  q: Qualifier;
  date: string;
  place: string; // place id
  desc: string;
  replace?: boolean;
}

export interface HintRecord {
  rec: [string, string][];
  props: HintProposal[];
  srcId?: string;
  srcNew?: { title: string; type: string; repo: string };
  page: string;
  qual: Quality;
  extract: string;
}

export interface Hint {
  id: string;
  provider: string;
  collection: string;
  personId: string;
  score: number;
  status: HintStatus;
  record: HintRecord;
}

export interface Task {
  id: string;
  title: string;
  personId: string;
  factId: string;
  status: TaskStatus;
  priority: Priority;
  notes: string;
  createdAt: string;
}

export interface TreeData {
  people: Person[];
  rels: Relationship[];
  facts: Fact[];
  sources: Source[];
  cites: Citation[];
  media: Media[];
  places: Place[];
  hints: Hint[];
  tasks: Task[];
  settings: Record<string, string>;
}

export const emptyTree = (): TreeData => ({
  people: [],
  rels: [],
  facts: [],
  sources: [],
  cites: [],
  media: [],
  places: [],
  hints: [],
  tasks: [],
  settings: {},
});

export const FACT_TYPES = [
  'Birth',
  'Baptism',
  'Marriage',
  'Residence',
  'Occupation',
  'Education',
  'Emigration',
  'Arrival',
  'Military',
  'Family event',
  'Death',
  'Burial',
  'Other',
];

export const SOURCE_TYPES = [
  'Certificate',
  'Census',
  'Newspaper',
  'Parish register',
  'Civil register',
  'Family letter',
  'Shipping record',
  'Military record',
  'Electoral roll',
  'Directory',
  'Oral history',
  'Photograph',
  'Personal knowledge',
  'Other',
];
