import type Database from 'better-sqlite3';
import type {
  Appearance,
  Match,
  MatchEvent,
  MatchSheet,
  Player,
  PlayerUsage,
  SheetSide,
} from '../domain/types.js';
import { minutesPlayed, weightedAverage } from '../domain/rating.js';

type Row = Record<string, any>;

/* ------------------------------------------------------------------ clubs */

export interface ClubInput {
  fff_id?: string | null;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  ligue?: string | null;
  district?: string | null;
  city?: string | null;
  colors?: string | null;
}

export function upsertClub(db: Database.Database, input: ClubInput): number {
  const existing = input.fff_id
    ? db.prepare('SELECT id FROM clubs WHERE fff_id = ?').get(input.fff_id)
    : db.prepare('SELECT id FROM clubs WHERE name = ? COLLATE NOCASE').get(input.name);
  if (existing) {
    const id = (existing as Row).id as number;
    db.prepare(
      `UPDATE clubs SET
         name = COALESCE(?, name),
         short_name = COALESCE(?, short_name),
         logo_url = COALESCE(?, logo_url),
         ligue = COALESCE(?, ligue),
         district = COALESCE(?, district),
         city = COALESCE(?, city),
         colors = COALESCE(?, colors),
         fff_id = COALESCE(?, fff_id),
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      input.name,
      input.short_name ?? null,
      input.logo_url ?? null,
      input.ligue ?? null,
      input.district ?? null,
      input.city ?? null,
      input.colors ?? null,
      input.fff_id ?? null,
      id,
    );
    return id;
  }
  const info = db
    .prepare(
      `INSERT INTO clubs (fff_id, name, short_name, logo_url, ligue, district, city, colors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.fff_id ?? null,
      input.name,
      input.short_name ?? null,
      input.logo_url ?? null,
      input.ligue ?? null,
      input.district ?? null,
      input.city ?? null,
      input.colors ?? null,
    );
  return Number(info.lastInsertRowid);
}

/* ------------------------------------------------------------------ teams */

export interface TeamInput {
  club_id: number;
  fff_key?: string | null;
  name: string;
  category?: string | null;
  level?: string | null;
}

export function upsertTeam(db: Database.Database, input: TeamInput): number {
  const existing = input.fff_key
    ? db.prepare('SELECT id FROM teams WHERE fff_key = ?').get(input.fff_key)
    : db
        .prepare('SELECT id FROM teams WHERE club_id = ? AND name = ? COLLATE NOCASE')
        .get(input.club_id, input.name);
  if (existing) {
    const id = (existing as Row).id as number;
    db.prepare(
      `UPDATE teams SET name = ?, category = COALESCE(?, category), level = COALESCE(?, level),
         fff_key = COALESCE(?, fff_key) WHERE id = ?`,
    ).run(input.name, input.category ?? null, input.level ?? null, input.fff_key ?? null, id);
    return id;
  }
  const info = db
    .prepare('INSERT INTO teams (club_id, fff_key, name, category, level) VALUES (?, ?, ?, ?, ?)')
    .run(input.club_id, input.fff_key ?? null, input.name, input.category ?? null, input.level ?? null);
  return Number(info.lastInsertRowid);
}

/* ----------------------------------------------------- competitions/pools */

export function upsertCompetition(
  db: Database.Database,
  input: { fff_cp_no?: string | null; name: string; season: string; level?: string | null; type?: string | null },
): number {
  const existing = db
    .prepare('SELECT id FROM competitions WHERE name = ? AND season = ?')
    .get(input.name, input.season);
  if (existing) {
    const id = (existing as Row).id as number;
    db.prepare(
      `UPDATE competitions SET fff_cp_no = COALESCE(?, fff_cp_no), level = COALESCE(?, level),
         type = COALESCE(?, type) WHERE id = ?`,
    ).run(input.fff_cp_no ?? null, input.level ?? null, input.type ?? null, id);
    return id;
  }
  const info = db
    .prepare('INSERT INTO competitions (fff_cp_no, name, season, level, type) VALUES (?, ?, ?, ?, ?)')
    .run(input.fff_cp_no ?? null, input.name, input.season, input.level ?? null, input.type ?? null);
  return Number(info.lastInsertRowid);
}

export function upsertPool(
  db: Database.Database,
  input: { competition_id: number; name: string; fff_ph_no?: string | null; fff_po_no?: string | null },
): number {
  const existing = db
    .prepare('SELECT id FROM pools WHERE competition_id = ? AND name = ?')
    .get(input.competition_id, input.name);
  if (existing) return (existing as Row).id as number;
  const info = db
    .prepare('INSERT INTO pools (competition_id, fff_ph_no, fff_po_no, name) VALUES (?, ?, ?, ?)')
    .run(input.competition_id, input.fff_ph_no ?? null, input.fff_po_no ?? null, input.name);
  return Number(info.lastInsertRowid);
}

/* ---------------------------------------------------------------- matches */

export interface MatchInput {
  fff_ma_no?: string | null;
  competition_id?: number | null;
  pool_id?: number | null;
  season: string;
  round?: number | null;
  kickoff: string;
  status?: Match['status'];
  home_team_id: number;
  away_team_id: number;
  home_score?: number | null;
  away_score?: number | null;
  home_score_ht?: number | null;
  away_score_ht?: number | null;
  venue?: string | null;
  referee?: string | null;
  source?: 'fff' | 'manual';
}

export interface UpsertResult {
  id: number;
  created: boolean;
}

export function upsertMatch(db: Database.Database, input: MatchInput): UpsertResult {
  const existing = input.fff_ma_no
    ? db.prepare('SELECT id FROM matches WHERE fff_ma_no = ?').get(input.fff_ma_no)
    : db
        .prepare(
          `SELECT id FROM matches
           WHERE home_team_id = ? AND away_team_id = ? AND substr(kickoff, 1, 10) = substr(?, 1, 10)`,
        )
        .get(input.home_team_id, input.away_team_id, input.kickoff);
  if (existing) {
    const id = (existing as Row).id as number;
    db.prepare(
      `UPDATE matches SET
         competition_id = COALESCE(?, competition_id),
         pool_id = COALESCE(?, pool_id),
         round = COALESCE(?, round),
         kickoff = ?,
         status = ?,
         home_score = ?,
         away_score = ?,
         home_score_ht = COALESCE(?, home_score_ht),
         away_score_ht = COALESCE(?, away_score_ht),
         venue = COALESCE(?, venue),
         referee = COALESCE(?, referee),
         fff_ma_no = COALESCE(?, fff_ma_no),
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      input.competition_id ?? null,
      input.pool_id ?? null,
      input.round ?? null,
      input.kickoff,
      input.status ?? 'scheduled',
      input.home_score ?? null,
      input.away_score ?? null,
      input.home_score_ht ?? null,
      input.away_score_ht ?? null,
      input.venue ?? null,
      input.referee ?? null,
      input.fff_ma_no ?? null,
      id,
    );
    return { id, created: false };
  }
  const info = db
    .prepare(
      `INSERT INTO matches
        (fff_ma_no, competition_id, pool_id, season, round, kickoff, status,
         home_team_id, away_team_id, home_score, away_score, home_score_ht, away_score_ht,
         venue, referee, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.fff_ma_no ?? null,
      input.competition_id ?? null,
      input.pool_id ?? null,
      input.season,
      input.round ?? null,
      input.kickoff,
      input.status ?? 'scheduled',
      input.home_team_id,
      input.away_team_id,
      input.home_score ?? null,
      input.away_score ?? null,
      input.home_score_ht ?? null,
      input.away_score_ht ?? null,
      input.venue ?? null,
      input.referee ?? null,
      input.source ?? 'manual',
    );
  return { id: Number(info.lastInsertRowid), created: true };
}

export interface MatchListFilters {
  date?: string;
  from?: string;
  to?: string;
  status?: string;
  competitionId?: number;
  poolId?: number;
  teamId?: number;
  clubId?: number;
  season?: string;
  limit?: number;
}

export function listMatches(db: Database.Database, filters: MatchListFilters = {}): Row[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.date) {
    where.push('substr(kickoff, 1, 10) = ?');
    params.push(filters.date);
  }
  if (filters.from) {
    where.push('kickoff >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('kickoff <= ?');
    params.push(filters.to);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.competitionId) {
    where.push('competition_id = ?');
    params.push(filters.competitionId);
  }
  if (filters.poolId) {
    where.push('pool_id = ?');
    params.push(filters.poolId);
  }
  if (filters.teamId) {
    where.push('(home_team_id = ? OR away_team_id = ?)');
    params.push(filters.teamId, filters.teamId);
  }
  if (filters.clubId) {
    where.push('(home_club_id = ? OR away_club_id = ?)');
    params.push(filters.clubId, filters.clubId);
  }
  if (filters.season) {
    where.push('season = ?');
    params.push(filters.season);
  }
  const sql = `SELECT v.*,
                 (SELECT COUNT(*) FROM match_sheets s WHERE s.match_id = v.id) AS sheets_count,
                 (SELECT COUNT(*) FROM match_events e WHERE e.match_id = v.id) AS events_count
               FROM v_matches v ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY v.kickoff ASC, v.competition_name ASC LIMIT ?`;
  params.push(filters.limit ?? 300);
  return db.prepare(sql).all(...params) as Row[];
}

export function getMatch(db: Database.Database, id: number): Row | undefined {
  return db.prepare('SELECT * FROM v_matches WHERE id = ?').get(id) as Row | undefined;
}

/* ---------------------------------------------------------------- players */

export interface PlayerInput {
  club_id?: number | null;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  position?: Player['position'];
  license?: string | null;
  shirt_number?: number | null;
}

export function upsertPlayer(db: Database.Database, input: PlayerInput): number {
  const existing = db
    .prepare(
      `SELECT id FROM players
       WHERE last_name = ? COLLATE NOCASE AND first_name = ? COLLATE NOCASE
         AND (club_id IS ? OR ? IS NULL)`,
    )
    .get(input.last_name, input.first_name, input.club_id ?? null, input.club_id ?? null);
  if (existing) {
    const id = (existing as Row).id as number;
    db.prepare(
      `UPDATE players SET position = COALESCE(?, position), shirt_number = COALESCE(?, shirt_number),
         birth_date = COALESCE(?, birth_date), license = COALESCE(?, license),
         club_id = COALESCE(?, club_id) WHERE id = ?`,
    ).run(
      input.position ?? null,
      input.shirt_number ?? null,
      input.birth_date ?? null,
      input.license ?? null,
      input.club_id ?? null,
      id,
    );
    return id;
  }
  const info = db
    .prepare(
      `INSERT INTO players (club_id, first_name, last_name, birth_date, position, license, shirt_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.club_id ?? null,
      input.first_name,
      input.last_name,
      input.birth_date ?? null,
      input.position ?? null,
      input.license ?? null,
      input.shirt_number ?? null,
    );
  return Number(info.lastInsertRowid);
}

/* ----------------------------------------------------------- match sheets */

export function getSheet(db: Database.Database, matchId: number, side: SheetSide): MatchSheet | undefined {
  return db.prepare('SELECT * FROM match_sheets WHERE match_id = ? AND side = ?').get(matchId, side) as
    | MatchSheet
    | undefined;
}

export function upsertSheet(
  db: Database.Database,
  input: { match_id: number; team_id: number; side: SheetSide; formation?: string | null; coach?: string | null; status?: 'draft' | 'validated'; notes?: string | null },
): number {
  const existing = getSheet(db, input.match_id, input.side);
  if (existing) {
    db.prepare(
      `UPDATE match_sheets SET team_id = ?, formation = ?, coach = ?, status = ?, notes = ?,
         updated_at = datetime('now') WHERE id = ?`,
    ).run(
      input.team_id,
      input.formation ?? null,
      input.coach ?? null,
      input.status ?? existing.status,
      input.notes ?? null,
      existing.id,
    );
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO match_sheets (match_id, team_id, side, formation, coach, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.match_id,
      input.team_id,
      input.side,
      input.formation ?? null,
      input.coach ?? null,
      input.status ?? 'draft',
      input.notes ?? null,
    );
  return Number(info.lastInsertRowid);
}

export function listAppearances(db: Database.Database, matchId: number): Row[] {
  return db
    .prepare(
      `SELECT a.*, p.first_name, p.last_name, p.position AS player_position, s.side
       FROM appearances a
       JOIN players p ON p.id = a.player_id
       JOIN match_sheets s ON s.id = a.sheet_id
       WHERE a.match_id = ?
       ORDER BY CASE a.role WHEN 'starter' THEN 0 WHEN 'sub' THEN 1 ELSE 2 END,
                COALESCE(a.shirt_number, 99), p.last_name`,
    )
    .all(matchId) as Row[];
}

export function listEvents(db: Database.Database, matchId: number): Row[] {
  return db
    .prepare(
      `SELECT e.*, p.first_name, p.last_name, r.first_name AS related_first_name,
              r.last_name AS related_last_name
       FROM match_events e
       LEFT JOIN players p ON p.id = e.player_id
       LEFT JOIN players r ON r.id = e.related_player_id
       WHERE e.match_id = ?
       ORDER BY e.minute ASC, e.id ASC`,
    )
    .all(matchId) as Row[];
}

/* ------------------------------------------------------------------ stats */

export interface UsageFilters {
  teamId?: number;
  clubId?: number;
  season?: string;
  competitionId?: number;
}

/** "Joueurs utilises" : agregation des feuilles de match retranscrites. */
export function playersUsage(db: Database.Database, filters: UsageFilters = {}): PlayerUsage[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.teamId) {
    where.push('a.team_id = ?');
    params.push(filters.teamId);
  }
  if (filters.clubId) {
    where.push('t.club_id = ?');
    params.push(filters.clubId);
  }
  if (filters.season) {
    where.push('m.season = ?');
    params.push(filters.season);
  }
  if (filters.competitionId) {
    where.push('m.competition_id = ?');
    params.push(filters.competitionId);
  }
  const rows = db
    .prepare(
      `SELECT a.*, p.first_name, p.last_name, p.position AS player_position, m.kickoff
       FROM appearances a
       JOIN players p ON p.id = a.player_id
       JOIN teams t ON t.id = a.team_id
       JOIN matches m ON m.id = a.match_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY m.kickoff ASC`,
    )
    .all(...params) as Row[];

  const eventRows = db
    .prepare(
      `SELECT e.* FROM match_events e
       JOIN matches m ON m.id = e.match_id
       ${filters.season ? 'WHERE m.season = ?' : ''}`,
    )
    .all(...(filters.season ? [filters.season] : [])) as Row[];

  const byPlayer = new Map<number, PlayerUsage & { _ratings: { rating: number; minutes: number }[] }>();
  for (const row of rows) {
    let usage = byPlayer.get(row.player_id);
    if (!usage) {
      usage = {
        player_id: row.player_id,
        first_name: row.first_name,
        last_name: row.last_name,
        position: row.position ?? row.player_position ?? null,
        team_id: row.team_id,
        appearances: 0,
        starts: 0,
        sub_ins: 0,
        benched_unused: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        yellow: 0,
        red: 0,
        rated_matches: 0,
        average_rating: null,
        best_rating: null,
        last_ratings: [],
        _ratings: [],
      };
      byPlayer.set(row.player_id, usage);
    }
    const minutes = minutesPlayed(row.role, row.minute_in, row.minute_out);
    if (row.role === 'starter') {
      usage.starts += 1;
      usage.appearances += 1;
    } else if (row.role === 'sub') {
      usage.sub_ins += 1;
      usage.appearances += 1;
    } else {
      usage.benched_unused += 1;
    }
    usage.minutes += minutes;
    const note = row.rating ?? row.auto_rating;
    if (note != null) {
      usage._ratings.push({ rating: note, minutes });
      usage.rated_matches += 1;
      usage.last_ratings.push(note);
      usage.best_rating = usage.best_rating == null ? note : Math.max(usage.best_rating, note);
    }
  }

  for (const event of eventRows) {
    const usage = event.player_id != null ? byPlayer.get(event.player_id) : undefined;
    if (usage) {
      if (event.type === 'goal' || event.type === 'penalty_goal') usage.goals += 1;
      if (event.type === 'yellow') usage.yellow += 1;
      if (event.type === 'red' || event.type === 'second_yellow') usage.red += 1;
    }
    if (
      event.related_player_id != null &&
      (event.type === 'goal' || event.type === 'penalty_goal')
    ) {
      const assistant = byPlayer.get(event.related_player_id);
      if (assistant) assistant.assists += 1;
    }
  }

  return [...byPlayer.values()]
    .map(({ _ratings, ...usage }) => ({
      ...usage,
      average_rating: weightedAverage(_ratings),
      last_ratings: usage.last_ratings.slice(-5),
    }))
    .sort((a, b) => b.minutes - a.minutes || b.appearances - a.appearances);
}

export type { Appearance, MatchEvent, MatchSheet };
