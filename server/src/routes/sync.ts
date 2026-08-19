import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { config } from '../lib/config.js';
import { FffClient } from '../fff/client.js';
import { syncClubs, syncPool } from '../services/sync.js';

let running = false;

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get('/api/sync/status', async () => ({
    running,
    source: config.fff.base,
    offline: config.fff.offline,
    configured_clubs: config.fff.clubs,
    runs: db.prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 20').all(),
  }));

  /** Declenche un import FFF pour une liste de clubs (cl_no). */
  app.post('/api/sync/clubs', async (request, reply) => {
    if (running) return reply.code(409).send({ error: 'Un import est deja en cours' });
    const body = (request.body ?? {}) as { clubs?: string[] };
    const clubs = body.clubs?.length ? body.clubs.map(String) : config.fff.clubs;
    if (!clubs.length) {
      return reply
        .code(400)
        .send({ error: 'Aucun club a importer : renseignez FFF_CLUBS ou envoyez { "clubs": ["553"] }' });
    }
    running = true;
    try {
      return await syncClubs(db, clubs, new FffClient());
    } finally {
      running = false;
    }
  });

  /** Import d'une poule entiere : /api/sync/pool { cp_no, ph_no, po_no }. */
  app.post('/api/sync/pool', async (request, reply) => {
    if (running) return reply.code(409).send({ error: 'Un import est deja en cours' });
    const body = (request.body ?? {}) as { cp_no?: string; ph_no?: string; po_no?: string };
    if (!body.cp_no || !body.ph_no || !body.po_no) {
      return reply.code(400).send({ error: 'cp_no, ph_no et po_no sont obligatoires' });
    }
    running = true;
    try {
      return await syncPool(db, String(body.cp_no), String(body.ph_no), String(body.po_no), new FffClient());
    } finally {
      running = false;
    }
  });

  /** Diagnostic : verifie que l'API FFF est joignable depuis ce serveur. */
  app.get('/api/sync/probe', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const client = new FffClient({ cacheTtl: 0 });
    const target = q.path ?? '/clubs/553';
    try {
      const payload = await client.get(target);
      return { ok: true, url: client.buildUrl(target), sample: truncate(payload) };
    } catch (error) {
      return {
        ok: false,
        url: client.buildUrl(target),
        error: error instanceof Error ? error.message : String(error),
        hint: "Verifiez FFF_API_BASE, la connectivite sortante et le proxy eventuel (Node n'utilise HTTPS_PROXY qu'avec NODE_USE_ENV_PROXY=1).",
      };
    }
  });
}

function truncate(payload: unknown): unknown {
  const text = JSON.stringify(payload);
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : payload;
}
