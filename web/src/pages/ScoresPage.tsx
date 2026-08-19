import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DateBar from '../components/DateBar';
import MatchRowItem from '../components/MatchRowItem';
import { useApi } from '../lib/api';
import { formatLongDay, todayIso } from '../lib/format';
import type { MatchGroup, MatchRow } from '../lib/types';

interface MatchesResponse {
  count: number;
  groups: MatchGroup[];
  matches: (MatchRow & { sheets_count?: number })[];
}

interface CalendarResponse {
  days: { date: string; total: number; live: number }[];
}

type Filter = 'all' | 'live' | 'finished' | 'scheduled' | 'sheets';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'live', label: 'En cours' },
  { key: 'finished', label: 'Termines' },
  { key: 'scheduled', label: 'A venir' },
  { key: 'sheets', label: 'Feuilles a saisir' },
];

export default function ScoresPage() {
  const [date, setDate] = useState(todayIso());
  const [filter, setFilter] = useState<Filter>('all');

  const matches = useApi<MatchesResponse>(`/api/matches?date=${date}&limit=400`);
  const calendar = useApi<CalendarResponse>(`/api/matches/calendar?date=${date}`);

  const counts = useMemo(() => {
    const map: Record<string, { total: number; live: number }> = {};
    for (const day of calendar.data?.days ?? []) map[day.date] = { total: day.total, live: day.live };
    return map;
  }, [calendar.data]);

  const groups = useMemo(() => {
    const source = matches.data?.groups ?? [];
    if (filter === 'all') return source;
    return source
      .map((group) => ({
        ...group,
        matches: group.matches.filter((match) => {
          if (filter === 'sheets') {
            return match.status === 'finished' && !(match as any).sheets_count;
          }
          return match.status === filter;
        }),
      }))
      .filter((group) => group.matches.length > 0);
  }, [matches.data, filter]);

  const liveCount = matches.data?.matches.filter((m) => m.status === 'live').length ?? 0;

  return (
    <>
      <DateBar value={date} onChange={setDate} counts={counts} />

      <div className="filters">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            className={`chip${filter === item.key ? ' is-active' : ''}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            {item.key === 'live' && liveCount > 0 ? ` (${liveCount})` : ''}
          </button>
        ))}
      </div>

      <div className="layout-2">
        <div>
          {matches.loading && <div className="empty">Chargement des rencontres...</div>}
          {matches.error && <div className="card"><div className="card__body error">{matches.error}</div></div>}
          {!matches.loading && groups.length === 0 && (
            <div className="card">
              <div className="empty">
                Aucune rencontre pour le {formatLongDay(date)}.
                <div className="hint" style={{ marginTop: 8 }}>
                  Importez des donnees depuis la FFF ou creez une rencontre depuis la page{' '}
                  <Link to="/import" style={{ color: 'var(--accent)' }}>
                    Import FFF
                  </Link>
                  .
                </div>
              </div>
            </div>
          )}

          {groups.map((group) => (
            <div className="card" key={`${group.competition}-${group.pool}`}>
              <div className="competition-head">
                {group.level && <span className="badge badge--accent">{group.level}</span>}
                <span>{group.competition}</span>
                {group.pool && <span className="hint">• {group.pool}</span>}
                <span className="hint" style={{ marginLeft: 'auto' }}>
                  {group.matches.length} rencontre{group.matches.length > 1 ? 's' : ''}
                </span>
              </div>
              {group.matches.map((match) => (
                <MatchRowItem
                  key={match.id}
                  match={match}
                  hasSheet={Boolean((match as any).sheets_count)}
                />
              ))}
            </div>
          ))}
        </div>

        <aside>
          <div className="card">
            <div className="card__title">{formatLongDay(date)}</div>
            <div className="card__body">
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat__value">{matches.data?.count ?? 0}</div>
                  <div className="stat__label">Rencontres</div>
                </div>
                <div className="stat">
                  <div className="stat__value" style={{ color: liveCount ? 'var(--live)' : undefined }}>
                    {liveCount}
                  </div>
                  <div className="stat__label">En direct</div>
                </div>
                <div className="stat">
                  <div className="stat__value">
                    {matches.data?.matches.filter((m) => (m as any).sheets_count).length ?? 0}
                  </div>
                  <div className="stat__label">Feuilles saisies</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__title">Comment ca marche</div>
            <div className="card__body hint">
              <p style={{ marginTop: 0 }}>
                1. Les rencontres et resultats proviennent de l API publique de la FFF (import
                configurable par club ou par poule).
              </p>
              <p>
                2. Ouvrez une rencontre pour retranscrire sa feuille de match : composition,
                remplacements, buteurs, cartons.
              </p>
              <p style={{ marginBottom: 0 }}>
                3. Notez chaque joueur utilise de 0 a 10. Une note est proposee automatiquement a
                partir des evenements du match.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
