import type { StandingRow } from './types.js';

export interface StandingInput {
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  status: string;
  kickoff: string;
}

export interface TeamRef {
  id: number;
  name: string;
  logo: string | null;
}

export interface StandingOptions {
  pointsWin?: number;
  pointsDraw?: number;
  pointsLoss?: number;
  /** Penalites manuelles (points retires par equipe), ex: forfait general. */
  penalties?: Record<number, number>;
}

/**
 * Classement calcule a partir des rencontres terminees.
 * Bareme FFF par defaut : victoire 3, nul 1, defaite 0.
 * Departages : points, difference de buts generale, buts marques, nom.
 */
export function computeStandings(
  matches: StandingInput[],
  teams: TeamRef[],
  options: StandingOptions = {},
): StandingRow[] {
  const pointsWin = options.pointsWin ?? 3;
  const pointsDraw = options.pointsDraw ?? 1;
  const pointsLoss = options.pointsLoss ?? 0;

  const table = new Map<number, StandingRow>();
  const formByTeam = new Map<number, { kickoff: string; res: 'W' | 'D' | 'L' }[]>();

  for (const team of teams) {
    table.set(team.id, {
      team_id: team.id,
      team_name: team.name,
      club_logo: team.logo,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      goal_diff: 0,
      points: 0,
      form: [],
    });
    formByTeam.set(team.id, []);
  }

  const ensure = (id: number): StandingRow => {
    let row = table.get(id);
    if (!row) {
      row = {
        team_id: id,
        team_name: `Equipe ${id}`,
        club_logo: null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        goal_diff: 0,
        points: 0,
        form: [],
      };
      table.set(id, row);
      formByTeam.set(id, []);
    }
    return row;
  };

  for (const m of matches) {
    if (m.status !== 'finished' && m.status !== 'forfeit') continue;
    if (m.home_score == null || m.away_score == null) continue;
    const home = ensure(m.home_team_id);
    const away = ensure(m.away_team_id);

    home.played += 1;
    away.played += 1;
    home.goals_for += m.home_score;
    home.goals_against += m.away_score;
    away.goals_for += m.away_score;
    away.goals_against += m.home_score;

    if (m.home_score > m.away_score) {
      home.won += 1;
      away.lost += 1;
      home.points += pointsWin;
      away.points += pointsLoss;
      formByTeam.get(home.team_id)!.push({ kickoff: m.kickoff, res: 'W' });
      formByTeam.get(away.team_id)!.push({ kickoff: m.kickoff, res: 'L' });
    } else if (m.home_score < m.away_score) {
      away.won += 1;
      home.lost += 1;
      away.points += pointsWin;
      home.points += pointsLoss;
      formByTeam.get(away.team_id)!.push({ kickoff: m.kickoff, res: 'W' });
      formByTeam.get(home.team_id)!.push({ kickoff: m.kickoff, res: 'L' });
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += pointsDraw;
      away.points += pointsDraw;
      formByTeam.get(home.team_id)!.push({ kickoff: m.kickoff, res: 'D' });
      formByTeam.get(away.team_id)!.push({ kickoff: m.kickoff, res: 'D' });
    }
  }

  for (const [teamId, penalty] of Object.entries(options.penalties ?? {})) {
    const row = table.get(Number(teamId));
    if (row) row.points -= penalty;
  }

  const rows = [...table.values()];
  for (const row of rows) {
    row.goal_diff = row.goals_for - row.goals_against;
    row.form = (formByTeam.get(row.team_id) ?? [])
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .slice(-5)
      .map((f) => f.res);
  }

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_diff - a.goal_diff ||
      b.goals_for - a.goals_for ||
      a.team_name.localeCompare(b.team_name, 'fr'),
  );
  return rows;
}
