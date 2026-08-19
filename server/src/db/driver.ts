/**
 * Pilote SQLite base sur le module `node:sqlite` integre a Node.
 *
 * Aucune dependance native : rien a compiler, ni Python ni compilateur C++
 * a installer. `node:sqlite` est disponible sans option a partir de Node 23.4 ;
 * sur Node 22.5 a 23.3 il faut lancer Node avec `--experimental-sqlite`.
 *
 * L interface reprend le sous-ensemble de better-sqlite3 utilise par le projet
 * (`prepare`, `exec`, `transaction`, `close`), transactions imbriquees comprises.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement {
  run(...params: SqlValue[]): RunResult;
  /** Renvoie la premiere ligne, ou `undefined` si la requete ne ramene rien. */
  get(...params: SqlValue[]): any;
  all(...params: SqlValue[]): any[];
}

interface NodeDatabase {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  close(): void;
}

interface NodeSqlite {
  DatabaseSync: new (path: string) => NodeDatabase;
}

const UNAVAILABLE = [
  "Le module SQLite integre a Node ('node:sqlite') n est pas disponible.",
  `Node en cours d execution : ${process.version}.`,
  'Utilisez Node 23.4 ou plus recent (Node 24 LTS recommande),',
  'ou lancez Node avec l option --experimental-sqlite sur Node 22.5 a 23.3.',
].join(' ');

let sqlite: NodeSqlite | null = null;

function loadSqlite(): NodeSqlite {
  if (sqlite) return sqlite;
  try {
    sqlite = require('node:sqlite') as NodeSqlite;
  } catch {
    throw new Error(UNAVAILABLE);
  }
  return sqlite;
}

export class Db {
  private readonly inner: NodeDatabase;
  private depth = 0;

  constructor(filename: string) {
    const { DatabaseSync } = loadSqlite();
    this.inner = new DatabaseSync(filename);
  }

  prepare(sql: string): Statement {
    return this.inner.prepare(sql);
  }

  exec(sql: string): void {
    this.inner.exec(sql);
  }

  /**
   * Emballe `fn` dans une transaction. La fonction renvoyee execute le tout :
   * validation en sortie normale, annulation si une exception remonte.
   * Une transaction imbriquee s appuie sur un SAVEPOINT.
   */
  transaction<T>(fn: () => T): () => T {
    return () => {
      const nested = this.depth > 0;
      const savepoint = `sp_${this.depth}`;
      this.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN');
      this.depth += 1;
      try {
        const result = fn();
        this.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
        return result;
      } catch (error) {
        this.exec(nested ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK');
        if (nested) this.exec(`RELEASE ${savepoint}`);
        throw error;
      } finally {
        this.depth -= 1;
      }
    };
  }

  close(): void {
    this.inner.close();
  }
}
