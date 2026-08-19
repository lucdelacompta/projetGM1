import { useEffect, useState } from 'react';
import MatchRowItem from '../components/MatchRowItem';
import StandingsTable from '../components/StandingsTable';
import { useApi } from '../lib/api';
import type { MatchRow, StandingRow } from '../lib/types';

interface Competition {
  id: number;
  name: string;
  season: string;
  level: string | null;
  matches_count: number;
}
interface Pool {
  id: number;
  competition_id: number;
  name: string;
  competition_name: string;
}

export default function CompetitionsPage() {
  const catalog = useApi<{ competitions: Competition[]; pools: Pool[] }>('/api/competitions');
  const [poolId, setPoolId] = useState<number | null>(null);
  const [competitionId, setCompetitionId] = useState<number | null>(null);

  useEffect(() => {
    if (!catalog.data) return;
    if (catalog.data.pools.length) setPoolId((current) => current ?? catalog.data!.pools[0]!.id);
    else if (catalog.data.competitions.length) {
      setCompetitionId((current) => current ?? catalog.data!.competitions[0]!.id);
    }
  }, [catalog.data]);

  const query = poolId ? `pool=${poolId}` : competitionId ? `competition=${competitionId}` : null;
  const standings = useApi<{ standings: StandingRow[] }>(query ? `/api/standings?${query}` : null);
  const matches = useApi<{ matches: MatchRow[] }>(
    query ? `/api/matches?${poolId ? `pool=${poolId}` : `competition=${competitionId}`}&from=1900-01-01&limit=500` : null,
  );

  const upcoming = (matches.data?.matches ?? []).filter((match) => match.status === 'scheduled').slice(0, 10);
  const recent = (matches.data?.matches ?? [])
    .filter((match) => match.status === 'finished' || match.status === 'live')
    .slice(-10)
    .reverse();

  return (
    <div className="layout-2">
      <div>
        <div className="card">
          <div className="card__title">Classement</div>
          <div className="card__body card__body--flush">
            {standings.loading ? (
              <div className="empty">Chargement...</div>
            ) : (
              <StandingsTable standings={standings.data?.standings ?? []} />
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__title">Derniers resultats</div>
          <div className="card__body card__body--flush">
            {recent.length ? (
              recent.map((match) => <MatchRowItem key={match.id} match={match} showDate />)
            ) : (
              <div className="empty">Aucun resultat.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__title">Prochaines rencontres</div>
          <div className="card__body card__body--flush">
            {upcoming.length ? (
              upcoming.map((match) => <MatchRowItem key={match.id} match={match} showDate />)
            ) : (
              <div className="empty">Aucune rencontre programmee.</div>
            )}
          </div>
        </div>
      </div>

      <aside>
        <div className="card">
          <div className="card__title">Competitions</div>
          <div className="card__body">
            {catalog.data?.competitions.map((competition) => (
              <div key={competition.id} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700 }}>
                  {competition.level && <span className="badge badge--accent">{competition.level}</span>}{' '}
                  {competition.name}
                </div>
                <div className="hint">
                  Saison {competition.season} • {competition.matches_count} rencontres
                </div>
                <div className="btn-row" style={{ marginTop: 6 }}>
                  {catalog.data!.pools
                    .filter((pool) => pool.competition_id === competition.id)
                    .map((pool) => (
                      <button
                        key={pool.id}
                        className={`chip${poolId === pool.id ? ' is-active' : ''}`}
                        onClick={() => {
                          setPoolId(pool.id);
                          setCompetitionId(null);
                        }}
                      >
                        {pool.name}
                      </button>
                    ))}
                  <button
                    className={`chip${competitionId === competition.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setCompetitionId(competition.id);
                      setPoolId(null);
                    }}
                  >
                    Toutes poules
                  </button>
                </div>
              </div>
            ))}
            {!catalog.data?.competitions.length && (
              <div className="hint">Aucune competition. Lancez un import depuis la page Import FFF.</div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
