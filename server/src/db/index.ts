import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../lib/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  instance = db;
  return db;
}

/** Base en memoire, utilisee par les tests. */
export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  const candidates = [
    path.join(here, 'schema.sql'),
    path.join(here, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error(`schema.sql introuvable (cherche dans: ${candidates.join(', ')})`);
  db.exec(fs.readFileSync(file, 'utf8'));
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
