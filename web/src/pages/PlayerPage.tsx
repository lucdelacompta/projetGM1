import { Link, useParams } from 'react-router-dom';
import { useApi } from '../lib/api';
import { POSITION_LABEL, formatDay, ratingClass } from '../lib/format';
import type { PlayerPosition } from '../lib/types';

interface PlayerResponse {
  player: {
    id: number;
    first_name: string;
    last_name: string;
    position: PlayerPosition | null;
    shirt_number: number | null;
    birth_date: string | null;
    club_name: string | null;
    club_id: number | null;
  };
  matches: {
    id: number;
    match_id: number;
    kickoff: string;
    role: string;
    minute_in: number | null;
    minute_out: number | null;
    rating: number | null;
    auto_rating: number | null;
    comment: string | null;
    home_team_name: string;
    away_team_name: string;
    home_score: number | null;
    away_score: number | null;
    competition_name: string | null;
  }[];
  stats: {
    appearances: number;
    starts: number;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    average_rating: number | null;
  };
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const request = useApi<PlayerResponse>(`/api/players/${id}`);

  if (request.loading) return <div className="empty">Chargement de la fiche joueur...</div>;
  if (request.error) return <div className="card"><div className="card__body error">{request.error}</div></div>;
  if (!request.data) return null;

  const { player, matches, stats } = request.data;

  return (
    <>
      <div className="card">
        <div className="card__body" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>
              {player.first_name} {player.last_name}
            </h1>
            <div className="hint">
              {[player.position ? POSITION_LABEL[player.position] : null, player.club_name, player.shirt_number ? `N°${player.shirt_number}` : null]
                .filter(Boolean)
                .join(' • ')}
            </div>
          </div>
          <div className="stat-grid" style={{ marginLeft: 'auto', minWidth: 420 }}>
            <div className="stat">
              <div className="stat__value">{stats.appearances}</div>
              <div className="stat__label">Matchs</div>
            </div>
            <div className="stat">
              <div className="stat__value">{stats.starts}</div>
              <div className="stat__label">Titularisations</div>
            </div>
            <div className="stat">
              <div className="stat__value">{stats.goals}</div>
              <div className="stat__label">Buts</div>
            </div>
            <div className="stat">
              <div className="stat__value">{stats.assists}</div>
              <div className="stat__label">Passes D.</div>
            </div>
            <div className="stat">
              <div className="stat__value">
                <span className={ratingClass(stats.average_rating)}>
                  {stats.average_rating != null ? stats.average_rating.toFixed(2) : '—'}
                </span>
              </div>
              <div className="stat__label">Note moyenne</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__title">Historique des notes</div>
        <div className="card__body card__body--flush">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rencontre</th>
                <th>Competition</th>
                <th>Role</th>
                <th className="num">Note</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((row) => (
                <tr key={row.id}>
                  <td className="hint">{formatDay(row.kickoff)}</td>
                  <td>
                    <Link to={`/match/${row.match_id}`}>
                      {row.home_team_name} {row.home_score ?? '-'} - {row.away_score ?? '-'} {row.away_team_name}
                    </Link>
                  </td>
                  <td className="hint">{row.competition_name ?? '—'}</td>
                  <td className="hint">
                    {row.role === 'starter' ? 'Titulaire' : row.role === 'sub' ? `Entre ${row.minute_in ?? '?'}'` : 'Non entre'}
                  </td>
                  <td className="num">
                    <span className={`${ratingClass(row.rating ?? row.auto_rating)}${row.rating == null ? ' rating--auto' : ''}`}>
                      {(row.rating ?? row.auto_rating)?.toFixed(1) ?? '—'}
                    </span>
                  </td>
                  <td className="hint">{row.comment ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!matches.length && <div className="empty">Ce joueur n apparait sur aucune feuille de match.</div>}
        </div>
      </div>
    </>
  );
}
