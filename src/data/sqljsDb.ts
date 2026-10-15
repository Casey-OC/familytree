// In-memory SQLite via sql.js — used by the unit tests and the browser preview.
import type { Database, SqlJsStatic } from 'sql.js';
import type { Db, SqlValue, Stmt } from './db';

export class SqlJsDb implements Db {
  constructor(public raw: Database) {}

  async query(sql: string, params: SqlValue[] = []) {
    const st = this.raw.prepare(sql);
    try {
      st.bind(params as any);
      const out: Record<string, SqlValue>[] = [];
      while (st.step()) out.push(st.getAsObject() as Record<string, SqlValue>);
      return out;
    } finally {
      st.free();
    }
  }

  async batch(stmts: Stmt[]) {
    this.raw.exec('BEGIN');
    try {
      for (const s of stmts) {
        if (s.params && s.params.length) this.raw.run(s.sql, s.params as any);
        else this.raw.exec(s.sql);
      }
      this.raw.exec('COMMIT');
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }
}

let sqlPromise: Promise<SqlJsStatic> | null = null;

export async function newSqlJsDb(locateFile?: (f: string) => string): Promise<SqlJsDb> {
  if (!sqlPromise) {
    const init = (await import('sql.js')).default;
    sqlPromise = init(locateFile ? { locateFile } : undefined);
  }
  const SQL = await sqlPromise;
  const db = new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON');
  return new SqlJsDb(db);
}
