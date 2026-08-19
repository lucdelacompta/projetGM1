/**
 * Import des donnees FFF en ligne de commande.
 *
 *   npm run sync                    # utilise FFF_CLUBS
 *   npm run sync -- --clubs 553,12  # clubs explicites (cl_no)
 *   npm run sync -- --pool 420001/1/3
 */
import { getDb } from '../db/index.js';
import { config } from '../lib/config.js';
import { FffClient } from '../fff/client.js';
import { syncClubs, syncPool } from '../services/sync.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const db = getDb();
const client = new FffClient();

const pool = arg('pool');
if (pool) {
  const [cpNo, phNo, poNo] = pool.split('/');
  if (!cpNo || !phNo || !poNo) {
    console.error('Format attendu : --pool <cp_no>/<ph_no>/<po_no>');
    process.exit(1);
  }
  const report = await syncPool(db, cpNo, phNo, poNo, client);
  print(report);
} else {
  const clubs = (arg('clubs') ?? config.fff.clubs.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  if (!clubs.length) {
    console.error('Aucun club a importer. Renseignez FFF_CLUBS dans .env ou passez --clubs 553,1234.');
    process.exit(1);
  }
  const report = await syncClubs(db, clubs, client);
  print(report);
}

function print(report: unknown): void {
  console.log(JSON.stringify(report, null, 2));
}
