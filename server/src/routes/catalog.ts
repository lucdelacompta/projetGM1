import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { listMatches, playersUsage, upsertClub, upsertPlayer, upsertTeam } from '../db/repositories.js';
import { computeStandings } from '../domain/standings.js';
import { weightedAverage } from '../domain/rating.js';

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  /* ------------------------------------------------------------- clubs */

  app.get('/api/clubs', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const rows = q.q
      ? db
          .prepare(
            `SELECT c.*, (SELECT COUNT(*) FROM teams t WHERE t.club_id = c.id) AS teams_count
             FROM clubs c WHERE c.name LIKE ? ORDER BY c.name LIMIT 100`,
          )
          .all(`%${q.q}%`)
      : db
          .prepare(
            `SELECT c.*, (SELECT COUNT(*) FROM teams t WHERE t.club_id = c.id) AS teams_count
             FROM clubs c ORDER BY c.name LIMIT 200`,
          )
          .all();
    return { clubs: rows };
  });

  app.get('/api/clubs/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);
    if (!club) return reply.code(404).send({ error: 'Club introuvable' });
    const teams = db.prepare('SELECT * FROM teams WHERE club_id = ? ORDER BY name').all(id);
    const squad = db
      .prepare('SELECT * FROM players WHERE club_id = ? ORDER BY last_name, first_name')
      .all(id);
    return { club, teams, squad };
  });

  app.post('/api/clubs', async (request, reply) => {
    const body = request.body as Record<string, any>;
    if (!body?.name) return reply.code(400).send({ error: 'Le nom du club est obligatoire' });
    const id = upsertClub(db, body as { name: string });
    return reply.code(201).send(db.prepare('SELECT * FROM clubs WHERE id = ?').get(id));
  });

  /* ------------------------------------------------------------- teams */

  app.get('/api/teams', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const rows = db
      .prepare(
        `SELECT t.*, c.name AS club_name, c.logo_url, c.ligue, c.district
         FROM teams t JOIN clubs c ON c.id = t.club_id
         ${q.q ? 'WHERE t.name LIKE ? OR c.name LIKE ?' : ''}
         ORDER BY c.name, t.name LIMIT 200`,
      )
      .all(...(q.q ? [`%${q.q}%`, `%${q.q}%`] : []));
    return { teams: rows };
  });

  app.post('/api/teams', async (request, reply) => {
    const body = request.body as Record<string, any>;
    if (!body?.club_id || !body?.name) {
      return reply.code(400).send({ error: 'club_id et name sont obligatoires' });
    }
    const id = upsertTeam(db, body as { club_id: number; name: string });
    return reply.code(201).send(db.prepare('SELECT * FROM teams WHERE id = ?').get(id));
  });

  app.get('/api/teams/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const team = db
      .prepare(
        `SELECT t.*, c.name AS club_name, c.logo_url, c.ligue, c.district, c.city
         FROM teams t JOIN clubs c ON c.id = t.club_id WHERE t.id = ?`,
      )
      .get(id) as Record<string, any> | undefined;
    if (!team) return reply.code(404).send({ error: 'Equipe introuvable' });
    const matches = listMatches(db, { teamId: id, limit: 100 });
    const usage = playersUsage(db, { teamId: id });
    return {
      team,
      matches,
      usage,
      squad: db
        .prepare('SELECT * FROM players WHERE club_id = ? ORDER BY last_name, first_name')
        .all(team.club_id),
    };
  });

  /** Effectif d'une equipe : joueurs du club, tries par poste puis numero. */
  app.get('/api/teams/:id/squad', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!team) return reply.code(404).send({ error: 'Equipe introuvable' });
    const squad = db
      .prepare(
        `SELECT p.*,
                (SELECT COUNT(*) FROM appearances a WHERE a.player_id = p.id AND a.team_id = ? AND a.role <> 'unused') AS appearances
         FROM players p WHERE p.club_id = ?
         ORDER BY CASE p.position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 WHEN 'FWD' THEN 3 ELSE 4 END,
                  COALESCE(p.shirt_number, 99), p.last_name`,
      )
      .all(id, team.club_id);
    return { team, squad };
  });

  /** Liste des joueurs utilises par une equipe, avec temps de jeu et notes. */
  app.get('/api/teams/:id/usage', async (request) => {
    const id = Number((request.params as { id: string }).id);
    const q = request.query as Record<string, string | undefined>;
    return { usage: playersUsage(db, { teamId: id, season: q.season, competitionId: q.competition ? Number(q.competition) : undefined }) };
  });

  /* ----------------------------------------------------------- players */

  app.get('/api/players', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.q) {
      where.push('(p.last_name LIKE ? OR p.first_name LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    if (q.club) {
      where.push('p.club_id = ?');
      params.push(Number(q.club));
    }
    const rows = db
      .prepare(
        `SELECT p.*, c.name AS club_name,
                (SELECT COUNT(*) FROM appearances a WHERE a.player_id = p.id AND a.role <> 'unused') AS appearances,
                (SELECT ROUND(AVG(COALESCE(a.rating, a.auto_rating)), 2) FROM appearances a WHERE a.player_id = p.id) AS avg_rating
         FROM players p LEFT JOIN clubs c ON c.id = p.club_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY p.last_name, p.first_name LIMIT 200`,
      )
      .all(...params);
    return { players: rows };
  });

  app.post('/api/players', async (request, reply) => {
    const body = request.body as Record<string, any>;
    if (!body?.first_name && !body?.last_name) {
      return reply.code(400).send({ error: 'Un nom ou un prenom est obligatoire' });
    }
    const id = upsertPlayer(db, {
      club_id: body.club_id ?? null,
      first_name: body.first_name ?? '',
      last_name: body.last_name ?? '',
      position: body.position ?? null,
      shirt_number: body.shirt_number ?? null,
      birth_date: body.birth_date ?? null,
      license: body.license ?? null,
    });
    return reply.code(201).send(db.prepare('SELECT * FROM players WHERE id = ?').get(id));
  });

  app.get('/api/players/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const player = db
      .prepare('SELECT p.*, c.name AS club_name FROM players p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.id = ?')
      .get(id) as Record<string, any> | undefined;
    if (!player) return reply.code(404).send({ error: 'Joueur introuvable' });

    const rows = db
      .prepare(
        `SELECT a.*, m.kickoff, m.status, m.home_score, m.away_score,
                m.home_team_id, m.away_team_id,
                ht.name AS home_team_name, at.name AS away_team_name,
                comp.name AS competition_name
         FROM appearances a
         JOIN matches m ON m.id = a.match_id
         JOIN teams ht ON ht.id = m.home_team_id
         JOIN teams at ON at.id = m.away_team_id
         LEFT JOIN competitions comp ON comp.id = m.competition_id
         WHERE a.player_id = ?
         ORDER BY m.kickoff DESC`,
      )
      .all(id) as Record<string, any>[];

    const events = db
      .prepare(
        `SELECT e.*, m.kickoff FROM match_events e JOIN matches m ON m.id = e.match_id
         WHERE e.player_id = ? OR e.related_player_id = ? ORDER BY m.kickoff DESC`,
      )
      .all(id, id) as Record<string, any>[];

    const ratings = rows
      .map((row) => ({ rating: row.rating ?? row.auto_rating, minutes: row.minutes ?? 90 }))
      .filter((row): row is { rating: number; minutes: number } => row.rating != null);

    return {
      player,
      matches: rows,
      events,
      stats: {
        appearances: rows.filter((r) => r.role !== 'unused').length,
        starts: rows.filter((r) => r.role === 'starter').length,
        goals: events.filter((e) => e.player_id === id && (e.type === 'goal' || e.type === 'penalty_goal')).length,
        assists: events.filter((e) => e.related_player_id === id && (e.type === 'goal' || e.type === 'penalty_goal')).length,
        yellow: events.filter((e) => e.player_id === id && e.type === 'yellow').length,
        red: events.filter((e) => e.player_id === id && (e.type === 'red' || e.type === 'second_yellow')).length,
        average_rating: weightedAverage(ratings),
      },
    };
  });

  /* ------------------------------------------------- competitions/poules */

  app.get('/api/competitions', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const rows = db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM matches m WHERE m.competition_id = c.id) AS matches_count
         FROM competitions c ${q.season ? 'WHERE c.season = ?' : ''} ORDER BY c.name`,
      )
      .all(...(q.season ? [q.season] : []));
    const pools = db
      .prepare('SELECT p.*, c.name AS competition_name FROM pools p JOIN competitions c ON c.id = p.competition_id ORDER BY c.name, p.name')
      .all();
    return { competitions: rows, pools };
  });

  /** Classement calcule a partir des rencontres jouees. */
  app.get('/api/standings', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const poolId = q.pool ? Number(q.pool) : undefined;
    const competitionId = q.competition ? Number(q.competition) : undefined;
    if (!poolId && !competitionId) {
      return reply.code(400).send({ error: 'Preciser ?pool= ou ?competition=' });
    }
    const matches = listMatches(db, { poolId, competitionId, limit: 2000 });
    const teamIds = new Set<number>();
    for (const m of matches) {
      teamIds.add(m.home_team_id);
      teamIds.add(m.away_team_id);
    }
    const teams = teamIds.size
      ? (db
          .prepare(
            `SELECT t.id, t.name, c.logo_url AS logo FROM teams t JOIN clubs c ON c.id = t.club_id
             WHERE t.id IN (${[...teamIds].map(() => '?').join(',')})`,
          )
          .all(...teamIds) as { id: number; name: string; logo: string | null }[])
      : [];
    return {
      pool_id: poolId ?? null,
      competition_id: competitionId ?? null,
      standings: computeStandings(matches as any, teams),
    };
  });

  /* ------------------------------------------------------------ recherche */

  app.get('/api/search', async (request) => {
    const q = (request.query as Record<string, string | undefined>).q?.trim();
    if (!q || q.length < 2) return { clubs: [], teams: [], players: [] };
    const like = `%${q}%`;
    return {
      clubs: db.prepare('SELECT id, name, logo_url FROM clubs WHERE name LIKE ? LIMIT 8').all(like),
      teams: db
        .prepare(
          `SELECT t.id, t.name, c.name AS club_name FROM teams t JOIN clubs c ON c.id = t.club_id
           WHERE t.name LIKE ? OR c.name LIKE ? LIMIT 8`,
        )
        .all(like, like),
      players: db
        .prepare(
          `SELECT p.id, p.first_name, p.last_name, c.name AS club_name FROM players p
           LEFT JOIN clubs c ON c.id = p.club_id
           WHERE p.last_name LIKE ? OR p.first_name LIKE ? LIMIT 8`,
        )
        .all(like, like),
    };
  });

  /* ------------------------------------------------------------ palmares */

  /** Meilleures moyennes de notes, classement des buteurs. */
  app.get('/api/leaderboards', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const usage = playersUsage(db, {
      season: q.season,
      teamId: q.team ? Number(q.team) : undefined,
      competitionId: q.competition ? Number(q.competition) : undefined,
    });
    const minMatches = q.min ? Number(q.min) : 3;
    return {
      top_ratings: usage
        .filter((u) => u.average_rating != null && u.appearances >= minMatches)
        .sort((a, b) => (b.average_rating ?? 0) - (a.average_rating ?? 0))
        .slice(0, 20),
      top_scorers: [...usage].sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 20),
      most_used: [...usage].sort((a, b) => b.minutes - a.minutes).slice(0, 20),
    };
  });
}
