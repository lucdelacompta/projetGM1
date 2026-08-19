import type Database from 'better-sqlite3';
import { computeAutoRating, manOfTheMatch, minutesPlayed } from '../domain/rating.js';
import type { AppearanceRole, EventType, PlayerPosition, SheetSide } from '../domain/types.js';
import { getMatch, listAppearances, listEvents, upsertPlayer, upsertSheet } from '../db/repositories.js';

export interface SheetPlayerInput {
  player_id?: number;
  first_name?: string;
  last_name?: string;
  shirt_number?: number | null;
  position?: PlayerPosition | null;
  role?: AppearanceRole;
  minute_in?: number | null;
  minute_out?: number | null;
  captain?: boolean;
  rating?: number | null;
  comment?: string | null;
}

export interface SheetInput {
  formation?: string | null;
  coach?: string | null;
  status?: 'draft' | 'validated';
  notes?: string | null;
  players: SheetPlayerInput[];
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Retranscription d'une feuille de match pour une equipe.
 * Remplace integralement la composition existante (operation idempotente).
 */
export function saveSheet(
  db: Database.Database,
  matchId: number,
  side: SheetSide,
  input: SheetInput,
): { sheet_id: number; appearances: number } {
  const match = getMatch(db, matchId);
  if (!match) throw new ValidationError(`Rencontre ${matchId} introuvable`);
  const teamId = side === 'home' ? match.home_team_id : match.away_team_id;
  const clubId = side === 'home' ? match.home_club_id : match.away_club_id;

  const starters = input.players.filter((p) => (p.role ?? 'starter') === 'starter');
  if (starters.length > 11) {
    throw new ValidationError(`Une composition ne peut pas compter plus de 11 titulaires (recu: ${starters.length})`);
  }
  for (const player of input.players) {
    if (player.rating != null && (player.rating < 0 || player.rating > 10)) {
      throw new ValidationError('Une note doit etre comprise entre 0 et 10');
    }
    if (!player.player_id && !(player.first_name || player.last_name)) {
      throw new ValidationError('Chaque ligne doit referencer un joueur existant ou porter un nom');
    }
  }

  const run = db.transaction(() => {
    const sheetId = upsertSheet(db, {
      match_id: matchId,
      team_id: teamId,
      side,
      formation: input.formation ?? null,
      coach: input.coach ?? null,
      status: input.status ?? 'draft',
      notes: input.notes ?? null,
    });

    const previous = db
      .prepare('SELECT player_id, rating, comment FROM appearances WHERE sheet_id = ?')
      .all(sheetId) as { player_id: number; rating: number | null; comment: string | null }[];
    const previousById = new Map(previous.map((row) => [row.player_id, row]));
    db.prepare('DELETE FROM appearances WHERE sheet_id = ?').run(sheetId);

    const insert = db.prepare(
      `INSERT INTO appearances
        (sheet_id, match_id, team_id, player_id, shirt_number, position, role,
         minute_in, minute_out, captain, rating, comment, rated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let count = 0;
    const seen = new Set<number>();
    for (const player of input.players) {
      const playerId =
        player.player_id ??
        upsertPlayer(db, {
          club_id: clubId,
          first_name: (player.first_name ?? '').trim() || '-',
          last_name: (player.last_name ?? '').trim() || '-',
          position: player.position ?? null,
          shirt_number: player.shirt_number ?? null,
        });
      if (seen.has(playerId)) {
        throw new ValidationError('Un meme joueur ne peut pas figurer deux fois sur la feuille');
      }
      seen.add(playerId);
      // A defaut de poste sur la feuille, on reprend celui de la fiche joueur.
      const position =
        player.position ??
        ((db.prepare('SELECT position FROM players WHERE id = ?').get(playerId) as
          | { position: PlayerPosition | null }
          | undefined)?.position ??
          null);
      const kept = previousById.get(playerId);
      const rating = player.rating !== undefined ? player.rating : (kept?.rating ?? null);
      const comment = player.comment !== undefined ? player.comment : (kept?.comment ?? null);
      insert.run(
        sheetId,
        matchId,
        teamId,
        playerId,
        player.shirt_number ?? null,
        position,
        player.role ?? 'starter',
        player.minute_in ?? null,
        player.minute_out ?? null,
        player.captain ? 1 : 0,
        rating,
        comment,
        rating == null ? null : new Date().toISOString(),
      );
      count += 1;
    }
    return { sheet_id: sheetId, appearances: count };
  });

  const result = run();
  recomputeAutoRatings(db, matchId);
  return result;
}

export function setRating(
  db: Database.Database,
  appearanceId: number,
  rating: number | null,
  comment?: string | null,
): void {
  if (rating != null && (rating < 0 || rating > 10)) {
    throw new ValidationError('Une note doit etre comprise entre 0 et 10');
  }
  const info = db
    .prepare(
      `UPDATE appearances SET rating = ?, comment = COALESCE(?, comment),
         rated_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END
       WHERE id = ?`,
    )
    .run(rating, comment ?? null, rating, appearanceId);
  if (info.changes === 0) throw new ValidationError(`Participation ${appearanceId} introuvable`);
}

export interface EventInput {
  team_id: number;
  player_id?: number | null;
  related_player_id?: number | null;
  minute: number;
  type: EventType;
  detail?: string | null;
}

const EVENT_TYPES: EventType[] = [
  'goal',
  'own_goal',
  'penalty_goal',
  'penalty_missed',
  'penalty_saved',
  'yellow',
  'second_yellow',
  'red',
  'substitution',
];

export function addEvent(db: Database.Database, matchId: number, input: EventInput): number {
  if (!EVENT_TYPES.includes(input.type)) {
    throw new ValidationError(`Type d'evenement inconnu: ${input.type}`);
  }
  if (!Number.isFinite(input.minute) || input.minute < 0 || input.minute > 130) {
    throw new ValidationError('La minute doit etre comprise entre 0 et 130');
  }
  const info = db
    .prepare(
      `INSERT INTO match_events (match_id, team_id, player_id, related_player_id, minute, type, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      matchId,
      input.team_id,
      input.player_id ?? null,
      input.related_player_id ?? null,
      Math.round(input.minute),
      input.type,
      input.detail ?? null,
    );
  recomputeAutoRatings(db, matchId);
  return Number(info.lastInsertRowid);
}

export function deleteEvent(db: Database.Database, matchId: number, eventId: number): void {
  db.prepare('DELETE FROM match_events WHERE id = ? AND match_id = ?').run(eventId, matchId);
  recomputeAutoRatings(db, matchId);
}

/** Recalcule le score a partir des buts saisis (utile pendant la retranscription). */
export function recomputeScoreFromEvents(db: Database.Database, matchId: number): void {
  const match = getMatch(db, matchId);
  if (!match) return;
  const events = listEvents(db, matchId);
  let home = 0;
  let away = 0;
  for (const event of events) {
    const scoringTeam =
      event.type === 'own_goal'
        ? event.team_id === match.home_team_id
          ? match.away_team_id
          : match.home_team_id
        : event.type === 'goal' || event.type === 'penalty_goal'
          ? event.team_id
          : null;
    if (scoringTeam == null) continue;
    if (scoringTeam === match.home_team_id) home += 1;
    else away += 1;
  }
  db.prepare("UPDATE matches SET home_score = ?, away_score = ?, updated_at = datetime('now') WHERE id = ?").run(
    home,
    away,
    matchId,
  );
}

/** Applique le bareme automatique a toutes les participations d'une rencontre. */
export function recomputeAutoRatings(db: Database.Database, matchId: number): void {
  const match = getMatch(db, matchId);
  if (!match) return;
  const appearances = listAppearances(db, matchId);
  const events = listEvents(db, matchId);
  const update = db.prepare('UPDATE appearances SET auto_rating = ? WHERE id = ?');
  const apply = db.transaction(() => {
    for (const appearance of appearances) {
      const isHome = appearance.team_id === match.home_team_id;
      const goalsFor = (isHome ? match.home_score : match.away_score) ?? 0;
      const goalsAgainst = (isHome ? match.away_score : match.home_score) ?? 0;
      const { rating } = computeAutoRating({
        appearance: {
          player_id: appearance.player_id,
          role: appearance.role,
          minute_in: appearance.minute_in,
          minute_out: appearance.minute_out,
          position: appearance.position ?? appearance.player_position ?? null,
          captain: appearance.captain,
        },
        events: events.map((e) => ({
          player_id: e.player_id,
          related_player_id: e.related_player_id,
          type: e.type,
          minute: e.minute,
        })),
        teamGoalsFor: goalsFor,
        teamGoalsAgainst: goalsAgainst,
      });
      update.run(rating, appearance.id);
    }
  });
  apply();
}

/** Vue complete d'une rencontre : score, compositions, evenements, notes. */
export function getMatchDetail(db: Database.Database, matchId: number) {
  const match = getMatch(db, matchId);
  if (!match) return null;
  const sheets = db.prepare('SELECT * FROM match_sheets WHERE match_id = ?').all(matchId) as Record<
    string,
    any
  >[];
  const appearances: (Record<string, any> & { minutes: number })[] = listAppearances(db, matchId).map(
    (row) => ({ ...row, minutes: minutesPlayed(row.role, row.minute_in, row.minute_out) }),
  );
  const events = listEvents(db, matchId);
  const bySide = (side: SheetSide) => {
    const sheet = sheets.find((s) => s.side === side) ?? null;
    const rows = appearances.filter((a) => a.sheet_id === sheet?.id);
    return {
      sheet,
      starters: rows.filter((a) => a.role === 'starter'),
      substitutes: rows.filter((a) => a.role === 'sub'),
      unused: rows.filter((a) => a.role === 'unused'),
    };
  };
  return {
    match,
    home: bySide('home'),
    away: bySide('away'),
    events,
    man_of_the_match: manOfTheMatch(
      appearances as (Record<string, any> & { rating: number | null; auto_rating: number | null; minutes: number })[],
    ),
  };
}
