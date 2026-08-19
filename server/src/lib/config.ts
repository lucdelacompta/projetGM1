import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

// Ancre les chemins par defaut sur le dossier `server/`, que l on soit lance
// depuis la racine du depot, depuis server/ ou par un service systeme :
// ce fichier vit en src/lib/ (tsx) ou dist/lib/ (compile), soit deux niveaux plus bas.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const config = {
  port: int('PORT', 4000),
  host: str('HOST', '0.0.0.0'),
  databasePath: path.resolve(root, str('DATABASE_PATH', './data/amateurscore.db')),
  webDist: path.resolve(root, str('WEB_DIST', '../web/dist')),
  fff: {
    base: str('FFF_API_BASE', 'https://api-dofa.fff.fr/api'),
    userAgent: str('FFF_USER_AGENT', 'AmateurScore/0.1 (+contact@example.org)'),
    rateLimitMs: int('FFF_RATE_LIMIT_MS', 600),
    cacheTtl: int('FFF_CACHE_TTL', 3600),
    cacheDir: path.resolve(root, str('FFF_CACHE_DIR', './data/fff-cache')),
    offline: bool('FFF_OFFLINE', false),
    clubs: str('FFF_CLUBS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    timeoutMs: int('FFF_TIMEOUT_MS', 15000),
    maxPages: int('FFF_MAX_PAGES', 25),
  },
};

export type Config = typeof config;
