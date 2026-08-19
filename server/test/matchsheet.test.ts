import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/driver.js';
import { createMemoryDb } from '../src/db/index.js';
import {
  playersUsage,
  upsertClub,
  upsertCompetition,
  upsertMatch,
  upsertPlayer,
  upsertTeam,
} from '../src/db/repositories.js';
import {
  ValidationError,
  addEvent,
  getMatchDetail,
  recomputeScoreFromEvents,
  saveSheet,
  setRating,
} from '../src/services/matchsheet.js';

let db: Db;
let matchId: number;
let homeTeam: number;
let awayTeam: number;
let players: number[];

beforeEach(() => {
  db = createMemoryDb();
  const homeClub = upsertClub(db, { name: 'AS Domicile' });
  const awayClub = upsertClub(db, { name: 'US Exterieur' });
  homeTeam = upsertTeam(db, { club_id: homeClub, name: 'AS Domicile 1' });
  awayTeam = upsertTeam(db, { club_id: awayClub, name: 'US Exterieur 1' });
  const competition = upsertCompetition(db, { name: 'Regional 1', season: '2025/26' });
  matchId = upsertMatch(db, {
    season: '2025/26',
    kickoff: '2025-09-14T15:00:00',
    home_team_id: homeTeam,
    away_team_id: awayTeam,
    competition_id: competition,
    status: 'finished',
    home_score: 2,
    away_score: 1,
  }).id;
  players = Array.from({ length: 14 }, (_, index) =>
    upsertPlayer(db, {
      club_id: homeClub,
      first_name: `Prenom${index}`,
      last_name: `Nom${index}`,
      position: index === 0 ? 'GK' : index < 5 ? 'DEF' : index < 9 ? 'MID' : 'FWD',
      shirt_number: index + 1,
    }),
  );
});

function fillHomeSheet() {
  return saveSheet(db, matchId, 'home', {
    formation: '4-3-3',
    coach: 'Entraineur Test',
    status: 'validated',
    players: [
      ...players.slice(0, 11).map((id, index) => ({
        player_id: id,
        role: 'starter' as const,
        shirt_number: index + 1,
        captain: index === 4,
        minute_out: index === 10 ? 70 : null,
      })),
      { player_id: players[11]!, role: 'sub' as const, minute_in: 70 },
      { player_id: players[12]!, role: 'unused' as const },
      { player_id: players[13]!, role: 'unused' as const },
    ],
  });
}

describe('saveSheet', () => {
  it('enregistre une composition complete', () => {
    const result = fillHomeSheet();
    expect(result.appearances).toBe(14);
    const detail = getMatchDetail(db, matchId)!;
    expect(detail.home.starters).toHaveLength(11);
    expect(detail.home.substitutes).toHaveLength(1);
    expect(detail.home.unused).toHaveLength(2);
    expect(detail.home.sheet?.formation).toBe('4-3-3');
  });

  it('refuse plus de 11 titulaires', () => {
    expect(() =>
      saveSheet(db, matchId, 'home', {
        players: players.slice(0, 12).map((id) => ({ player_id: id, role: 'starter' as const })),
      }),
    ).toThrow(ValidationError);
  });

  it('refuse un joueur en double', () => {
    expect(() =>
      saveSheet(db, matchId, 'home', {
        players: [
          { player_id: players[0]!, role: 'starter' },
          { player_id: players[0]!, role: 'sub' },
        ],
      }),
    ).toThrow(/deux fois/);
  });

  it('cree les joueurs inconnus a la volee', () => {
    saveSheet(db, matchId, 'away', {
      players: [{ first_name: 'Nouveau', last_name: 'Joueur', role: 'starter' }],
    });
    const detail = getMatchDetail(db, matchId)!;
    expect(detail.away.starters[0]!.last_name).toBe('Joueur');
  });

  it('conserve les notes deja saisies lors d une nouvelle sauvegarde', () => {
    fillHomeSheet();
    const detail = getMatchDetail(db, matchId)!;
    const appearance = detail.home.starters[0]!;
    setRating(db, appearance.id, 7.5, 'Solide');
    fillHomeSheet();
    const after = getMatchDetail(db, matchId)!;
    const same = after.home.starters.find((row) => row.player_id === appearance.player_id)!;
    expect(same.rating).toBe(7.5);
    expect(same.comment).toBe('Solide');
  });

  it('calcule une note automatique pour les joueurs entres', () => {
    fillHomeSheet();
    const detail = getMatchDetail(db, matchId)!;
    expect(detail.home.starters.every((row) => row.auto_rating != null)).toBe(true);
    expect(detail.home.unused.every((row) => row.auto_rating == null)).toBe(true);
  });
});

describe('setRating', () => {
  it('refuse une note hors intervalle', () => {
    fillHomeSheet();
    const detail = getMatchDetail(db, matchId)!;
    expect(() => setRating(db, detail.home.starters[0]!.id, 12)).toThrow(ValidationError);
  });
});

describe('evenements', () => {
  it('met a jour la note automatique du buteur', () => {
    fillHomeSheet();
    const before = getMatchDetail(db, matchId)!;
    const striker = before.home.starters.find((row) => row.position === 'FWD')!;
    addEvent(db, matchId, { team_id: homeTeam, player_id: striker.player_id, minute: 30, type: 'goal' });
    const after = getMatchDetail(db, matchId)!;
    const updated = after.home.starters.find((row) => row.player_id === striker.player_id)!;
    expect(updated.auto_rating!).toBeGreaterThan(striker.auto_rating!);
  });

  it('recalcule le score a partir des buts, csc compris', () => {
    fillHomeSheet();
    addEvent(db, matchId, { team_id: homeTeam, player_id: players[9]!, minute: 12, type: 'goal' });
    addEvent(db, matchId, { team_id: homeTeam, player_id: players[1]!, minute: 55, type: 'own_goal' });
    recomputeScoreFromEvents(db, matchId);
    const detail = getMatchDetail(db, matchId)!;
    expect(detail.match.home_score).toBe(1);
    expect(detail.match.away_score).toBe(1);
  });

  it('refuse une minute aberrante', () => {
    expect(() => addEvent(db, matchId, { team_id: homeTeam, minute: 300, type: 'goal' })).toThrow(
      ValidationError,
    );
  });
});

describe('joueurs utilises', () => {
  it('agrege temps de jeu, buts et notes', () => {
    fillHomeSheet();
    const detail = getMatchDetail(db, matchId)!;
    const striker = detail.home.starters.find((row) => row.position === 'FWD')!;
    addEvent(db, matchId, {
      team_id: homeTeam,
      player_id: striker.player_id,
      related_player_id: detail.home.starters[5]!.player_id,
      minute: 30,
      type: 'goal',
    });
    setRating(db, striker.id, 8);

    const usage = playersUsage(db, { teamId: homeTeam });
    const scorer = usage.find((row) => row.player_id === striker.player_id)!;
    expect(scorer.goals).toBe(1);
    expect(scorer.starts).toBe(1);
    expect(scorer.minutes).toBe(90);
    expect(scorer.average_rating).toBe(8);

    const assistant = usage.find((row) => row.player_id === detail.home.starters[5]!.player_id)!;
    expect(assistant.assists).toBe(1);

    const substitute = usage.find((row) => row.player_id === players[11])!;
    expect(substitute.sub_ins).toBe(1);
    expect(substitute.minutes).toBe(20);

    const unusedPlayer = usage.find((row) => row.player_id === players[12])!;
    expect(unusedPlayer.appearances).toBe(0);
    expect(unusedPlayer.benched_unused).toBe(1);
  });
});
