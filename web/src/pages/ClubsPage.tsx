import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Crest from '../components/Crest';
import { useApi } from '../lib/api';

interface Club {
  id: number;
  name: string;
  logo_url: string | null;
  ligue: string | null;
  district: string | null;
  city: string | null;
  teams_count: number;
}

interface ClubDetail {
  club: Club;
  teams: { id: number; name: string; category: string | null; level: string | null }[];
  squad: { id: number; first_name: string; last_name: string; position: string | null }[];
}

export default function ClubsPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const clubs = useApi<{ clubs: Club[] }>(`/api/clubs${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  const selectedId = params.get('club');
  const detail = useApi<ClubDetail>(selectedId ? `/api/clubs/${selectedId}` : null);

  return (
    <div className="layout-2">
      <div className="card">
        <div className="card__title">
          <span>Clubs suivis</span>
          <input
            value={query}
            placeholder="Filtrer..."
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 160 }}
          />
        </div>
        <div className="card__body card__body--flush">
          <table className="table">
            <thead>
              <tr>
                <th>Club</th>
                <th>Ligue</th>
                <th>District</th>
                <th className="num">Equipes</th>
              </tr>
            </thead>
            <tbody>
              {(clubs.data?.clubs ?? []).map((club) => (
                <tr key={club.id} style={{ cursor: 'pointer' }} onClick={() => setParams({ club: String(club.id) })}>
                  <td>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Crest name={club.name} logo={club.logo_url} />
                      {club.name}
                      {club.city && <span className="hint">{club.city}</span>}
                    </span>
                  </td>
                  <td className="hint">{club.ligue ?? '—'}</td>
                  <td className="hint">{club.district ?? '—'}</td>
                  <td className="num">{club.teams_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!clubs.loading && !clubs.data?.clubs.length && <div className="empty">Aucun club enregistre.</div>}
        </div>
      </div>

      <aside>
        {detail.data ? (
          <div className="card">
            <div className="card__title">{detail.data.club.name}</div>
            <div className="card__body">
              <div className="hint" style={{ marginBottom: 10 }}>
                {[detail.data.club.city, detail.data.club.district, detail.data.club.ligue]
                  .filter(Boolean)
                  .join(' • ')}
              </div>
              <div className="lineups__sub">Equipes</div>
              {detail.data.teams.map((team) => (
                <div key={team.id} style={{ padding: '4px 0' }}>
                  <Link to={`/equipe/${team.id}`}>{team.name}</Link>{' '}
                  <span className="hint">{[team.category, team.level].filter(Boolean).join(' • ')}</span>
                </div>
              ))}
              <div className="lineups__sub">Effectif ({detail.data.squad.length})</div>
              {detail.data.squad.slice(0, 30).map((player) => (
                <div key={player.id} style={{ padding: '2px 0' }}>
                  <Link to={`/joueur/${player.id}`}>
                    {player.last_name} <span className="hint">{player.first_name}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card__body hint">Selectionnez un club pour voir ses equipes et son effectif.</div>
          </div>
        )}
      </aside>
    </div>
  );
}
