// SQLite schema for one tree file. Each migration runs once, tracked by PRAGMA user_version.

export const MIGRATIONS: string[] = [
  // v1 — Phase 1 foundation
  `
  CREATE TABLE person (
    id TEXT PRIMARY KEY,
    given_names TEXT NOT NULL DEFAULT '',
    surname TEXT NOT NULL DEFAULT '',
    sex TEXT NOT NULL DEFAULT 'U' CHECK (sex IN ('M','F','X','U')),
    living INTEGER NOT NULL DEFAULT 0,
    photo_media_id TEXT,
    avatar TEXT NOT NULL DEFAULT '',
    privacy TEXT NOT NULL DEFAULT 'Private',
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE relationship (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('parent','spouse','sibling')),
    person_a TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    person_b TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX relationship_a ON relationship(person_a);
  CREATE INDEX relationship_b ON relationship(person_b);
  CREATE TABLE place (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    historical_name TEXT NOT NULL DEFAULT '',
    lat REAL,
    lon REAL
  );
  CREATE TABLE fact (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date_text TEXT NOT NULL DEFAULT '',
    date_qualifier TEXT NOT NULL DEFAULT 'exact',
    date2_text TEXT NOT NULL DEFAULT '',
    sort_year INTEGER,
    place_id TEXT,
    description TEXT NOT NULL DEFAULT '',
    confidence_override TEXT
  );
  CREATE INDEX fact_person ON fact(person_id);
  CREATE TABLE source (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Other',
    repository TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE citation (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    page TEXT NOT NULL DEFAULT '',
    date_accessed TEXT NOT NULL DEFAULT '',
    quality TEXT NOT NULL DEFAULT 'Secondary',
    extract TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE fact_citation (
    fact_id TEXT NOT NULL REFERENCES fact(id) ON DELETE CASCADE,
    citation_id TEXT NOT NULL REFERENCES citation(id) ON DELETE CASCADE,
    pos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (fact_id, citation_id)
  );
  CREATE TABLE media (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('photo','document','audio')),
    file_path TEXT NOT NULL DEFAULT '',
    thumb_path TEXT NOT NULL DEFAULT '',
    scene TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    date_text TEXT NOT NULL DEFAULT '',
    place_id TEXT,
    description TEXT NOT NULL DEFAULT '',
    duration_s REAL NOT NULL DEFAULT 0,
    mime TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE media_face (
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    x_pct REAL NOT NULL,
    y_pct REAL NOT NULL
  );
  CREATE TABLE media_person (
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    PRIMARY KEY (media_id, person_id)
  );
  CREATE TABLE media_source (
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    PRIMARY KEY (media_id, source_id)
  );
  CREATE TABLE hint (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    collection TEXT NOT NULL DEFAULT '',
    person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    record_json TEXT NOT NULL DEFAULT '{}',
    proposals_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE task (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    person_id TEXT REFERENCES person(id) ON DELETE SET NULL,
    fact_id TEXT REFERENCES fact(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'To do',
    priority TEXT NOT NULL DEFAULT 'Medium',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    op TEXT NOT NULL,
    changed_at TEXT NOT NULL
  );
  `,
  // v2 — profile pages: photo framing, cover photo, one-profile identity, who added photos, tag approval
  `
  ALTER TABLE person ADD COLUMN photo_crop TEXT NOT NULL DEFAULT '';
  ALTER TABLE person ADD COLUMN cover_media_id TEXT;
  ALTER TABLE person ADD COLUMN profile_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE person ADD COLUMN account_email TEXT NOT NULL DEFAULT '';
  ALTER TABLE media ADD COLUMN added_by TEXT NOT NULL DEFAULT '';
  CREATE TABLE media_tag (
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'shown' CHECK (status IN ('pending','shown','hidden')),
    tagged_by TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (media_id, person_id)
  );
  UPDATE person SET profile_id = id WHERE profile_id = '';
  `,
  // v3 — where someone lived when they were born / when they died; life stories
  `
  ALTER TABLE fact ADD COLUMN home_place_id TEXT;
  CREATE TABLE story (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    date_text TEXT NOT NULL DEFAULT '',
    sort_year INTEGER,
    place_id TEXT,
    fact_id TEXT REFERENCES fact(id) ON DELETE SET NULL,
    author TEXT NOT NULL DEFAULT '',
    author_email TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE story_person (
    story_id TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'shown' CHECK (status IN ('pending','shown','hidden')),
    PRIMARY KEY (story_id, person_id)
  );
  CREATE TABLE story_media (
    story_id TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    pos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (story_id, media_id)
  );
  `,
  // v4 — approximate story dates, and stories dated by age ("at 5 years old")
  `
  ALTER TABLE story ADD COLUMN date_qualifier TEXT NOT NULL DEFAULT 'exact';
  ALTER TABLE story ADD COLUMN date2_text TEXT NOT NULL DEFAULT '';
  ALTER TABLE story ADD COLUMN age_at INTEGER;
  `,
  // v5 — family recipes
  `
  CREATE TABLE recipe (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    servings TEXT NOT NULL DEFAULT '',
    time_text TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT '',
    story TEXT NOT NULL DEFAULT '',
    date_text TEXT NOT NULL DEFAULT '',
    place_id TEXT,
    added_by TEXT NOT NULL DEFAULT '',
    shared_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE recipe_person (
    recipe_id TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    pos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (recipe_id, person_id)
  );
  CREATE TABLE recipe_media (
    recipe_id TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    pos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (recipe_id, media_id)
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;
