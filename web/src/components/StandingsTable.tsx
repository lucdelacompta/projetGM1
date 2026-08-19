import { Link } from 'react-router-dom';
import Crest from './Crest';
import type { StandingRow } from '../lib/types';

interface Props {
  standings: StandingRow[];
  highlight?: number[];
}

/** Classement facon championnat : points, difference de buts, forme recente. */
export default function StandingsTable({ standings, highlight = [] }: Props) {
  if (!standings.length) return <div className="empty">Aucun classement disponible.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th>Equipe</th>
            <th className="num">J</th>
            <th className="num">G</th>
            <th className="num">N</th>
            <th className="num">P</th>
            <th className="num">Bp</th>
            <th className="num">Bc</th>
            <th className="num">Diff</th>
            <th className="num">Pts</th>
            <th>Forme</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => (
            <tr
              key={row.team_id}
              style={highlight.includes(row.team_id) ? { background: 'rgba(47, 208, 122, 0.08)' } : undefined}
            >
              <td className={`rank${index === 0 ? ' rank--up' : index >= standings.length - 2 ? ' rank--down' : ''}`}>
                {index + 1}
              </td>
              <td>
                <Link to={`/equipe/${row.team_id}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Crest name={row.team_name} logo={row.club_logo} />
                  {row.team_name}
                </Link>
              </td>
              <td className="num">{row.played}</td>
              <td className="num">{row.won}</td>
              <td className="num">{row.drawn}</td>
              <td className="num">{row.lost}</td>
              <td className="num">{row.goals_for}</td>
              <td className="num">{row.goals_against}</td>
              <td className="num">{row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}</td>
              <td className="num">
                <strong>{row.points}</strong>
              </td>
              <td>
                <span className="form-dots">
                  {row.form.map((result, position) => (
                    <span key={position} className={`form-dot form-dot--${result}`}>
                      {result === 'W' ? 'V' : result === 'D' ? 'N' : 'D'}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
