import { useState } from 'react';
import { Link } from 'react-router-dom';
import UsageTable from '../components/UsageTable';
import { useApi } from '../lib/api';
import { ratingClass } from '../lib/format';
import type { PlayerUsage } from '../lib/types';

interface Leaderboards {
  top_ratings: PlayerUsage[];
  top_scorers: PlayerUsage[];
  most_used: PlayerUsage[];
}

type Tab = 'notes' | 'buteurs' | 'temps';

export default function RankingsPage() {
  const [minMatches, setMinMatches] = useState(3);
  const [tab, setTab] = useState<Tab>('notes');
  const request = useApi<Leaderboards>(`/api/leaderboards?min=${minMatches}`);

  const data = request.data;

  return (
    <>
      <div className="card">
        <div className="card__title">
          <span>Classements individuels</span>
          <span className="btn-row">
            <label className="hint" htmlFor="min-matches">
              Minimum de matchs
            </label>
            <input
              id="min-matches"
              type="number"
              min={1}
              max={30}
              value={minMatches}
              style={{ width: 70 }}
              onChange={(event) => setMinMatches(Number(event.target.value) || 1)}
            />
          </span>
        </div>
        <div className="tabs">
          <button className={tab === 'notes' ? 'is-active' : undefined} onClick={() => setTab('notes')}>
            Meilleures moyennes
          </button>
          <button className={tab === 'buteurs' ? 'is-active' : undefined} onClick={() => setTab('buteurs')}>
            Buteurs
          </button>
          <button className={tab === 'temps' ? 'is-active' : undefined} onClick={() => setTab('temps')}>
            Temps de jeu
          </button>
        </div>
        <div className="card__body card__body--flush">
          {request.loading && <div className="empty">Chargement...</div>}
          {tab === 'notes' && data && (
            <table className="table">
              <thead>
                <tr>
                  <th className="rank">#</th>
                  <th>Joueur</th>
                  <th className="num">Matchs</th>
                  <th className="num">Minutes</th>
                  <th className="num">Note moyenne</th>
                </tr>
              </thead>
              <tbody>
                {data.top_ratings.map((row, index) => (
                  <tr key={row.player_id}>
                    <td className="rank">{index + 1}</td>
                    <td>
                      <Link to={`/joueur/${row.player_id}`}>
                        {row.last_name} <span className="hint">{row.first_name}</span>
                      </Link>
                    </td>
                    <td className="num">{row.appearances}</td>
                    <td className="num">{row.minutes}</td>
                    <td className="num">
                      <span className={ratingClass(row.average_rating)}>{row.average_rating?.toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'buteurs' && data && <UsageTable usage={data.top_scorers} />}
          {tab === 'temps' && data && <UsageTable usage={data.most_used} />}
          {data && !data.top_ratings.length && tab === 'notes' && (
            <div className="empty">Pas encore assez de notes attribuees.</div>
          )}
        </div>
      </div>
    </>
  );
}
