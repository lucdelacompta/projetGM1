export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'forfeit';
export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD';
export type AppearanceRole = 'starter' | 'sub' | 'unused';

export interface MatchRow {
  id: number;
  kickoff: string;
  status: MatchStatus;
  round: number | null;
  season: string;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string;
  away_team_name: string;
  home_club_id: number;
  away_club_id: number;
  home_logo: string | null;
  away_logo: string | null;
  home_score: number | null;
  away_score: number | null;
  competition_id: number | null;
  competition_name: string | null;
  competition_level: string | null;
  pool_id: number | null;
  pool_name: string | null;
  venue: string | null;
  referee: string | null;
}

export interface MatchGroup {
  competition: string;
  level: string | null;
  pool: string | null;
  matches: MatchRow[];
}

export interface Appearance {
  id: number;
  match_id: number;
  team_id: number;
  player_id: number;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position: PlayerPosition | null;
  player_position: PlayerPosition | null;
  role: AppearanceRole;
  minute_in: number | null;
  minute_out: number | null;
  captain: 0 | 1;
  rating: number | null;
  auto_rating: number | null;
  comment: string | null;
  minutes: number;
  side: 'home' | 'away';
}

export interface MatchEventRow {
  id: number;
  match_id: number;
  team_id: number;
  player_id: number | null;
  related_player_id: number | null;
  minute: number;
  type: string;
  detail: string | null;
  first_name: string | null;
  last_name: string | null;
  related_first_name: string | null;
  related_last_name: string | null;
}

export interface SheetSideData {
  sheet: { id: number; formation: string | null; coach: string | null; status: string; notes: string | null } | null;
  starters: Appearance[];
  substitutes: Appearance[];
  unused: Appearance[];
}

export interface MatchDetail {
  match: MatchRow;
  home: SheetSideData;
  away: SheetSideData;
  events: MatchEventRow[];
  man_of_the_match: Appearance | null;
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
