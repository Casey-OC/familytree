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
  photoCrop: PhotoCrop | null; // how the profile photo is framed in its circle
  coverMediaId: string | null; // wide photo across the top of the profile page
  profileId: string; // permanent identity: kept when duplicates are merged, used to link the one profile online
  accountEmail: string; // set when this person is an account holder (their own profile)
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
  homePlaceId: string; // Birth / Death: where they lived at the time ('' if not recorded)
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

/** Framing for a profile photo: the point to centre on (percent of the photo) and how far to zoom in. */
export interface PhotoCrop {
  x: number;
  y: number;
  z: number; // 1 = whole photo fills the circle
}

export type TagStatus = 'pending' | 'shown' | 'hidden';
export interface TagInfo {
  status: TagStatus;
  by: string; // who tagged them (name), '' = whoever added the photo
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
  addedBy: string; // name of the account that added it ('' for older items)
  tags: Record<string, TagInfo>; // per tagged person; missing = shown
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
  stories: Story[];
  recipes: Recipe[];
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
  stories: [],
  recipes: [],
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
  'Family Wall post',
  'Other',
];

/** Events that can also record where the person lived at the time. */
export const HOME_EVENTS: Record<string, string> = { Birth: 'Family home at the time of birth', Death: 'Home at the time of death' };

/** A story written about someone, tied into their timeline by its date or by an event. */
export interface Story {
  id: string;
  title: string;
  body: string;
  date: string; // as written, e.g. "Summer 1962" or "1962"
  q: Qualifier; // exact, about, before, after, between
  date2: string; // second date for "between"
  ageAt: number | null; // written as "at 5 years old"; the date is worked out from their birth
  sortYear: number | null;
  placeId: string;
  factId: string; // the event it's about, '' if none
  author: string; // name of the account that wrote it
  authorEmail: string;
  people: Record<string, TagStatus>; // who it's about; others' stories about an account holder wait for approval
  mediaIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** A family recipe: whose it is, the recipe itself, scans or photos of the card, and the story behind it. */
export interface Recipe {
  id: string;
  title: string;
  category: string; // e.g. "Baking", "Christmas"
  servings: string;
  time: string; // e.g. "1 hour"
  ingredients: string; // one per line
  method: string; // one step per line (or paragraph)
  story: string;
  date: string; // when it dates from, e.g. "1950s"
  placeId: string;
  people: string[]; // whose recipe it is (first = main)
  mediaIds: string[]; // photos of the dish or scans of the handwritten card
  addedBy: string;
  sharedBy: string; // "Helen Cho on the Family Wall" when saved from the wall
  createdAt: string;
  updatedAt: string;
}
