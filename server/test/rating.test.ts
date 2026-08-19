import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCALE,
  computeAutoRating,
  manOfTheMatch,
  minutesPlayed,
  roundHalf,
  weightedAverage,
} from '../src/domain/rating.js';

const base = {
  player_id: 1,
  role: 'starter' as const,
  minute_in: null,
  minute_out: null,
  position: 'MID' as const,
  captain: 0 as const,
};

describe('minutesPlayed', () => {
  it('compte 90 minutes pour un titulaire non remplace', () => {
    expect(minutesPlayed('starter', null, null)).toBe(90);
  });

  it('compte le temps reel d un entrant', () => {
    expect(minutesPlayed('sub', 70, null)).toBe(20);
    expect(minutesPlayed('sub', 70, 85)).toBe(15);
  });

  it('compte le temps d un titulaire sorti', () => {
    expect(minutesPlayed('starter', null, 60)).toBe(60);
  });

  it('ne compte rien pour un remplacant non utilise', () => {
    expect(minutesPlayed('unused', null, null)).toBe(0);
  });
});

describe('computeAutoRating', () => {
  it('ne note pas un joueur reste sur le banc', () => {
    const result = computeAutoRating({
      appearance: { ...base, role: 'unused' },
      events: [],
      teamGoalsFor: 1,
      teamGoalsAgainst: 0,
    });
    expect(result.rating).toBeNull();
    expect(result.minutes).toBe(0);
  });

  it('valorise un but et une victoire', () => {
    const neutral = computeAutoRating({
      appearance: base,
      events: [],
      teamGoalsFor: 0,
      teamGoalsAgainst: 0,
    });
    const scorer = computeAutoRating({
      appearance: base,
      events: [{ player_id: 1, related_player_id: null, type: 'goal', minute: 20 }],
      teamGoalsFor: 1,
      teamGoalsAgainst: 0,
    });
    expect(scorer.rating!).toBeGreaterThan(neutral.rating!);
    expect(scorer.breakdown.some((line) => line.label.includes('but'))).toBe(true);
  });

  it('sanctionne un carton rouge', () => {
    const result = computeAutoRating({
      appearance: base,
      events: [{ player_id: 1, related_player_id: null, type: 'red', minute: 60 }],
      teamGoalsFor: 0,
      teamGoalsAgainst: 1,
    });
    expect(result.rating!).toBeLessThan(DEFAULT_SCALE.base);
  });

  it('recompense davantage un gardien buteur qu un attaquant buteur', () => {
    const gk = computeAutoRating({
      appearance: { ...base, position: 'GK' },
      events: [{ player_id: 1, related_player_id: null, type: 'goal', minute: 90 }],
      teamGoalsFor: 1,
      teamGoalsAgainst: 1,
    });
    const fwd = computeAutoRating({
      appearance: { ...base, position: 'FWD' },
      events: [{ player_id: 1, related_player_id: null, type: 'goal', minute: 90 }],
      teamGoalsFor: 1,
      teamGoalsAgainst: 1,
    });
    expect(gk.rating!).toBeGreaterThan(fwd.rating!);
  });

  it('compte le clean sheet pour un defenseur ayant joue', () => {
    const withCleanSheet = computeAutoRating({
      appearance: { ...base, position: 'DEF' },
      events: [],
      teamGoalsFor: 1,
      teamGoalsAgainst: 0,
    });
    const withGoalsConceded = computeAutoRating({
      appearance: { ...base, position: 'DEF' },
      events: [],
      teamGoalsFor: 1,
      teamGoalsAgainst: 3,
    });
    expect(withCleanSheet.rating!).toBeGreaterThan(withGoalsConceded.rating!);
  });

  it('attenue la note des entrants tardifs', () => {
    const full = computeAutoRating({
      appearance: { ...base, position: 'FWD' },
      events: [{ player_id: 1, related_player_id: null, type: 'goal', minute: 85 }],
      teamGoalsFor: 1,
      teamGoalsAgainst: 0,
    });
    const late = computeAutoRating({
      appearance: { ...base, role: 'sub', minute_in: 85, position: 'FWD' },
      events: [{ player_id: 1, related_player_id: null, type: 'goal', minute: 88 }],
      teamGoalsFor: 1,
      teamGoalsAgainst: 0,
    });
    expect(late.rating!).toBeLessThan(full.rating!);
    expect(late.minutes).toBe(5);
  });

  it('reste dans l intervalle 0-10', () => {
    const result = computeAutoRating({
      appearance: { ...base, position: 'DEF' },
      events: Array.from({ length: 8 }, (_, index) => ({
        player_id: 1,
        related_player_id: null,
        type: 'goal' as const,
        minute: index * 10,
      })),
      teamGoalsFor: 8,
      teamGoalsAgainst: 0,
    });
    expect(result.rating!).toBeLessThanOrEqual(10);
    expect(result.rating!).toBeGreaterThanOrEqual(0);
  });

  it('arrondit au demi-point', () => {
    expect(roundHalf(6.24)).toBe(6);
    expect(roundHalf(6.26)).toBe(6.5);
  });
});

describe('weightedAverage', () => {
  it('pondere par le temps de jeu', () => {
    const average = weightedAverage([
      { rating: 8, minutes: 90 },
      { rating: 4, minutes: 15 },
    ]);
    expect(average!).toBeGreaterThan(6);
  });

  it('renvoie null sans echantillon', () => {
    expect(weightedAverage([])).toBeNull();
  });
});

describe('manOfTheMatch', () => {
  it('ecarte les joueurs ayant peu joue', () => {
    const best = manOfTheMatch([
      { rating: 9, auto_rating: null, minutes: 20 },
      { rating: 7, auto_rating: null, minutes: 90 },
    ]);
    expect(best?.rating).toBe(7);
  });

  it('utilise la note automatique a defaut de note manuelle', () => {
    const best = manOfTheMatch([
      { rating: null, auto_rating: 8, minutes: 90 },
      { rating: null, auto_rating: 6, minutes: 90 },
    ]);
    expect(best?.auto_rating).toBe(8);
  });
});
