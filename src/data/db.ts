// The small database interface the app uses. Two implementations:
//  - TauriDb: the real app — SQLite files on disk via the Rust side
//  - SqlJsDb: in-memory SQLite (tests, and the browser preview used during development)

import { MIGRATIONS } from './schema';

export type SqlValue = string | number | null;

export interface Stmt {
  sql: string;
  params?: SqlValue[];
}

export interface Db {
  query(sql: string, params?: SqlValue[]): Promise<Record<string, SqlValue>[]>;
  batch(stmts: Stmt[]): Promise<void>;
}

/** Brings a tree file up to the current schema. */
export async function migrate(db: Db): Promise<void> {
  const rows = await db.query('PRAGMA user_version');
  const current = Number(Object.values(rows[0] || {})[0] || 0);
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.batch([{ sql: MIGRATIONS[v] }, { sql: `PRAGMA user_version = ${v + 1}` }]);
  }
}
