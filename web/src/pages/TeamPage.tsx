import { useState } from 'react';
import { useParams } from 'react-router-dom';
import Crest from '../components/Crest';
import MatchRowItem from '../components/MatchRowItem';
import UsageTable from '../components/UsageTable';
import { useApi } from '../lib/api';
import type { MatchRow, PlayerUsage } from '../lib/types';

interface TeamResponse {
  team: {
    id: number;
    name: string;
    club_id: number;
    club_name: string;
    logo_url: string | null;
    category: string | null;
    level: string | null;
    ligue: string | null;
    district: string | null;
    city: string | null;
  };
  matches: (MatchRow & { sheets_count?: number })[];
  usage: PlayerUsage[];
  squad: { id: number; first_name: string; last_name: string; position: string | null }[];
}

type Tab = 'calendrier' | 'joueurs' | 'effectif';

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const request = useApi<TeamResponse>(`/api/teams/${id}`);
  const [tab, setTab] = useState<Tab>('calendrier');

  if (request.loading) return <div className="empty">Chargement de l equipe...</div>;
  if (request.error) return <div className="card"><div className="card__body error">{request.error}</div></div>;
  if (!request.data) return null;

  const { team, matches, usage } = request.data;
  const played = matches.filter((match) => match.status === 'finished');
  const upcoming = matches.filter((match) => match.status !== 'finished');
  const totalMinutes = usage.reduce((acc, row) => acc + row.minutes, 0);

  return (
    <>
      <div className="card">
        <div className="card__body" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Crest name={team.name} logo={team.logo_url} size="lg" />
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>{team.name}</h1>
            <div className="hint">
              {[team.category, team.level, team.ligue, team.district, team.city].filter(Boolean).join(' • ')}
            </div>
          </div>
          <div className="stat-grid" style={{ marginLeft: 'auto', minWidth: 320 }}>
            <div className="stat">
              <div className="stat__value">{played.length}</div>
              <div className="stat__label">Matchs joues</div>
            </div>
            <div className="stat">
              <div className="stat__value">{usage.length}</div>
              <div className="stat__label">Joueurs utilises</div>
            </div>
            <div className="stat">
              <div className="stat__value">{Math.round(totalMinutes / 90)}</div>
              <div className="stat__label">Matchs-joueurs</div>
            </div>
          </div>
        </div>
        <div className="tabs">
          <button className={tab === 'calendrier' ? 'is-active' : undefined} onClick={() => setTab('calendrier')}>
            Calendrier et resultats
          </button>
          <button className={tab === 'joueurs' ? 'is-active' : undefined} onClick={() => setTab('joueurs')}>
            Joueurs utilises
          </button>
          <button className={tab === 'effectif' ? 'is-active' : undefined} onClick={() => setTab('effectif')}>
            Effectif
          </button>
        </div>
      </div>

      {tab === 'calendrier' && (
        <>
          <div className="card">
            <div className="card__title">Resultats</div>
            <div className="card__body card__body--flush">
              {played.length ? (
                [...played].reverse().map((match) => (
                  <MatchRowItem key={match.id} match={match} showDate hasSheet={Boolean(match.sheets_count)} />
                ))
              ) : (
                <div className="empty">Aucun resultat enregistre.</div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card__title">A venir</div>
            <div className="card__body card__body--flush">
              {upcoming.length ? (
                upcoming.map((match) => <MatchRowItem key={match.id} match={match} showDate />)
              ) : (
                <div className="empty">Aucune rencontre programmee.</div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'joueurs' && (
        <div className="card">
          <div className="card__title">
            <span>Joueurs utilises</span>
            <span className="hint">Agrege depuis les feuilles de match retranscrites</span>
          </div>
          <div className="card__body card__body--flush">
            <UsageTable
              usage={usage}
              emptyLabel="Aucune feuille de match retranscrite pour cette equipe."
            />
          </div>
        </div>
      )}

      {tab === 'effectif' && (
        <div className="card">
          <div className="card__title">Effectif du club ({request.data.squad.length})</div>
          <div className="card__body">
            {request.data.squad.map((player) => (
              <div key={player.id} style={{ padding: '3px 0' }}>
                {player.last_name} <span className="hint">{player.first_name} {player.position ?? ''}</span>
              </div>
            ))}
            {!request.data.squad.length && <div className="hint">Aucun joueur enregistre.</div>}
          </div>
        </div>
      )}
    </>
  );
}
