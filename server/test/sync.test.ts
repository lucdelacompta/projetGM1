import { describe, expect, it } from 'vitest';
import type { Db } from '../src/db/driver.js';
import { createMemoryDb } from '../src/db/index.js';
import { FffClient } from '../src/fff/client.js';
import { syncClubs } from '../src/services/sync.js';
import { listMatches } from '../src/db/repositories.js';

/** Client hors-ligne : lit les fixtures livrees avec le projet, sans reseau. */
function offlineClient(): FffClient {
  return new FffClient({ offline: true, cacheTtl: 0, rateLimitMs: 0 });
}

function count(db: Db, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('syncClubs (mode hors-ligne sur fixtures)', () => {
  it('importe clubs, equipes, competitions et rencontres', async () => {
    const db = createMemoryDb();
    const report = await syncClubs(db, ['553'], offlineClient());

    expect(report.status).not.toBe('error');
    expect(report.clubs).toBe(1);
    expect(report.teams).toBe(2);
    expect(report.matches_inserted).toBe(5);

    // 1 club suivi + 3 adversaires rencontres
    expect(count(db, 'clubs')).toBe(4);
    expect(count(db, 'competitions')).toBe(1);
    expect(count(db, 'pools')).toBe(1);

    const matches = listMatches(db, { from: '1900-01-01', limit: 100 });
    expect(matches).toHaveLength(5);
    const first = matches[0]!;
    expect(first.kickoff).toBe('2025-09-07T15:00:00');
    expect(first.status).toBe('finished');
    expect(first.home_score).toBe(2);
    expect(first.competition_name).toBe('REGIONAL 1');
    expect(first.pool_name).toBe('POULE A');
    expect(first.venue).toBe('STADE MUNICIPAL DE L EXEMPLE');
    expect(matches.at(-1)!.status).toBe('scheduled');
  });

  it('est idempotent : un second import ne duplique rien', async () => {
    const db = createMemoryDb();
    await syncClubs(db, ['553'], offlineClient());
    const second = await syncClubs(db, ['553'], offlineClient());

    expect(second.matches_inserted).toBe(0);
    expect(second.matches_updated).toBe(5);
    expect(count(db, 'matches')).toBe(5);
    expect(count(db, 'clubs')).toBe(4);
  });

  it('trace chaque import dans sync_runs', async () => {
    const db = createMemoryDb();
    await syncClubs(db, ['553'], offlineClient());
    const run = db.prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1').get() as Record<string, any>;
    expect(run.scope).toBe('clubs:553');
    expect(run.finished_at).not.toBeNull();
    expect(run.inserted).toBe(5);
  });

  it('signale un club introuvable sans interrompre l import', async () => {
    const db = createMemoryDb();
    const report = await syncClubs(db, ['553', '999999'], offlineClient());
    expect(report.clubs).toBe(1);
    expect(report.status).toBe('partial');
    expect(report.warnings.join(' ')).toContain('999999');
  });
});

describe('FffClient', () => {
  it('construit les URL avec les parametres', () => {
    const client = new FffClient({ base: 'https://api-dofa.fff.fr/api' });
    expect(client.buildUrl('/clubs/553/equipes', { page: 2 })).toBe(
      'https://api-dofa.fff.fr/api/clubs/553/equipes?page=2',
    );
  });

  it('suit la pagination Hydra', async () => {
    const pages = [
      { 'hydra:member': [{ id: 1 }], 'hydra:view': { 'hydra:next': '/api/x?page=2' } },
      { 'hydra:member': [{ id: 2 }], 'hydra:view': {} },
    ];
    let call = 0;
    const client = new FffClient({
      rateLimitMs: 0,
      cacheTtl: 0,
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => pages[call++],
      })) as unknown as typeof fetch,
    });
    const items = await client.getCollection<{ id: number }>('/x');
    expect(items.map((item) => item.id)).toEqual([1, 2]);
    expect(client.requests).toBe(2);
  });

  it('remonte une erreur explicite quand la FFF repond 404', async () => {
    const client = new FffClient({
      rateLimitMs: 0,
      cacheTtl: 0,
      fetchImpl: (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch,
    });
    await expect(client.get('/clubs/1')).rejects.toThrow(/404/);
  });

  it('reessaie sur erreur serveur puis abandonne', async () => {
    let calls = 0;
    const client = new FffClient({
      rateLimitMs: 0,
      cacheTtl: 0,
      fetchImpl: (async () => {
        calls += 1;
        return { ok: false, status: 503, json: async () => ({}) };
      }) as unknown as typeof fetch,
    });
    await expect(client.get('/clubs/1')).rejects.toThrow(/503/);
    expect(calls).toBe(3);
  });
});
