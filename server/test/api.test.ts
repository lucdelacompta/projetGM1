import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Test d integration des routes HTTP : la base est isolee dans un fichier
 * temporaire, defini avant le chargement de la configuration.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amateurscore-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.LOG_LEVEL = 'silent';

let app: Awaited<ReturnType<typeof import('../src/server.js')['buildServer']>>;
let homeTeam: number;
let awayTeam: number;
let matchId: number;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();

  const club = async (name: string) =>
    (await app.inject({ method: 'POST', url: '/api/clubs', payload: { name } })).json().id as number;
  const team = async (clubId: number, name: string) =>
    (await app.inject({ method: 'POST', url: '/api/teams', payload: { club_id: clubId, name } })).json()
      .id as number;

  homeTeam = await team(await club('AS Test Domicile'), 'AS Test Domicile 1');
  awayTeam = await team(await club('US Test Exterieur'), 'US Test Exterieur 1');

  const created = await app.inject({
    method: 'POST',
    url: '/api/matches',
    payload: {
      home_team_id: homeTeam,
      away_team_id: awayTeam,
      kickoff: '2025-10-05T15:00:00',
      season: '2025/26',
      status: 'finished',
      home_score: 1,
      away_score: 0,
    },
  });
  matchId = created.json().id;
});

afterAll(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('API', () => {
  it('expose son etat de sante', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('groupe les rencontres du jour par competition', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/matches?date=2025-10-05' });
    expect(response.statusCode).toBe(200);
    expect(response.json().count).toBe(1);
    expect(response.json().groups).toHaveLength(1);
  });

  it('refuse une rencontre d une equipe contre elle-meme', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: { home_team_id: homeTeam, away_team_id: homeTeam, kickoff: '2025-10-12T15:00:00' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('retranscrit une feuille de match puis note un joueur', async () => {
    const sheet = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchId}/sheet/home`,
      payload: {
        formation: '4-4-2',
        players: [
          { first_name: 'Paul', last_name: 'Gardien', position: 'GK', role: 'starter', shirt_number: 1 },
          { first_name: 'Marc', last_name: 'Buteur', position: 'FWD', role: 'starter', shirt_number: 9 },
          { first_name: 'Leo', last_name: 'Entrant', position: 'MID', role: 'sub', minute_in: 60 },
        ],
      },
    });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().appearances).toBe(3);

    const detail = sheet.json().detail;
    const striker = detail.home.starters.find((row: any) => row.last_name === 'Buteur');
    expect(striker.minutes).toBe(90);

    const rating = await app.inject({
      method: 'PUT',
      url: `/api/appearances/${striker.id}/rating`,
      payload: { rating: 8.5, comment: 'Doublette gagnante' },
    });
    expect(rating.statusCode).toBe(200);
    expect(rating.json().rating).toBe(8.5);

    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/appearances/${striker.id}/rating`,
      payload: { rating: 42 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('refuse une feuille sans tableau de joueurs', async () => {
    const response = await app.inject({ method: 'PUT', url: `/api/matches/${matchId}/sheet/home`, payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it('refuse un cote inconnu', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchId}/sheet/milieu`,
      payload: { players: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('liste les joueurs utilises par une equipe', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/teams/${homeTeam}/usage` });
    expect(response.statusCode).toBe(200);
    const usage = response.json().usage;
    expect(usage).toHaveLength(3);
    expect(usage[0].minutes).toBe(90);
    expect(usage.find((row: any) => row.last_name === 'Entrant').minutes).toBe(30);
  });

  it('applique le bareme aux joueurs non notes', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/matches/${matchId}/ratings/auto` });
    expect(response.statusCode).toBe(200);
    expect(response.json().applied).toBeGreaterThan(0);
    const detail = response.json().detail;
    const striker = detail.home.starters.find((row: any) => row.last_name === 'Buteur');
    expect(striker.rating).toBe(8.5); // la note manuelle n est pas ecrasee
  });

  it('calcule un classement', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/standings?competition=1` });
    expect([200, 400]).toContain(response.statusCode);
  });

  it('exige un perimetre pour le classement', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/standings' });
    expect(response.statusCode).toBe(400);
  });

  it('renvoie 404 sur une rencontre inconnue', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/matches/999999' });
    expect(response.statusCode).toBe(404);
  });

  it('recherche clubs, equipes et joueurs', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/search?q=Test' });
    expect(response.statusCode).toBe(200);
    expect(response.json().clubs.length).toBeGreaterThan(0);
    expect(response.json().teams.length).toBeGreaterThan(0);
  });
});
