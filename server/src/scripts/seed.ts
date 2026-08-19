/**
 * Jeu de donnees de demonstration.
 *
 * Toutes les equipes, joueurs et rencontres ci-dessous sont FICTIFS : ils
 * servent a faire tourner l'application sans dependre de l'API FFF (dont
 * l'acces reseau n'est pas toujours disponible). Pour des donnees reelles,
 * utiliser `npm run sync` ou l'ecran "Import FFF".
 */
import { getDb } from '../db/index.js';
import {
  upsertClub,
  upsertCompetition,
  upsertMatch,
  upsertPool,
  upsertPlayer,
  upsertTeam,
} from '../db/repositories.js';
import { saveSheet, addEvent, recomputeAutoRatings } from '../services/matchsheet.js';
import { seasonFromDate } from '../fff/mappers.js';
import type { PlayerPosition } from '../domain/types.js';

const SEASON = seasonFromDate();

const CLUBS = [
  { name: 'FC Garonne Sportif', city: 'Toulouse', colors: 'Violet / Blanc' },
  { name: 'AS Comminges', city: 'Saint-Gaudens', colors: 'Rouge / Noir' },
  { name: 'Olympique Lauragais', city: 'Castelnaudary', colors: 'Bleu / Jaune' },
  { name: 'US Lomagne', city: 'Beaumont-de-Lomagne', colors: 'Vert / Blanc' },
  { name: 'Etoile Sportive du Volvestre', city: 'Carbonne', colors: 'Bleu / Blanc' },
  { name: 'AS Portet Cugnaux', city: 'Portet-sur-Garonne', colors: 'Orange / Noir' },
  { name: 'FC Pays Albigeois', city: 'Albi', colors: 'Rouge / Blanc' },
  { name: 'Racing Club Aveyronnais', city: 'Rodez', colors: 'Bleu marine' },
  { name: 'US Cotes du Tarn', city: 'Gaillac', colors: 'Jaune / Bleu' },
  { name: 'AS Val d Ariege', city: 'Foix', colors: 'Rouge / Jaune' },
  { name: 'FC Cite Carcassonnaise', city: 'Carcassonne', colors: 'Blanc / Bleu' },
  { name: 'Entente Montalbanaise', city: 'Montauban', colors: 'Noir / Or' },
];

const FIRST_NAMES = [
  'Lucas', 'Enzo', 'Theo', 'Nathan', 'Hugo', 'Yanis', 'Mehdi', 'Kevin', 'Romain', 'Maxime',
  'Adrien', 'Julien', 'Bastien', 'Quentin', 'Sofiane', 'Antoine', 'Florian', 'Clement',
  'Mathieu', 'Dorian', 'Alexis', 'Jordan', 'Samuel', 'Pierre',
];
const LAST_NAMES = [
  'Marty', 'Fabre', 'Cazes', 'Delmas', 'Bousquet', 'Vidal', 'Sanchez', 'Lopez', 'Rouquette',
  'Andrieu', 'Cabrol', 'Pujol', 'Barthes', 'Serres', 'Escande', 'Maury', 'Gasc', 'Alric',
  'Benali', 'Traore', 'Diallo', 'Ferreira', 'Da Silva', 'Nguyen',
];

const FORMATION_POSITIONS: PlayerPosition[] = [
  'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD',
];

/** Generateur pseudo-aleatoire deterministe : le jeu de donnees est reproductible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260819);
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/** Calendrier aller en tournoi toutes rondes (methode du cercle). */
function roundRobin(teamIds: number[]): { home: number; away: number }[][] {
  const ids = [...teamIds];
  if (ids.length % 2) ids.push(-1);
  const rounds: { home: number; away: number }[][] = [];
  const half = ids.length / 2;
  let list = ids.slice(1);
  for (let round = 0; round < ids.length - 1; round += 1) {
    const pairs: { home: number; away: number }[] = [];
    const fixed = ids[0]!;
    const first = list[0]!;
    if (fixed !== -1 && first !== -1) {
      pairs.push(round % 2 === 0 ? { home: fixed, away: first } : { home: first, away: fixed });
    }
    for (let i = 1; i < half; i += 1) {
      const a = list[i]!;
      const b = list[list.length - i]!;
      if (a === -1 || b === -1) continue;
      pairs.push(i % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(pairs);
    list = [list[list.length - 1]!, ...list.slice(0, -1)];
  }
  return rounds;
}

function main(): void {
  const db = getDb();
  const already = db.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number };
  if (already.n > 0 && !process.argv.includes('--force')) {
    console.log(`La base contient deja ${already.n} rencontres. Relancer avec --force pour completer.`);
    return;
  }

  const competitionId = upsertCompetition(db, {
    name: 'Regional 1 - Ligue Occitanie',
    season: SEASON,
    level: 'R1',
    type: 'Championnat',
  });
  const poolId = upsertPool(db, { competition_id: competitionId, name: 'Poule A', fff_ph_no: '1' });

  const teamIds: number[] = [];
  const clubIds: number[] = [];
  for (const club of CLUBS) {
    const clubId = upsertClub(db, {
      name: club.name,
      short_name: club.name.split(' ').slice(-1)[0] ?? club.name,
      city: club.city,
      colors: club.colors,
      ligue: 'Occitanie',
      district: 'Haute-Garonne',
    });
    clubIds.push(clubId);
    teamIds.push(
      upsertTeam(db, { club_id: clubId, name: `${club.name} 1`, category: 'Senior M', level: 'R1' }),
    );
  }

  // Effectif de 20 joueurs par club, avec postes et numeros.
  const squads = new Map<number, { id: number; position: PlayerPosition; number: number }[]>();
  for (const [index, clubId] of clubIds.entries()) {
    const squad: { id: number; position: PlayerPosition; number: number }[] = [];
    const layout: PlayerPosition[] = [
      'GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID',
      'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD', 'FWD', 'MID',
    ];
    const usedNames = new Set<string>();
    for (let i = 0; i < layout.length; i += 1) {
      const position = layout[i]!;
      // Un club ne peut pas compter deux homonymes : on tire jusqu'a obtenir
      // un couple prenom/nom inedit (le referentiel joueurs est unique par nom).
      let firstName = pick(FIRST_NAMES);
      let lastName = pick(LAST_NAMES);
      let guard = 0;
      while (usedNames.has(`${firstName}|${lastName}`) && guard < 50) {
        firstName = pick(FIRST_NAMES);
        lastName = pick(LAST_NAMES);
        guard += 1;
      }
      if (usedNames.has(`${firstName}|${lastName}`)) lastName = `${lastName}-${i}`;
      usedNames.add(`${firstName}|${lastName}`);
      const id = upsertPlayer(db, {
        club_id: clubId,
        first_name: firstName,
        last_name: lastName,
        position,
        shirt_number: i + 1,
        birth_date: `${between(1990, 2006)}-0${between(1, 9)}-1${between(0, 9)}`,
      });
      squad.push({ id, position, number: i + 1 });
    }
    squads.set(clubIds[index]!, squad);
  }

  const rounds = roundRobin(teamIds);
  // Le calendrier est ancre sur la date du jour : la journee 6 se joue
  // aujourd'hui, les precedentes sont terminees, les suivantes a venir.
  const today = new Date();
  const dayZero = new Date(today.getTime() - 5 * 14 * 86_400_000);
  const seasonStart = new Date(`${dayZero.toISOString().slice(0, 10)}T15:00:00`);

  let created = 0;
  let sheets = 0;
  for (const [roundIndex, pairs] of rounds.entries()) {
    const kickoff = new Date(seasonStart.getTime() + roundIndex * 14 * 86_400_000);
    for (const [pairIndex, pair] of pairs.entries()) {
      const time = pairIndex % 3 === 0 ? '15:00' : pairIndex % 3 === 1 ? '18:00' : '20:00';
      const date = `${kickoff.toISOString().slice(0, 10)}T${time}:00`;
      const isToday = kickoff.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
      const played = kickoff < today && !isToday;
      // Le jour J : quelques rencontres deja terminees, une en cours, le reste a venir.
      const isLive = isToday && pairIndex % 3 === 1;
      const isFinishedToday = isToday && pairIndex % 3 === 0;
      const withScore = played || isLive || isFinishedToday;
      const homeGoals = withScore ? between(0, 4) : null;
      const awayGoals = withScore ? between(0, 3) : null;
      const status = played || isFinishedToday ? 'finished' : isLive ? 'live' : 'scheduled';

      const { id: matchId } = upsertMatch(db, {
        competition_id: competitionId,
        pool_id: poolId,
        season: SEASON,
        round: roundIndex + 1,
        kickoff: date,
        status,
        home_team_id: pair.home,
        away_team_id: pair.away,
        home_score: homeGoals,
        away_score: awayGoals,
        venue: `Stade municipal`,
        referee: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        source: 'manual',
      });
      created += 1;

      // Les feuilles de match ne sont retranscrites que pour les rencontres
      // jouees des trois premieres journees (comme le ferait un utilisateur).
      if ((played || isFinishedToday) && roundIndex < 6) {
        buildSheet(db, matchId, 'home', pair.home, squads, homeGoals ?? 0);
        buildSheet(db, matchId, 'away', pair.away, squads, awayGoals ?? 0);
        recomputeAutoRatings(db, matchId);
        sheets += 2;
      }
    }
  }

  console.log(
    `Jeu de demonstration cree : ${CLUBS.length} clubs, ${rounds.length} journees, ${created} rencontres, ${sheets} feuilles de match.`,
  );
  console.log('Donnees fictives — utiliser "npm run sync" pour importer les donnees FFF reelles.');
}

function buildSheet(
  db: ReturnType<typeof getDb>,
  matchId: number,
  side: 'home' | 'away',
  teamId: number,
  squads: Map<number, { id: number; position: PlayerPosition; number: number }[]>,
  goals: number,
): void {
  const clubId = (db.prepare('SELECT club_id FROM teams WHERE id = ?').get(teamId) as { club_id: number })
    .club_id;
  const squad = squads.get(clubId) ?? [];
  const byPosition = (position: PlayerPosition) => squad.filter((p) => p.position === position);

  const starters: typeof squad = [];
  for (const position of FORMATION_POSITIONS) {
    const candidate = byPosition(position).find((p) => !starters.includes(p));
    if (candidate) starters.push(candidate);
  }
  const bench = squad.filter((p) => !starters.includes(p)).slice(0, 7);
  const usedSubs = bench.slice(0, 3);

  const players = [
    ...starters.map((player, index) => ({
      player_id: player.id,
      shirt_number: player.number,
      position: player.position,
      role: 'starter' as const,
      minute_out: usedSubs[index % 3] && index >= 8 && index < 11 ? between(55, 80) : null,
      captain: index === 5,
    })),
    ...bench.map((player, index) => ({
      player_id: player.id,
      shirt_number: player.number,
      position: player.position,
      role: index < usedSubs.length ? ('sub' as const) : ('unused' as const),
      minute_in: index < usedSubs.length ? between(55, 80) : null,
    })),
  ];

  saveSheet(db, matchId, side, {
    formation: '4-3-3',
    coach: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    status: 'validated',
    players,
  });

  const attackers = starters.filter((p) => p.position === 'FWD' || p.position === 'MID');
  for (let i = 0; i < goals; i += 1) {
    const scorer = pick(attackers);
    const assistant = pick(attackers.filter((p) => p.id !== scorer.id));
    addEvent(db, matchId, {
      team_id: teamId,
      player_id: scorer.id,
      related_player_id: assistant?.id ?? null,
      minute: between(3, 90),
      type: rand() > 0.85 ? 'penalty_goal' : 'goal',
    });
  }
  if (rand() > 0.35) {
    addEvent(db, matchId, {
      team_id: teamId,
      player_id: pick(starters).id,
      minute: between(20, 88),
      type: 'yellow',
    });
  }
  if (rand() > 0.9) {
    addEvent(db, matchId, {
      team_id: teamId,
      player_id: pick(starters).id,
      minute: between(60, 90),
      type: 'red',
    });
  }

  // Quelques notes "manuelles" pour illustrer la notation utilisateur.
  const appearances = db
    .prepare("SELECT id FROM appearances WHERE match_id = ? AND team_id = ? AND role <> 'unused'")
    .all(matchId, teamId) as { id: number }[];
  for (const appearance of appearances) {
    if (rand() > 0.45) {
      const note = Math.round((3.5 + rand() * 5) * 2) / 2;
      db.prepare("UPDATE appearances SET rating = ?, rated_at = datetime('now') WHERE id = ?").run(
        note,
        appearance.id,
      );
    }
  }
}

main();
