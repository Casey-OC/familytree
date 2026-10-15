// The real app's database: SQLite files on disk, reached through the Rust side.
import { invoke } from '@tauri-apps/api/core';
import type { Db, SqlValue, Stmt } from './db';

interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
}

export class TauriDb implements Db {
  async query(sql: string, params: SqlValue[] = []) {
    const r = await invoke<QueryResult>('db_query', { sql, params });
    return r.rows.map((row) => {
      const o: Record<string, SqlValue> = {};
      r.columns.forEach((c, i) => (o[c] = row[i]));
      return o;
    });
  }

  async batch(stmts: Stmt[]) {
    if (!stmts.length) return;
    await invoke('db_batch', { stmts: stmts.map((s) => ({ sql: s.sql, params: s.params || [] })) });
  }
}
