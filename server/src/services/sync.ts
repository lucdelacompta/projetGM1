import type Database from 'better-sqlite3';
import { FffClient } from '../fff/client.js';
import { ENDPOINTS } from '../fff/endpoints.js';
import { mapClub, mapMatch, mapTeam, seasonFromDate, type MappedMatch, type MappedTeam } from '../fff/mappers.js';
import {
  upsertClub,
  upsertCompetition,
  upsertMatch,
  upsertPool,
  upsertTeam,
} from '../db/repositories.js';

export interface SyncReport {
  run_id: number;
  scope: string;
  clubs: number;
  teams: number;
  matches_inserted: number;
  matches_updated: number;
  requests: number;
  warnings: string[];
  status: 'ok' | 'partial' | 'error';
  message?: string;
}

/**
 * Import des donnees FFF pour un ou plusieurs clubs.
 *
 * Pour chaque club : fiche club -> equipes -> calendrier et resultats de
 * chaque equipe. Les rencontres sont rattachees a leur competition et a leur
 * poule quand l'API les fournit, ce qui permet de recalculer les classements.
 */
export async function syncClubs(
  db: Database.Database,
  clubNumbers: string[],
  client = new FffClient(),
): Promise<SyncReport> {
  const scope = `clubs:${clubNumbers.join(',')}`;
  const runId = startRun(db, 'fff', scope);
  const season = seasonFromDate();
  const report: SyncReport = {
    run_id: runId,
    scope,
    clubs: 0,
    teams: 0,
    matches_inserted: 0,
    matches_updated: 0,
    requests: 0,
    warnings: [],
    status: 'ok',
  };

  try {
    for (const clNo of clubNumbers) {
      const rawClub = await client.get(ENDPOINTS.club(clNo)).catch((error: Error) => {
        report.warnings.push(`Club ${clNo} : ${error.message}`);
        return null;
      });
      if (!rawClub) continue;
      const mappedClub = mapClub(rawClub);
      if (!mappedClub) {
        report.warnings.push(`Club ${clNo} : reponse illisible`);
        continue;
      }
      mappedClub.fff_id ??= String(clNo);
      const clubId = upsertClub(db, mappedClub);
      report.clubs += 1;

      const rawTeams = await client.getCollection(ENDPOINTS.clubTeams(clNo)).catch((error: Error) => {
        report.warnings.push(`Equipes du club ${clNo} : ${error.message}`);
        return [];
      });

      for (const rawTeam of rawTeams) {
        const team = mapTeam(rawTeam, mappedClub);
        if (!team) continue;
        upsertTeam(db, {
          club_id: clubId,
          fff_key: team.fff_key,
          name: team.name,
          category: team.category,
          level: team.level,
        });
        report.teams += 1;

        const number = team.number ?? 1;
        const payloads = await Promise.all([
          client.getCollection(ENDPOINTS.teamMatches(clNo, number)).catch(() => []),
          client.getCollection(ENDPOINTS.teamResults(clNo, number)).catch(() => []),
          client.getCollection(ENDPOINTS.teamNextMatches(clNo, number)).catch(() => []),
        ]);
        // Les trois endpoints se recouvrent (calendrier complet, resultats,
        // prochaines rencontres) : on dedoublonne avant d ecrire en base.
        const seen = new Set<string>();
        for (const rawMatch of payloads.flat()) {
          const mapped = mapMatch(rawMatch, season);
          if (!mapped) continue;
          const key =
            mapped.fff_ma_no ?? `${mapped.kickoff}|${mapped.home?.fff_key}|${mapped.away?.fff_key}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const result = ingestMatch(db, mapped, season);
          if (result === 'inserted') report.matches_inserted += 1;
          else if (result === 'updated') report.matches_updated += 1;
          else report.warnings.push(`Rencontre ignoree (equipes non identifiees) le ${mapped.kickoff}`);
        }
      }
    }
    report.requests = client.requests;
    report.status = report.warnings.length ? 'partial' : 'ok';
  } catch (error) {
    report.status = 'error';
    report.message = error instanceof Error ? error.message : String(error);
  }

  finishRun(db, runId, report);
  return report;
}

/** Import d'une poule complete (calendrier + resultats de toutes les equipes). */
export async function syncPool(
  db: Database.Database,
  cpNo: string,
  phNo: string,
  poNo: string,
  client = new FffClient(),
): Promise<SyncReport> {
  const scope = `poule:${cpNo}/${phNo}/${poNo}`;
  const runId = startRun(db, 'fff', scope);
  const season = seasonFromDate();
  const report: SyncReport = {
    run_id: runId,
    scope,
    clubs: 0,
    teams: 0,
    matches_inserted: 0,
    matches_updated: 0,
    requests: 0,
    warnings: [],
    status: 'ok',
  };
  try {
    const rawMatches = await client.getCollection(ENDPOINTS.poolMatches(cpNo, phNo, poNo));
    for (const rawMatch of rawMatches) {
      const mapped = mapMatch(rawMatch, season);
      if (!mapped) continue;
      mapped.competition ??= null;
      if (mapped.competition) {
        mapped.competition.fff_cp_no ??= cpNo;
        mapped.competition.fff_ph_no ??= phNo;
        mapped.competition.fff_po_no ??= poNo;
      }
      const result = ingestMatch(db, mapped, season);
      if (result === 'inserted') report.matches_inserted += 1;
      else if (result === 'updated') report.matches_updated += 1;
      else report.warnings.push(`Rencontre ignoree le ${mapped.kickoff}`);
    }
    report.requests = client.requests;
    report.status = report.warnings.length ? 'partial' : 'ok';
  } catch (error) {
    report.status = 'error';
    report.message = error instanceof Error ? error.message : String(error);
  }
  finishRun(db, runId, report);
  return report;
}

type IngestResult = 'inserted' | 'updated' | 'skipped';

export function ingestMatch(db: Database.Database, mapped: MappedMatch, season: string): IngestResult {
  const homeTeamId = ensureTeam(db, mapped.home);
  const awayTeamId = ensureTeam(db, mapped.away);
  if (!homeTeamId || !awayTeamId) return 'skipped';

  let competitionId: number | null = null;
  let poolId: number | null = null;
  if (mapped.competition) {
    competitionId = upsertCompetition(db, {
      fff_cp_no: mapped.competition.fff_cp_no,
      name: mapped.competition.name,
      season: mapped.competition.season || season,
      level: mapped.competition.level,
      type: mapped.competition.type,
    });
    if (mapped.competition.poolName) {
      poolId = upsertPool(db, {
        competition_id: competitionId,
        name: mapped.competition.poolName,
        fff_ph_no: mapped.competition.fff_ph_no,
        fff_po_no: mapped.competition.fff_po_no,
      });
    }
  }

  const { created } = upsertMatch(db, {
    fff_ma_no: mapped.fff_ma_no,
    competition_id: competitionId,
    pool_id: poolId,
    season,
    round: mapped.round,
    kickoff: mapped.kickoff,
    status: mapped.status,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_score: mapped.home_score,
    away_score: mapped.away_score,
    venue: mapped.venue,
    source: 'fff',
  });
  return created ? 'inserted' : 'updated';
}

function ensureTeam(db: Database.Database, team: MappedTeam | null): number | null {
  if (!team?.club) return null;
  const clubId = upsertClub(db, team.club);
  return upsertTeam(db, {
    club_id: clubId,
    fff_key: team.fff_key,
    name: team.name,
    category: team.category,
    level: team.level,
  });
}

function startRun(db: Database.Database, source: string, scope: string): number {
  const info = db.prepare('INSERT INTO sync_runs (source, scope) VALUES (?, ?)').run(source, scope);
  return Number(info.lastInsertRowid);
}

function finishRun(db: Database.Database, runId: number, report: SyncReport): void {
  db.prepare(
    `UPDATE sync_runs SET finished_at = datetime('now'), status = ?, inserted = ?, updated = ?,
       requests = ?, message = ? WHERE id = ?`,
  ).run(
    report.status,
    report.matches_inserted,
    report.matches_updated,
    report.requests,
    report.message ?? (report.warnings.length ? report.warnings.slice(0, 5).join(' | ') : null),
    runId,
  );
}
