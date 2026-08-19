/**
 * Normalisation des charges utiles FFF.
 *
 * L'API DOFA n'est pas contractualisee publiquement : selon l'endpoint et la
 * version, un meme champ s'appelle `libelle`, `name` ou `nom`, un score est
 * `home_score` ou `score_home`. Les mappers ci-dessous acceptent donc
 * plusieurs orthographes et retombent proprement sur `null` quand rien ne
 * correspond, plutot que de faire echouer tout un import.
 */

export type Raw = Record<string, unknown>;

export function asObject(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

/** Premiere valeur non vide parmi une liste de chemins ("a.b.c" accepte). */
export function pick(source: unknown, ...paths: string[]): unknown {
  for (const path of paths) {
    let current: unknown = source;
    for (const segment of path.split('.')) {
      const obj = asObject(current);
      if (!obj) {
        current = undefined;
        break;
      }
      current = obj[segment];
    }
    if (current !== undefined && current !== null && current !== '') return current;
  }
  return undefined;
}

export function pickString(source: unknown, ...paths: string[]): string | null {
  const value = pick(source, ...paths);
  if (value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

export function pickNumber(source: unknown, ...paths: string[]): number | null {
  const value = pick(source, ...paths);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export interface MappedClub {
  fff_id: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  ligue: string | null;
  district: string | null;
  city: string | null;
  colors: string | null;
}

export function mapClub(raw: unknown): MappedClub | null {
  const name =
    pickString(raw, 'name', 'nom', 'libelle', 'club.name', 'club.nom', 'affiliation_number');
  if (!name) return null;
  return {
    fff_id: pickString(raw, 'cl_no', 'club.cl_no', 'id', 'club_id'),
    name,
    short_name: pickString(raw, 'short_name', 'sortName', 'nom_court', 'abbreviation'),
    logo_url: pickString(raw, 'logo', 'club.logo', 'logo_url', 'picture', 'image'),
    ligue: pickString(raw, 'ligue.libelle', 'ligue.name', 'ligue', 'league.name'),
    district: pickString(raw, 'district.libelle', 'district.name', 'district'),
    city: pickString(raw, 'commune', 'city', 'ville', 'adresse.commune'),
    colors: pickString(raw, 'couleurs', 'colors'),
  };
}

export interface MappedTeam {
  fff_key: string | null;
  number: number | null;
  name: string;
  category: string | null;
  level: string | null;
  club: MappedClub | null;
}

export function mapTeam(raw: unknown, fallbackClub?: MappedClub | null): MappedTeam | null {
  const club = mapClub(pick(raw, 'club') ?? raw) ?? fallbackClub ?? null;
  const number = pickNumber(raw, 'number', 'numero', 'equipe_numero', 'team_number');
  const category = pickString(raw, 'category_label', 'categorie', 'category.libelle', 'category');
  const base = pickString(raw, 'short_name', 'name', 'libelle') ?? club?.name;
  if (!base) return null;
  const suffix = number && number > 1 ? ` ${number}` : '';
  return {
    fff_key:
      club?.fff_id && number != null ? `${club.fff_id}-${number}` : pickString(raw, 'id', 'te_no'),
    number,
    name: base.includes(String(number ?? '')) ? base : `${base}${suffix}`,
    category,
    level: pickString(raw, 'engagements.0.competition.name', 'niveau', 'level'),
    club,
  };
}

export interface MappedCompetition {
  fff_cp_no: string | null;
  name: string;
  season: string;
  level: string | null;
  type: string | null;
  poolName: string | null;
  fff_ph_no: string | null;
  fff_po_no: string | null;
}

export function mapCompetition(raw: unknown, defaultSeason: string): MappedCompetition | null {
  const source = asObject(pick(raw, 'competition')) ?? asObject(raw);
  if (!source) return null;
  const name = pickString(source, 'name', 'libelle', 'nom');
  if (!name) return null;
  const seasonNumber = pickNumber(source, 'saison', 'season');
  return {
    fff_cp_no: pickString(source, 'cp_no', 'id'),
    name,
    season: seasonNumber ? `${seasonNumber}/${(seasonNumber + 1) % 100}` : defaultSeason,
    level: pickString(source, 'level', 'niveau', 'type'),
    type: pickString(source, 'type', 'nature'),
    poolName: pickString(raw, 'poule.name', 'poule.libelle', 'poule', 'group.name'),
    fff_ph_no: pickString(raw, 'phase.number', 'phase', 'ph_no', 'poule.phase.number'),
    fff_po_no: pickString(raw, 'poule.id', 'po_no', 'poule.stage_number'),
  };
}

export interface MappedMatch {
  fff_ma_no: string | null;
  kickoff: string;
  round: number | null;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'forfeit';
  home: MappedTeam | null;
  away: MappedTeam | null;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  competition: MappedCompetition | null;
}

const STATUS_MAP: Record<string, MappedMatch['status']> = {
  A: 'scheduled',
  J: 'finished',
  F: 'forfeit',
  R: 'postponed',
  I: 'cancelled',
  T: 'finished',
  M: 'live',
};

export function mapMatch(raw: unknown, defaultSeason: string): MappedMatch | null {
  const date = pickString(raw, 'date', 'match_date', 'ma_dh', 'date_match');
  const time = pickString(raw, 'time', 'heure', 'ma_heure');
  if (!date) return null;
  const kickoff = normalizeDate(date, time);
  const home = mapTeam(pick(raw, 'home', 'home_team', 'equipe_dom', 'club_dom'));
  const away = mapTeam(pick(raw, 'away', 'away_team', 'equipe_ext', 'club_ext'));
  const homeScore = pickNumber(raw, 'home_score', 'score_home', 'nb_but_dom');
  const awayScore = pickNumber(raw, 'away_score', 'score_away', 'nb_but_ext');
  const rawStatus = pickString(raw, 'ma_statut', 'status', 'etat');
  const mappedStatus = rawStatus ? STATUS_MAP[rawStatus.toUpperCase()] : undefined;
  let status: MappedMatch['status'] =
    mappedStatus ?? (homeScore != null && awayScore != null ? 'finished' : 'scheduled');
  if (status === 'scheduled' && new Date(kickoff).getTime() < Date.now() - 3 * 3600_000 && homeScore != null) {
    status = 'finished';
  }
  return {
    fff_ma_no: pickString(raw, 'ma_no', 'id', 'match_id'),
    kickoff,
    round: pickNumber(raw, 'poule_journee.number', 'journee', 'day', 'round'),
    status,
    home,
    away,
    home_score: homeScore,
    away_score: awayScore,
    venue: pickString(raw, 'terrain.name', 'terrain.libelle', 'stade', 'venue'),
    competition: mapCompetition(raw, defaultSeason),
  };
}

/** `2025-09-14` + `15:00` -> `2025-09-14T15:00:00` (heure locale, sans conversion). */
export function normalizeDate(date: string, time?: string | null): string {
  const day = date.includes('T') ? date.slice(0, 10) : date.slice(0, 10);
  const hour = time ? time.slice(0, 5) : date.includes('T') ? date.slice(11, 16) : '15:00';
  return `${day}T${(hour || '15:00').padEnd(5, '0')}:00`;
}

/** Saison sportive au format `2025/26` a partir d'une date. */
export function seasonFromDate(date: Date = new Date()): string {
  const year = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}
