// Reading a whole tree into memory, and turning changes into SQL.
// Every change is written straight away (autosave) inside one transaction.

import type { Db, SqlValue, Stmt } from './db';
import type { Citation, Fact, Hint, Media, Person, PhotoCrop, Place, Recipe, Relationship, Source, Story, TagStatus, Task, TreeData } from '../lib/types';

const s = (v: SqlValue | undefined) => (v === null || v === undefined ? '' : String(v));
const n = (v: SqlValue | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));
const b = (v: boolean) => (v ? 1 : 0);

function parseCrop(v: string): PhotoCrop | null {
  if (!v) return null;
  try {
    const c = JSON.parse(v);
    return typeof c?.x === 'number' && typeof c?.y === 'number' && typeof c?.z === 'number' ? c : null;
  } catch {
    return null;
  }
}

export async function loadTree(db: Db): Promise<TreeData> {
  const [people, rels, places, facts, sources, cites, fc, media, faces, mp, ms, hints, tasks, settings, mtags, stories, sp, sm, recipes, rp, rm] = await Promise.all([
    db.query('SELECT * FROM person'),
    db.query('SELECT * FROM relationship'),
    db.query('SELECT * FROM place'),
    db.query('SELECT * FROM fact'),
    db.query('SELECT * FROM source'),
    db.query('SELECT * FROM citation'),
    db.query('SELECT * FROM fact_citation ORDER BY pos'),
    db.query('SELECT * FROM media ORDER BY created_at DESC'),
    db.query('SELECT * FROM media_face'),
    db.query('SELECT * FROM media_person'),
    db.query('SELECT * FROM media_source'),
    db.query('SELECT * FROM hint'),
    db.query('SELECT * FROM task ORDER BY created_at DESC'),
    db.query('SELECT * FROM settings'),
    db.query('SELECT * FROM media_tag'),
    db.query('SELECT * FROM story ORDER BY created_at'),
    db.query('SELECT * FROM story_person'),
    db.query('SELECT * FROM story_media ORDER BY pos'),
    db.query('SELECT * FROM recipe ORDER BY title'),
    db.query('SELECT * FROM recipe_person ORDER BY pos'),
    db.query('SELECT * FROM recipe_media ORDER BY pos'),
  ]);
  const citesByFact: Record<string, string[]> = {};
  for (const r of fc) (citesByFact[s(r.fact_id)] = citesByFact[s(r.fact_id)] || []).push(s(r.citation_id));
  const group = (rows: Record<string, SqlValue>[], key: string) => {
    const m: Record<string, Record<string, SqlValue>[]> = {};
    for (const r of rows) (m[s(r[key])] = m[s(r[key])] || []).push(r);
    return m;
  };
  const facesBy = group(faces, 'media_id');
  const mpBy = group(mp, 'media_id');
  const msBy = group(ms, 'media_id');
  const tagBy = group(mtags, 'media_id');
  const spBy = group(sp, 'story_id');
  const smBy = group(sm, 'story_id');
  const rpBy = group(rp, 'recipe_id');
  const rmBy = group(rm, 'recipe_id');
  const st: Record<string, string> = {};
  for (const r of settings) st[s(r.key)] = s(r.value);

  return {
    people: people.map(
      (r): Person => ({
        id: s(r.id),
        given: s(r.given_names),
        surname: s(r.surname),
        sex: (s(r.sex) || 'U') as Person['sex'],
        living: !!Number(r.living),
        photoMediaId: r.photo_media_id ? s(r.photo_media_id) : null,
        photoCrop: parseCrop(s(r.photo_crop)),
        coverMediaId: r.cover_media_id ? s(r.cover_media_id) : null,
        profileId: s(r.profile_id) || s(r.id),
        accountEmail: s(r.account_email),
        avatar: s(r.avatar),
        privacy: (s(r.privacy) || 'Private') as Person['privacy'],
        notes: s(r.notes),
        updatedAt: s(r.updated_at),
      }),
    ),
    rels: rels.map(
      (r): Relationship => ({ id: s(r.id), type: s(r.type) as Relationship['type'], a: s(r.person_a), b: s(r.person_b), start: s(r.start_date), end: s(r.end_date) }),
    ),
    places: places.map((r): Place => ({ id: s(r.id), name: s(r.name), hist: s(r.historical_name), lat: n(r.lat), lon: n(r.lon) })),
    facts: facts.map(
      (r): Fact => ({
        id: s(r.id),
        personId: s(r.person_id),
        type: s(r.type),
        date: s(r.date_text),
        q: (s(r.date_qualifier) || 'exact') as Fact['q'],
        date2: s(r.date2_text),
        sortYear: n(r.sort_year),
        placeId: s(r.place_id),
        homePlaceId: s(r.home_place_id),
        desc: s(r.description),
        conf: (r.confidence_override ? s(r.confidence_override) : 'auto') as Fact['conf'],
        citeIds: citesByFact[s(r.id)] || [],
      }),
    ),
    sources: sources.map((r): Source => ({ id: s(r.id), title: s(r.title), type: s(r.type), repo: s(r.repository), url: s(r.url) })),
    cites: cites.map(
      (r): Citation => ({ id: s(r.id), sourceId: s(r.source_id), page: s(r.page), accessed: s(r.date_accessed), quality: s(r.quality) as Citation['quality'], extract: s(r.extract) }),
    ),
    media: media.map(
      (r): Media => ({
        id: s(r.id),
        kind: s(r.kind) as Media['kind'],
        file: s(r.file_path),
        thumb: s(r.thumb_path),
        scene: s(r.scene),
        title: s(r.title),
        date: s(r.date_text),
        placeId: s(r.place_id),
        desc: s(r.description),
        duration: Number(r.duration_s || 0),
        mime: s(r.mime),
        originalName: s(r.original_name),
        sizeBytes: Number(r.size_bytes || 0),
        createdAt: s(r.created_at),
        faces: (facesBy[s(r.id)] || []).map((f) => ({ personId: s(f.person_id), x: Number(f.x_pct), y: Number(f.y_pct) })),
        people: (mpBy[s(r.id)] || []).map((f) => s(f.person_id)),
        sourceIds: (msBy[s(r.id)] || []).map((f) => s(f.source_id)),
        addedBy: s(r.added_by),
        tags: Object.fromEntries((tagBy[s(r.id)] || []).map((t) => [s(t.person_id), { status: (s(t.status) || 'shown') as TagStatus, by: s(t.tagged_by) }])),
      }),
    ),
    hints: hints.map((r): Hint => {
      let record: Hint['record'];
      try {
        record = JSON.parse(s(r.record_json) || '{}');
      } catch {
        record = { rec: [], props: [], page: '', qual: 'Secondary', extract: '' };
      }
      try {
        const props = JSON.parse(s(r.proposals_json) || '[]');
        if (Array.isArray(props) && props.length) record.props = props;
      } catch {
        /* keep record.props */
      }
      record.rec = record.rec || [];
      record.props = record.props || [];
      return { id: s(r.id), provider: s(r.provider), collection: s(r.collection), personId: s(r.person_id), score: Number(r.score || 0), status: s(r.status) as Hint['status'], record };
    }),
    tasks: tasks.map(
      (r): Task => ({
        id: s(r.id),
        title: s(r.title),
        personId: s(r.person_id),
        factId: s(r.fact_id),
        status: s(r.status) as Task['status'],
        priority: s(r.priority) as Task['priority'],
        notes: s(r.notes),
        createdAt: s(r.created_at),
      }),
    ),
    stories: stories.map(
      (r): Story => ({
        id: s(r.id),
        title: s(r.title),
        body: s(r.body),
        date: s(r.date_text),
        q: (s(r.date_qualifier) || 'exact') as Story['q'],
        date2: s(r.date2_text),
        ageAt: n(r.age_at),
        sortYear: n(r.sort_year),
        placeId: s(r.place_id),
        factId: s(r.fact_id),
        author: s(r.author),
        authorEmail: s(r.author_email),
        people: Object.fromEntries((spBy[s(r.id)] || []).map((x) => [s(x.person_id), (s(x.status) || 'shown') as TagStatus])),
        mediaIds: (smBy[s(r.id)] || []).map((x) => s(x.media_id)),
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
      }),
    ),
    recipes: recipes.map(
      (r): Recipe => ({
        id: s(r.id),
        title: s(r.title),
        category: s(r.category),
        servings: s(r.servings),
        time: s(r.time_text),
        ingredients: s(r.ingredients),
        method: s(r.method),
        story: s(r.story),
        date: s(r.date_text),
        placeId: s(r.place_id),
        people: (rpBy[s(r.id)] || []).map((x) => s(x.person_id)),
        mediaIds: (rmBy[s(r.id)] || []).map((x) => s(x.media_id)),
        addedBy: s(r.added_by),
        sharedBy: s(r.shared_by),
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
      }),
    ),
    settings: st,
  };
}

/** Collects the SQL for a set of changes so they can be written in one transaction. */
export class SqlLog {
  stmts: Stmt[] = [];
  private stamp = new Date().toISOString();
  /** track = false skips the change log (used for whole-tree writes such as imports). */
  constructor(private track = true) {}

  private add(sql: string, params: SqlValue[] = []) {
    this.stmts.push({ sql, params });
  }
  private log(table: string, id: string, op: string) {
    if (!this.track) return;
    this.add('INSERT INTO sync_log (table_name, row_id, op, changed_at) VALUES (?, ?, ?, ?)', [table, id, op, this.stamp]);
  }

  person(p: Person) {
    this.add(
      `INSERT INTO person (id, given_names, surname, sex, living, photo_media_id, avatar, privacy, notes, updated_at, photo_crop, cover_media_id, profile_id, account_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET given_names=excluded.given_names, surname=excluded.surname, sex=excluded.sex,
         living=excluded.living, photo_media_id=excluded.photo_media_id, avatar=excluded.avatar, privacy=excluded.privacy,
         notes=excluded.notes, updated_at=excluded.updated_at, photo_crop=excluded.photo_crop, cover_media_id=excluded.cover_media_id,
         profile_id=excluded.profile_id, account_email=excluded.account_email`,
      [
        p.id, p.given, p.surname, p.sex, b(p.living), p.photoMediaId, p.avatar, p.privacy, p.notes, p.updatedAt || this.stamp,
        p.photoCrop ? JSON.stringify(p.photoCrop) : '', p.coverMediaId ?? null, p.profileId || p.id, p.accountEmail || '',
      ],
    );
    this.log('person', p.id, 'put');
  }
  rel(r: Relationship) {
    this.add('INSERT OR REPLACE INTO relationship (id, type, person_a, person_b, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)', [r.id, r.type, r.a, r.b, r.start, r.end]);
    this.log('relationship', r.id, 'put');
  }
  place(p: Place) {
    this.add('INSERT OR REPLACE INTO place (id, name, historical_name, lat, lon) VALUES (?, ?, ?, ?, ?)', [p.id, p.name, p.hist, p.lat, p.lon]);
    this.log('place', p.id, 'put');
  }
  source(x: Source) {
    this.add(
      `INSERT INTO source (id, title, type, repository, url) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, type=excluded.type, repository=excluded.repository, url=excluded.url`,
      [x.id, x.title, x.type, x.repo, x.url],
    );
    this.log('source', x.id, 'put');
  }
  cite(c: Citation) {
    this.add(
      `INSERT INTO citation (id, source_id, page, date_accessed, quality, extract) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, page=excluded.page, date_accessed=excluded.date_accessed,
         quality=excluded.quality, extract=excluded.extract`,
      [c.id, c.sourceId, c.page, c.accessed, c.quality, c.extract],
    );
    this.log('citation', c.id, 'put');
  }
  fact(f: Fact) {
    this.add(
      `INSERT INTO fact (id, person_id, type, date_text, date_qualifier, date2_text, sort_year, place_id, description, confidence_override, home_place_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET person_id=excluded.person_id, type=excluded.type, date_text=excluded.date_text,
         date_qualifier=excluded.date_qualifier, date2_text=excluded.date2_text, sort_year=excluded.sort_year,
         place_id=excluded.place_id, description=excluded.description, confidence_override=excluded.confidence_override,
         home_place_id=excluded.home_place_id`,
      [f.id, f.personId, f.type, f.date, f.q, f.date2, f.sortYear, f.placeId || null, f.desc, f.conf === 'auto' ? null : f.conf, f.homePlaceId || null],
    );
    this.add('DELETE FROM fact_citation WHERE fact_id = ?', [f.id]);
    f.citeIds.forEach((c, i) => this.add('INSERT OR IGNORE INTO fact_citation (fact_id, citation_id, pos) VALUES (?, ?, ?)', [f.id, c, i]));
    this.log('fact', f.id, 'put');
  }
  media(m: Media) {
    this.add(
      `INSERT INTO media (id, kind, file_path, thumb_path, scene, title, date_text, place_id, description, duration_s, mime, original_name, size_bytes, created_at, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, file_path=excluded.file_path, thumb_path=excluded.thumb_path,
         scene=excluded.scene, title=excluded.title, date_text=excluded.date_text, place_id=excluded.place_id,
         description=excluded.description, duration_s=excluded.duration_s, mime=excluded.mime,
         original_name=excluded.original_name, size_bytes=excluded.size_bytes, added_by=excluded.added_by`,
      [m.id, m.kind, m.file, m.thumb, m.scene, m.title, m.date, m.placeId || null, m.desc, m.duration, m.mime, m.originalName, m.sizeBytes, m.createdAt || this.stamp, m.addedBy || ''],
    );
    this.add('DELETE FROM media_face WHERE media_id = ?', [m.id]);
    this.add('DELETE FROM media_person WHERE media_id = ?', [m.id]);
    this.add('DELETE FROM media_source WHERE media_id = ?', [m.id]);
    this.add('DELETE FROM media_tag WHERE media_id = ?', [m.id]);
    m.faces.forEach((f) => this.add('INSERT INTO media_face (media_id, person_id, x_pct, y_pct) VALUES (?, ?, ?, ?)', [m.id, f.personId, f.x, f.y]));
    m.people.forEach((p) => this.add('INSERT OR IGNORE INTO media_person (media_id, person_id) VALUES (?, ?)', [m.id, p]));
    m.sourceIds.forEach((x) => this.add('INSERT OR IGNORE INTO media_source (media_id, source_id) VALUES (?, ?)', [m.id, x]));
    Object.entries(m.tags || {}).forEach(([pid, t]) => {
      if (m.faces.some((f) => f.personId === pid) || m.people.includes(pid))
        this.add('INSERT OR REPLACE INTO media_tag (media_id, person_id, status, tagged_by) VALUES (?, ?, ?, ?)', [m.id, pid, t.status, t.by]);
    });
    this.log('media', m.id, 'put');
  }
  hint(h: Hint) {
    const { props, ...rest } = h.record;
    this.add(
      'INSERT OR REPLACE INTO hint (id, provider, collection, person_id, score, status, record_json, proposals_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [h.id, h.provider, h.collection, h.personId, h.score, h.status, JSON.stringify(rest), JSON.stringify(props)],
    );
    this.log('hint', h.id, 'put');
  }
  task(t: Task) {
    this.add(
      'INSERT OR REPLACE INTO task (id, title, person_id, fact_id, status, priority, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [t.id, t.title, t.personId || null, t.factId || null, t.status, t.priority, t.notes, t.createdAt || this.stamp],
    );
    this.log('task', t.id, 'put');
  }
  story(x: Story) {
    this.add(
      `INSERT INTO story (id, title, body, date_text, sort_year, place_id, fact_id, author, author_email, created_at, updated_at, date_qualifier, date2_text, age_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, body=excluded.body, date_text=excluded.date_text, sort_year=excluded.sort_year,
         place_id=excluded.place_id, fact_id=excluded.fact_id, author=excluded.author, author_email=excluded.author_email, updated_at=excluded.updated_at,
         date_qualifier=excluded.date_qualifier, date2_text=excluded.date2_text, age_at=excluded.age_at`,
      [
        x.id, x.title, x.body, x.date, x.sortYear, x.placeId || null, x.factId || null, x.author, x.authorEmail, x.createdAt || this.stamp, x.updatedAt || this.stamp,
        x.q || 'exact', x.date2 || '', x.ageAt ?? null,
      ],
    );
    this.add('DELETE FROM story_person WHERE story_id = ?', [x.id]);
    this.add('DELETE FROM story_media WHERE story_id = ?', [x.id]);
    Object.entries(x.people).forEach(([pid, st]) => this.add('INSERT OR IGNORE INTO story_person (story_id, person_id, status) VALUES (?, ?, ?)', [x.id, pid, st]));
    x.mediaIds.forEach((m, i) => this.add('INSERT OR IGNORE INTO story_media (story_id, media_id, pos) VALUES (?, ?, ?)', [x.id, m, i]));
    this.log('story', x.id, 'put');
  }
  recipe(x: Recipe) {
    this.add(
      `INSERT INTO recipe (id, title, category, servings, time_text, ingredients, method, story, date_text, place_id, added_by, shared_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, servings=excluded.servings, time_text=excluded.time_text,
         ingredients=excluded.ingredients, method=excluded.method, story=excluded.story, date_text=excluded.date_text, place_id=excluded.place_id,
         added_by=excluded.added_by, shared_by=excluded.shared_by, updated_at=excluded.updated_at`,
      [x.id, x.title, x.category, x.servings, x.time, x.ingredients, x.method, x.story, x.date, x.placeId || null, x.addedBy, x.sharedBy, x.createdAt || this.stamp, x.updatedAt || this.stamp],
    );
    this.add('DELETE FROM recipe_person WHERE recipe_id = ?', [x.id]);
    this.add('DELETE FROM recipe_media WHERE recipe_id = ?', [x.id]);
    x.people.forEach((p, i) => this.add('INSERT OR IGNORE INTO recipe_person (recipe_id, person_id, pos) VALUES (?, ?, ?)', [x.id, p, i]));
    x.mediaIds.forEach((m, i) => this.add('INSERT OR IGNORE INTO recipe_media (recipe_id, media_id, pos) VALUES (?, ?, ?)', [x.id, m, i]));
    this.log('recipe', x.id, 'put');
  }
  setting(key: string, value: string) {
    this.add('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
  del(table: 'person' | 'relationship' | 'place' | 'fact' | 'source' | 'citation' | 'media' | 'hint' | 'task' | 'story' | 'recipe', id: string) {
    this.add(`DELETE FROM ${table} WHERE id = ?`, [id]);
    this.log(table, id, 'delete');
  }

  /** Every row of a whole tree (used for the sample tree and GEDCOM imports). */
  all(d: TreeData) {
    d.places.forEach((x) => this.place(x));
    d.sources.forEach((x) => this.source(x));
    d.people.forEach((x) => this.person(x));
    d.rels.forEach((x) => this.rel(x));
    d.cites.forEach((x) => this.cite(x));
    d.facts.forEach((x) => this.fact(x));
    d.media.forEach((x) => this.media(x));
    d.hints.forEach((x) => this.hint(x));
    d.tasks.forEach((x) => this.task(x));
    (d.stories || []).forEach((x) => this.story(x));
    (d.recipes || []).forEach((x) => this.recipe(x));
    Object.entries(d.settings).forEach(([k, v]) => this.setting(k, v));
  }
}
