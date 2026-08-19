import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { getMatch, listMatches, upsertMatch, type MatchListFilters } from '../db/repositories.js';
import {
  addEvent,
  deleteEvent,
  getMatchDetail,
  recomputeAutoRatings,
  recomputeScoreFromEvents,
  saveSheet,
  setRating,
  ValidationError,
} from '../services/matchsheet.js';
import type { SheetSide } from '../domain/types.js';

const DAY = 86_400_000;

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  /** Liste facon "scoreboard" : les rencontres d'une journee, groupees par competition. */
  app.get('/api/matches', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const filters: MatchListFilters = {
      date: q.date,
      from: q.from,
      to: q.to,
      status: q.status,
      competitionId: q.competition ? Number(q.competition) : undefined,
      poolId: q.pool ? Number(q.pool) : undefined,
      teamId: q.team ? Number(q.team) : undefined,
      clubId: q.club ? Number(q.club) : undefined,
      season: q.season,
      limit: q.limit ? Number(q.limit) : undefined,
    };
    if (!filters.date && !filters.from && !filters.to && !filters.teamId && !filters.clubId) {
      filters.date = new Date().toISOString().slice(0, 10);
    }
    const rows = listMatches(db, filters);
    const groups = new Map<string, { competition: string; level: string | null; pool: string | null; matches: unknown[] }>();
    for (const row of rows) {
      const key = `${row.competition_name ?? 'Autres rencontres'}|${row.pool_name ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          competition: row.competition_name ?? 'Autres rencontres',
          level: row.competition_level ?? null,
          pool: row.pool_name ?? null,
          matches: [],
        };
        groups.set(key, group);
      }
      group.matches.push(row);
    }
    return { count: rows.length, groups: [...groups.values()], matches: rows };
  });

  /** Dates ayant au moins une rencontre, pour alimenter la barre de dates. */
  app.get('/api/matches/calendar', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const anchor = q.date ? new Date(`${q.date}T12:00:00Z`) : new Date();
    const from = new Date(anchor.getTime() - 10 * DAY).toISOString().slice(0, 10);
    const to = new Date(anchor.getTime() + 10 * DAY).toISOString().slice(0, 10);
    const rows = db
      .prepare(
        `SELECT substr(kickoff, 1, 10) AS date, COUNT(*) AS total,
                SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live
         FROM matches WHERE substr(kickoff, 1, 10) BETWEEN ? AND ?
         GROUP BY date ORDER BY date`,
      )
      .all(from, to);
    return { from, to, days: rows };
  });

  app.get('/api/matches/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const detail = getMatchDetail(db, id);
    if (!detail) return reply.code(404).send({ error: 'Rencontre introuvable' });
    return detail;
  });

  /** Creation manuelle d'une rencontre (utile quand la FFF ne publie rien). */
  app.post('/api/matches', async (request, reply) => {
    const body = request.body as Record<string, any>;
    if (!body?.home_team_id || !body?.away_team_id || !body?.kickoff) {
      return reply.code(400).send({ error: 'home_team_id, away_team_id et kickoff sont obligatoires' });
    }
    if (body.home_team_id === body.away_team_id) {
      return reply.code(400).send({ error: 'Une equipe ne peut pas se rencontrer elle-meme' });
    }
    const { id } = upsertMatch(db, {
      season: body.season ?? new Date().toISOString().slice(0, 4),
      kickoff: body.kickoff,
      home_team_id: Number(body.home_team_id),
      away_team_id: Number(body.away_team_id),
      competition_id: body.competition_id ?? null,
      pool_id: body.pool_id ?? null,
      round: body.round ?? null,
      status: body.status ?? 'scheduled',
      home_score: body.home_score ?? null,
      away_score: body.away_score ?? null,
      venue: body.venue ?? null,
      referee: body.referee ?? null,
      source: 'manual',
    });
    return reply.code(201).send(getMatch(db, id));
  });

  /** Mise a jour du score / statut (saisie en direct facon live-score). */
  app.patch('/api/matches/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as Record<string, any>;
    const match = getMatch(db, id);
    if (!match) return reply.code(404).send({ error: 'Rencontre introuvable' });
    db.prepare(
      `UPDATE matches SET
         status = COALESCE(?, status),
         home_score = COALESCE(?, home_score),
         away_score = COALESCE(?, away_score),
         home_score_ht = COALESCE(?, home_score_ht),
         away_score_ht = COALESCE(?, away_score_ht),
         venue = COALESCE(?, venue),
         referee = COALESCE(?, referee),
         kickoff = COALESCE(?, kickoff),
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      body.status ?? null,
      body.home_score ?? null,
      body.away_score ?? null,
      body.home_score_ht ?? null,
      body.away_score_ht ?? null,
      body.venue ?? null,
      body.referee ?? null,
      body.kickoff ?? null,
      id,
    );
    recomputeAutoRatings(db, id);
    return getMatch(db, id);
  });

  /** Retranscription complete d'une feuille de match (domicile ou exterieur). */
  app.put('/api/matches/:id/sheet/:side', async (request, reply) => {
    const { id, side } = request.params as { id: string; side: string };
    if (side !== 'home' && side !== 'away') {
      return reply.code(400).send({ error: "Le cote doit valoir 'home' ou 'away'" });
    }
    const body = request.body as { players?: unknown };
    if (!Array.isArray(body?.players)) {
      return reply.code(400).send({ error: 'Le champ players (tableau) est obligatoire' });
    }
    try {
      const result = saveSheet(db, Number(id), side as SheetSide, body as any);
      return { ...result, detail: getMatchDetail(db, Number(id)) };
    } catch (error) {
      if (error instanceof ValidationError) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  app.post('/api/matches/:id/events', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    try {
      const eventId = addEvent(db, id, request.body as any);
      if ((request.query as Record<string, string>).recompute_score === '1') {
        recomputeScoreFromEvents(db, id);
        recomputeAutoRatings(db, id);
      }
      return reply.code(201).send({ id: eventId, detail: getMatchDetail(db, id) });
    } catch (error) {
      if (error instanceof ValidationError) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  app.delete('/api/matches/:id/events/:eventId', async (request) => {
    const { id, eventId } = request.params as { id: string; eventId: string };
    deleteEvent(db, Number(id), Number(eventId));
    return { ok: true, detail: getMatchDetail(db, Number(id)) };
  });

  /** Notation d'un joueur sur une rencontre. */
  app.put('/api/appearances/:id/rating', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { rating?: number | null; comment?: string | null };
    try {
      setRating(db, id, body.rating ?? null, body.comment);
      const row = db.prepare('SELECT * FROM appearances WHERE id = ?').get(id);
      return row ?? reply.code(404).send({ error: 'Participation introuvable' });
    } catch (error) {
      if (error instanceof ValidationError) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  /** Applique les notes proposees par le bareme a tous les joueurs non notes. */
  app.post('/api/matches/:id/ratings/auto', async (request) => {
    const id = Number((request.params as { id: string }).id);
    recomputeAutoRatings(db, id);
    const info = db
      .prepare("UPDATE appearances SET rating = auto_rating, rated_at = datetime('now') WHERE match_id = ? AND rating IS NULL AND auto_rating IS NOT NULL")
      .run(id);
    return { applied: info.changes, detail: getMatchDetail(db, id) };
  });
}
