import { describe, expect, it } from 'vitest';
import { computeStandings } from '../src/domain/standings.js';

const teams = [
  { id: 1, name: 'Alpha', logo: null },
  { id: 2, name: 'Beta', logo: null },
  { id: 3, name: 'Gamma', logo: null },
];

const finished = (home: number, away: number, hs: number, as: number, day: string) => ({
  home_team_id: home,
  away_team_id: away,
  home_score: hs,
  away_score: as,
  status: 'finished',
  kickoff: `${day}T15:00:00`,
});

describe('computeStandings', () => {
  it('applique le bareme 3-1-0', () => {
    const table = computeStandings(
      [finished(1, 2, 2, 0, '2025-09-07'), finished(2, 3, 1, 1, '2025-09-14')],
      teams,
    );
    expect(table[0]!.team_name).toBe('Alpha');
    expect(table[0]!.points).toBe(3);
    expect(table.find((row) => row.team_id === 2)!.points).toBe(1);
  });

  it('ignore les rencontres non jouees', () => {
    const table = computeStandings(
      [{ ...finished(1, 2, 0, 0, '2025-09-07'), status: 'scheduled', home_score: null, away_score: null }],
      teams,
    );
    expect(table.every((row) => row.played === 0)).toBe(true);
  });

  it('departage a la difference de buts puis aux buts marques', () => {
    const table = computeStandings(
      [finished(1, 3, 4, 0, '2025-09-07'), finished(2, 3, 2, 0, '2025-09-07')],
      teams,
    );
    expect(table[0]!.team_id).toBe(1);
    expect(table[1]!.team_id).toBe(2);
  });

  it('conserve les 5 derniers resultats dans la forme', () => {
    const matches = Array.from({ length: 7 }, (_, index) =>
      finished(1, 2, 1, 0, `2025-09-0${index + 1}`),
    );
    const table = computeStandings(matches, teams);
    expect(table[0]!.form).toHaveLength(5);
    expect(table[0]!.form.every((result) => result === 'W')).toBe(true);
  });

  it('applique les penalites de points', () => {
    const table = computeStandings([finished(1, 2, 1, 0, '2025-09-07')], teams, { penalties: { 1: 2 } });
    expect(table.find((row) => row.team_id === 1)!.points).toBe(1);
  });
});
