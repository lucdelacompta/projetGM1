import type { MatchStatus, PlayerPosition } from './types';

export const POSITION_LABEL: Record<PlayerPosition, string> = {
  GK: 'Gardien',
  DEF: 'Defenseur',
  MID: 'Milieu',
  FWD: 'Attaquant',
};

export const POSITION_SHORT: Record<PlayerPosition, string> = {
  GK: 'G',
  DEF: 'D',
  MID: 'M',
  FWD: 'A',
};

export const STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: 'A venir',
  live: 'En cours',
  finished: 'Termine',
  postponed: 'Reporte',
  cancelled: 'Annule',
  forfeit: 'Forfait',
};

export const EVENT_LABEL: Record<string, string> = {
  goal: 'But',
  own_goal: 'But contre son camp',
  penalty_goal: 'But sur penalty',
  penalty_missed: 'Penalty manque',
  penalty_saved: 'Penalty arrete',
  yellow: 'Carton jaune',
  second_yellow: 'Second avertissement',
  red: 'Carton rouge',
  substitution: 'Remplacement',
};

export const EVENT_ICON: Record<string, string> = {
  goal: '⚽',
  own_goal: '⚽',
  penalty_goal: '⚽',
  penalty_missed: '✖',
  penalty_saved: '🧤',
  yellow: '🟨',
  second_yellow: '🟨🟥',
  red: '🟥',
  substitution: '🔁',
};

export function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

export function formatDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function formatLongDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Couleur de la pastille de note, facon presse sportive. */
export function ratingClass(rating: number | null | undefined): string {
  if (rating == null) return 'rating rating--empty';
  if (rating >= 8) return 'rating rating--excellent';
  if (rating >= 6.5) return 'rating rating--good';
  if (rating >= 5) return 'rating rating--average';
  return 'rating rating--poor';
}

export function playerName(player: { first_name?: string | null; last_name?: string | null }): string {
  const first = player.first_name?.trim() ?? '';
  const last = player.last_name?.trim() ?? '';
  if (!first) return last || 'Joueur';
  return `${first.charAt(0)}. ${last}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
