/**
 * Modele de donnees du suivi du football amateur francais.
 * Les identifiants "fff_*" reprennent la nomenclature de l'API DOFA de la FFF
 * (cl_no pour un club, cp_no pour une competition, ph_no pour une phase,
 * po_no pour une poule, ma_no pour une rencontre).
 */

export type MatchStatus =
  | 'scheduled' // a jouer
  | 'live' // en cours
  | 'finished' // termine
  | 'postponed' // reporte
  | 'cancelled' // annule
  | 'forfeit'; // forfait

export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export type AppearanceRole = 'starter' | 'sub' | 'unused';

export type EventType =
  | 'goal'
  | 'own_goal'
  | 'penalty_goal'
  | 'penalty_missed'
  | 'penalty_saved'
  | 'yellow'
  | 'second_yellow'
  | 'red'
  | 'substitution';

export type SheetSide = 'home' | 'away';

export interface Club {
  id: number;
  fff_id: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  ligue: string | null;
  district: string | null;
  city: string | null;
  colors: string | null;
}

export interface Team {
  id: number;
  club_id: number;
  fff_key: string | null;
  name: string;
  category: string | null;
  level: string | null;
  club?: Club;
}

export interface Competition {
  id: number;
  fff_cp_no: string | null;
  name: string;
  season: string;
  level: string | null;
  type: string | null;
}

export interface Pool {
  id: number;
  competition_id: number;
  fff_ph_no: string | null;
  fff_po_no: string | null;
  name: string;
}

export interface Match {
  id: number;
  fff_ma_no: string | null;
  competition_id: number | null;
  pool_id: number | null;
  season: string;
  round: number | null;
  kickoff: string; // ISO 8601
  status: MatchStatus;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  venue: string | null;
  referee: string | null;
  source: 'fff' | 'manual';
  updated_at: string;
}

export interface Player {
  id: number;
  club_id: number | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  position: PlayerPosition | null;
  license: string | null;
  shirt_number: number | null;
}

export interface MatchSheet {
  id: number;
  match_id: number;
  team_id: number;
  side: SheetSide;
  formation: string | null;
  coach: string | null;
  status: 'draft' | 'validated';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appearance {
  id: number;
  sheet_id: number;
  match_id: number;
  team_id: number;
  player_id: number;
  shirt_number: number | null;
  position: PlayerPosition | null;
  role: AppearanceRole;
  minute_in: number | null;
  minute_out: number | null;
  captain: 0 | 1;
  rating: number | null; // note manuelle 0-10
  auto_rating: number | null; // note calculee par le bareme
  comment: string | null;
}

export interface MatchEvent {
  id: number;
  match_id: number;
  team_id: number;
  player_id: number | null;
  related_player_id: number | null; // passeur, ou joueur remplace
  minute: number;
  type: EventType;
  detail: string | null;
}

export interface StandingRow {
  team_id: number;
  team_name: string;
  club_logo: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

export interface PlayerUsage {
  player_id: number;
  first_name: string;
  last_name: string;
  position: PlayerPosition | null;
  team_id: number;
  appearances: number;
  starts: number;
  sub_ins: number;
  benched_unused: number;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  rated_matches: number;
  average_rating: number | null;
  best_rating: number | null;
  last_ratings: number[];
}
