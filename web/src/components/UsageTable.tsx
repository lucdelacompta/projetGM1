import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { POSITION_SHORT, ratingClass } from '../lib/format';
import type { PlayerUsage } from '../lib/types';

type SortKey = 'minutes' | 'appearances' | 'goals' | 'assists' | 'average_rating' | 'name';

const COLUMNS: { key: SortKey; label: string; title: string; num?: boolean }[] = [
  { key: 'name', label: 'Joueur', title: 'Nom du joueur' },
  { key: 'appearances', label: 'M', title: 'Matchs joues', num: true },
  { key: 'minutes', label: 'Min', title: 'Minutes jouees', num: true },
  { key: 'goals', label: 'B', title: 'Buts', num: true },
  { key: 'assists', label: 'PD', title: 'Passes decisives', num: true },
  { key: 'average_rating', label: 'Moy.', title: 'Note moyenne ponderee par le temps de jeu', num: true },
];

interface Props {
  usage: PlayerUsage[];
  emptyLabel?: string;
}

const share = (value: number, max: number) => (max > 0 ? Math.round((value / max) * 100) : 0);

/** Liste des joueurs utilises : temps de jeu, statistiques et note moyenne. */
export default function UsageTable({ usage, emptyLabel }: Props) {
  const [sort, setSort] = useState<SortKey>('minutes');
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const copy = [...usage];
    copy.sort((a, b) => {
      if (sort === 'name') return `${a.last_name}`.localeCompare(`${b.last_name}`, 'fr');
      const left = (a[sort] as number | null) ?? -1;
      const right = (b[sort] as number | null) ?? -1;
      return right - left;
    });
    return asc ? copy.reverse() : copy;
  }, [usage, sort, asc]);

  if (!usage.length) {
    return <div className="empty">{emptyLabel ?? 'Aucun joueur utilise pour le moment.'}</div>;
  }

  const maxMinutes = usage.reduce((acc, row) => Math.max(acc, row.minutes), 0);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th className="rank">#</th>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={`sortable${column.num ? ' num' : ''}`}
                title={column.title}
                onClick={() => {
                  if (sort === column.key) setAsc((value) => !value);
                  else {
                    setSort(column.key);
                    setAsc(false);
                  }
                }}
              >
                {column.label}
                {sort === column.key ? (asc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th className="num" title="Cartons jaunes / rouges">
              Cartons
            </th>
            <th title="5 dernieres notes">Forme</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.player_id}>
              <td className="rank">{index + 1}</td>
              <td>
                <Link to={`/joueur/${row.player_id}`}>
                  {row.last_name} <span className="hint">{row.first_name}</span>
                </Link>
                {row.position && <span className="player-line__pos" style={{ marginLeft: 6 }}>{POSITION_SHORT[row.position]}</span>}
                {row.benched_unused > 0 && (
                  <span className="hint" title="Fois sur le banc sans entrer en jeu">
                    {' '}
                    • {row.benched_unused} sur le banc
                  </span>
                )}
              </td>
              <td className="num">
                {row.appearances}
                <span className="hint"> ({row.starts} tit.)</span>
              </td>
              <td className="num" title={`${share(row.minutes, maxMinutes)} % du temps de jeu du joueur le plus utilise`}>
                {row.minutes}
              </td>
              <td className="num">{row.goals}</td>
              <td className="num">{row.assists}</td>
              <td className="num">
                <span className={ratingClass(row.average_rating)}>
                  {row.average_rating != null ? row.average_rating.toFixed(2) : '—'}
                </span>
              </td>
              <td className="num">
                {row.yellow > 0 && <span title="Cartons jaunes">🟨{row.yellow}</span>}{' '}
                {row.red > 0 && <span title="Cartons rouges">🟥{row.red}</span>}
                {row.yellow === 0 && row.red === 0 && <span className="hint">—</span>}
              </td>
              <td>
                <span className="spark" title={row.last_ratings.join(' / ')}>
                  {row.last_ratings.map((note, position) => (
                    <span
                      key={position}
                      className="spark__bar"
                      style={{ height: `${Math.max(3, (note / 10) * 24)}px`, background: note >= 6.5 ? 'var(--accent)' : note >= 5 ? '#7a8797' : 'var(--red)' }}
                    />
                  ))}
                  {row.last_ratings.length === 0 && <span className="hint">—</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
