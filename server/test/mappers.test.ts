import { describe, expect, it } from 'vitest';
import { mapClub, mapMatch, mapTeam, normalizeDate, pickNumber, pickString, seasonFromDate } from '../src/fff/mappers.js';
import { extractMembers, hasNextPage } from '../src/fff/client.js';

describe('selecteurs tolerants', () => {
  it('accepte plusieurs orthographes de champ', () => {
    expect(pickString({ libelle: 'Poule A' }, 'name', 'libelle')).toBe('Poule A');
    expect(pickString({ club: { nom: 'US Test' } }, 'club.nom')).toBe('US Test');
    expect(pickNumber({ journee: '7' }, 'journee')).toBe(7);
    expect(pickString({ name: '' }, 'name')).toBeNull();
  });
});

describe('mapClub', () => {
  it('lit une fiche club DOFA', () => {
    const club = mapClub({
      cl_no: '553',
      name: 'AS Exemple',
      logo: 'https://example.org/logo.png',
      ligue: { libelle: 'Occitanie' },
      district: { libelle: 'Haute-Garonne' },
      commune: 'Toulouse',
    });
    expect(club).toMatchObject({
      fff_id: '553',
      name: 'AS Exemple',
      ligue: 'Occitanie',
      district: 'Haute-Garonne',
      city: 'Toulouse',
    });
  });

  it('renvoie null sans nom exploitable', () => {
    expect(mapClub({ cl_no: '1' })).toBeNull();
  });
});

describe('mapTeam', () => {
  it('suffixe le numero d equipe', () => {
    const team = mapTeam({ number: 2, club: { cl_no: '553', name: 'AS Exemple' }, category_label: 'Senior M' });
    expect(team?.name).toBe('AS Exemple 2');
    expect(team?.fff_key).toBe('553-2');
    expect(team?.category).toBe('Senior M');
  });

  it('n ajoute pas de suffixe pour l equipe premiere', () => {
    expect(mapTeam({ number: 1, club: { cl_no: '553', name: 'AS Exemple' } })?.name).toBe('AS Exemple');
  });
});

describe('mapMatch', () => {
  const raw = {
    ma_no: '99001',
    date: '2025-09-14',
    time: '15:00',
    poule_journee: { number: 3 },
    home: { number: 1, club: { cl_no: '1', name: 'AS Domicile' } },
    away: { number: 1, club: { cl_no: '2', name: 'US Exterieur' } },
    home_score: 2,
    away_score: 1,
    competition: { cp_no: '420001', name: 'Regional 1', type: 'CH' },
    poule: { name: 'Poule A' },
    terrain: { name: 'Stade des Sports' },
  };

  it('normalise une rencontre terminee', () => {
    const match = mapMatch(raw, '2025/26');
    expect(match).toMatchObject({
      fff_ma_no: '99001',
      kickoff: '2025-09-14T15:00:00',
      round: 3,
      status: 'finished',
      home_score: 2,
      away_score: 1,
      venue: 'Stade des Sports',
    });
    expect(match?.home?.name).toBe('AS Domicile');
    expect(match?.competition?.name).toBe('Regional 1');
    expect(match?.competition?.poolName).toBe('Poule A');
  });

  it('considere une rencontre sans score comme a venir', () => {
    const match = mapMatch({ ...raw, home_score: null, away_score: null, date: '2099-05-01' }, '2025/26');
    expect(match?.status).toBe('scheduled');
  });

  it('traduit les statuts FFF', () => {
    expect(mapMatch({ ...raw, ma_statut: 'R' }, '2025/26')?.status).toBe('postponed');
    expect(mapMatch({ ...raw, ma_statut: 'F' }, '2025/26')?.status).toBe('forfeit');
  });

  it('renvoie null sans date', () => {
    expect(mapMatch({ ...raw, date: null }, '2025/26')).toBeNull();
  });
});

describe('utilitaires', () => {
  it('normalise date et heure', () => {
    expect(normalizeDate('2025-09-14', '18:30')).toBe('2025-09-14T18:30:00');
    expect(normalizeDate('2025-09-14T20:00:00')).toBe('2025-09-14T20:00:00');
    expect(normalizeDate('2025-09-14')).toBe('2025-09-14T15:00:00');
  });

  it('calcule la saison sportive', () => {
    expect(seasonFromDate(new Date('2025-09-14T00:00:00Z'))).toBe('2025/26');
    expect(seasonFromDate(new Date('2026-03-14T00:00:00Z'))).toBe('2025/26');
  });

  it('extrait les collections Hydra', () => {
    expect(extractMembers({ 'hydra:member': [1, 2] })).toEqual([1, 2]);
    expect(extractMembers([3])).toEqual([3]);
    expect(extractMembers({ items: [4] })).toEqual([4]);
    expect(extractMembers({ nope: 1 })).toEqual([]);
    expect(hasNextPage({ 'hydra:view': { 'hydra:next': '/x?page=2' } })).toBe(true);
    expect(hasNextPage({ 'hydra:view': {} })).toBe(false);
  });
});
