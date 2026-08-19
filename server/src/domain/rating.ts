import type { Appearance, MatchEvent, PlayerPosition } from './types.js';

/**
 * Bareme de notation automatique.
 * La note calculee ici n'est qu'une *proposition* : la note faisant foi reste
 * celle saisie par l'utilisateur (Appearance.rating). Le bareme sert de point
 * de depart lors de la retranscription d'une feuille de match.
 */
export interface RatingScale {
  base: number;
  win: number;
  draw: number;
  loss: number;
  goal: Record<PlayerPosition, number>;
  assist: number;
  ownGoal: number;
  penaltyMissed: number;
  penaltySaved: number;
  yellow: number;
  secondYellow: number;
  red: number;
  cleanSheet: Record<PlayerPosition, number>;
  goalConcededGk: number;
  goalConcededDef: number;
  cleanSheetMinMinutes: number;
  captainBonus: number;
  min: number;
  max: number;
}

export const DEFAULT_SCALE: RatingScale = {
  base: 5.5,
  win: 0.4,
  draw: 0,
  loss: -0.3,
  goal: { GK: 3, DEF: 1.5, MID: 1.2, FWD: 1 },
  assist: 0.7,
  ownGoal: -1.2,
  penaltyMissed: -0.8,
  penaltySaved: 1.2,
  yellow: -0.4,
  secondYellow: -1.2,
  red: -1.6,
  cleanSheet: { GK: 1, DEF: 0.7, MID: 0.2, FWD: 0 },
  goalConcededGk: -0.35,
  goalConcededDef: -0.15,
  cleanSheetMinMinutes: 60,
  captainBonus: 0.1,
  min: 0,
  max: 10,
};

export interface AutoRatingInput {
  appearance: Pick<Appearance, 'player_id' | 'role' | 'minute_in' | 'minute_out' | 'position' | 'captain'>;
  events: Pick<MatchEvent, 'player_id' | 'related_player_id' | 'type' | 'minute'>[];
  teamGoalsFor: number;
  teamGoalsAgainst: number;
  matchDurationMinutes?: number;
  scale?: RatingScale;
}

export interface AutoRatingResult {
  rating: number | null;
  minutes: number;
  breakdown: { label: string; value: number }[];
}

export function minutesPlayed(
  role: string,
  minuteIn: number | null,
  minuteOut: number | null,
  duration = 90,
): number {
  if (role === 'unused') return 0;
  const start = role === 'starter' ? 0 : minuteIn ?? 0;
  const end = minuteOut ?? duration;
  return Math.max(0, Math.min(duration, end) - Math.min(start, duration));
}

/** Arrondi au demi-point le plus proche, comme les notes de la presse sportive. */
export function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function computeAutoRating(input: AutoRatingInput): AutoRatingResult {
  const scale = input.scale ?? DEFAULT_SCALE;
  const duration = input.matchDurationMinutes ?? 90;
  const app = input.appearance;
  const minutes = minutesPlayed(app.role, app.minute_in, app.minute_out, duration);
  if (app.role === 'unused' || minutes <= 0) {
    return { rating: null, minutes: 0, breakdown: [] };
  }

  const pos: PlayerPosition = app.position ?? 'MID';
  const breakdown: { label: string; value: number }[] = [];
  const add = (label: string, value: number) => {
    if (value !== 0) breakdown.push({ label, value: Number(value.toFixed(2)) });
  };

  let total = scale.base;
  add('Base', scale.base);

  // Resultat collectif : pondere par le temps de jeu reel.
  const share = minutes / duration;
  const resultDelta =
    input.teamGoalsFor > input.teamGoalsAgainst
      ? scale.win
      : input.teamGoalsFor === input.teamGoalsAgainst
        ? scale.draw
        : scale.loss;
  total += resultDelta * share;
  add('Resultat de l equipe', resultDelta * share);

  const mine = input.events.filter((e) => e.player_id === app.player_id);
  const assists = input.events.filter(
    (e) => e.related_player_id === app.player_id && (e.type === 'goal' || e.type === 'penalty_goal'),
  );

  const goals = mine.filter((e) => e.type === 'goal' || e.type === 'penalty_goal').length;
  if (goals) {
    const v = goals * scale.goal[pos];
    total += v;
    add(`${goals} but${goals > 1 ? 's' : ''}`, v);
  }
  if (assists.length) {
    const v = assists.length * scale.assist;
    total += v;
    add(`${assists.length} passe${assists.length > 1 ? 's' : ''} decisive${assists.length > 1 ? 's' : ''}`, v);
  }

  const counters: [EventCount, number, string][] = [
    ['own_goal', scale.ownGoal, 'CSC'],
    ['penalty_missed', scale.penaltyMissed, 'Penalty manque'],
    ['penalty_saved', scale.penaltySaved, 'Penalty arrete'],
    ['yellow', scale.yellow, 'Carton jaune'],
    ['second_yellow', scale.secondYellow, 'Second jaune'],
    ['red', scale.red, 'Carton rouge'],
  ];
  for (const [type, weight, label] of counters) {
    const n = mine.filter((e) => e.type === type).length;
    if (n > 0) {
      total += n * weight;
      add(n > 1 ? `${label} x${n}` : label, n * weight);
    }
  }

  // Clean sheet / buts encaisses : uniquement pour les joueurs defensifs
  // ayant tenu une part significative de la rencontre.
  if (minutes >= scale.cleanSheetMinMinutes) {
    if (input.teamGoalsAgainst === 0) {
      const v = scale.cleanSheet[pos];
      total += v;
      add('Clean sheet', v);
    } else if (pos === 'GK' || pos === 'DEF') {
      const weight = pos === 'GK' ? scale.goalConcededGk : scale.goalConcededDef;
      const v = input.teamGoalsAgainst * weight;
      total += v;
      add(`${input.teamGoalsAgainst} but(s) encaisse(s)`, v);
    }
  }

  if (app.captain) {
    total += scale.captainBonus;
    add('Capitaine', scale.captainBonus);
  }

  // Un joueur entre tres tard ne peut pas obtenir une note extreme :
  // on ramene la note vers la base proportionnellement au temps joue.
  if (minutes < 25) {
    const damped = scale.base + (total - scale.base) * (0.4 + (minutes / 25) * 0.6);
    add('Temps de jeu limite', damped - total);
    total = damped;
  }

  const clamped = Math.min(scale.max, Math.max(scale.min, total));
  return { rating: roundHalf(clamped), minutes, breakdown };
}

type EventCount =
  | 'own_goal'
  | 'penalty_missed'
  | 'penalty_saved'
  | 'yellow'
  | 'second_yellow'
  | 'red';

/** Moyenne ponderee par le temps de jeu (une note sur 90' pese plus qu'une sur 10'). */
export function weightedAverage(samples: { rating: number; minutes: number }[]): number | null {
  const valid = samples.filter((s) => Number.isFinite(s.rating));
  if (!valid.length) return null;
  const totalWeight = valid.reduce((acc, s) => acc + Math.max(15, s.minutes), 0);
  if (totalWeight === 0) return null;
  const sum = valid.reduce((acc, s) => acc + s.rating * Math.max(15, s.minutes), 0);
  return Number((sum / totalWeight).toFixed(2));
}

/** Homme du match : meilleure note (manuelle si dispo, sinon auto) avec au moins 45 minutes. */
export function manOfTheMatch<T extends { rating: number | null; auto_rating: number | null; minutes: number }>(
  rows: T[],
): T | null {
  let best: T | null = null;
  let bestValue = -1;
  for (const row of rows) {
    const value = row.rating ?? row.auto_rating;
    if (value == null || row.minutes < 45) continue;
    if (value > bestValue) {
      bestValue = value;
      best = row;
    }
  }
  return best;
}
