import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Crest from '../components/Crest';
import Timeline from '../components/Timeline';
import Lineups from '../components/Lineups';
import SheetEditor from '../components/SheetEditor';
import EventEditor from '../components/EventEditor';
import RatingInput from '../components/RatingInput';
import StandingsTable from '../components/StandingsTable';
import { apiFetch, useApi } from '../lib/api';
import { STATUS_LABEL, formatLongDay, formatTime, playerName, ratingClass } from '../lib/format';
import type { Appearance, MatchDetail, StandingRow } from '../lib/types';

type Tab = 'resume' | 'feuille' | 'notes' | 'classement';

const TABS: { key: Tab; label: string }[] = [
  { key: 'resume', label: 'Resume' },
  { key: 'feuille', label: 'Feuille de match' },
  { key: 'notes', label: 'Notes des joueurs' },
  { key: 'classement', label: 'Classement' },
];

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const request = useApi<MatchDetail>(`/api/matches/${id}`);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [tab, setTab] = useState<Tab>('resume');

  useEffect(() => {
    if (request.data) setDetail(request.data);
  }, [request.data]);

  if (request.loading && !detail) return <div className="empty">Chargement de la rencontre...</div>;
  if (request.error) return <div className="card"><div className="card__body error">{request.error}</div></div>;
  if (!detail) return null;

  const match = detail.match;
  const played = match.home_score != null && match.away_score != null;

  return (
    <>
      <div className="card">
        <div className="competition-head">
          {match.competition_level && <span className="badge badge--accent">{match.competition_level}</span>}
          <span>{match.competition_name ?? 'Rencontre amicale'}</span>
          {match.pool_name && <span className="hint">• {match.pool_name}</span>}
          {match.round && <span className="hint">• Journee {match.round}</span>}
        </div>

        <div className="scoreboard">
          <div className="scoreboard__meta">
            {formatLongDay(match.kickoff)} • {formatTime(match.kickoff)}
            {match.venue ? ` • ${match.venue}` : ''}
            {match.referee ? ` • Arbitre : ${match.referee}` : ''}
          </div>
          <div className="scoreboard__grid">
            <div className="scoreboard__team">
              <Crest name={match.home_team_name} logo={match.home_logo} size="lg" />
              <Link to={`/equipe/${match.home_team_id}`}>
                <strong>{match.home_team_name}</strong>
              </Link>
            </div>
            <div>
              <div className="scoreboard__score">
                {played ? `${match.home_score} - ${match.away_score}` : 'vs'}
              </div>
              <div className="scoreboard__status">
                {match.status === 'live' ? (
                  <span className="badge badge--live pulse">EN COURS</span>
                ) : (
                  STATUS_LABEL[match.status]
                )}
              </div>
            </div>
            <div className="scoreboard__team">
              <Crest name={match.away_team_name} logo={match.away_logo} size="lg" />
              <Link to={`/equipe/${match.away_team_id}`}>
                <strong>{match.away_team_name}</strong>
              </Link>
            </div>
          </div>

          {detail.man_of_the_match && (
            <div style={{ marginTop: 14 }}>
              <span className="badge badge--accent">Homme du match</span>{' '}
              <Link to={`/joueur/${detail.man_of_the_match.player_id}`}>
                {playerName(detail.man_of_the_match)}
              </Link>{' '}
              <span className={ratingClass(detail.man_of_the_match.rating ?? detail.man_of_the_match.auto_rating)}>
                {(detail.man_of_the_match.rating ?? detail.man_of_the_match.auto_rating)?.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        <div className="tabs">
          {TABS.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? 'is-active' : undefined}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'resume' && <ResumeTab detail={detail} onChange={setDetail} />}
      {tab === 'feuille' && <FeuilleTab detail={detail} onChange={setDetail} />}
      {tab === 'notes' && <NotesTab detail={detail} onChange={setDetail} reload={request.reload} />}
      {tab === 'classement' && <ClassementTab detail={detail} />}
    </>
  );
}

function ResumeTab({ detail, onChange }: { detail: MatchDetail; onChange: (detail: MatchDetail) => void }) {
  const remove = async (eventId: number) => {
    const result = await apiFetch<{ detail: MatchDetail }>(
      `/api/matches/${detail.match.id}/events/${eventId}`,
      { method: 'DELETE' },
    );
    onChange(result.detail);
  };

  return (
    <div className="layout-2">
      <div>
        <div className="card">
          <div className="card__title">Faits de jeu</div>
          <div className="card__body card__body--flush">
            <Timeline match={detail.match} events={detail.events} onDelete={remove} />
          </div>
        </div>
        <div className="card">
          <div className="card__title">Compositions</div>
          <div className="card__body card__body--flush">
            <Lineups detail={detail} />
          </div>
        </div>
      </div>
      <aside>
        <div className="card">
          <div className="card__title">Ajouter un fait de jeu</div>
          <EventEditor detail={detail} onChange={onChange} />
        </div>
        <ScoreEditor detail={detail} onChange={onChange} />
      </aside>
    </div>
  );
}

function ScoreEditor({ detail, onChange }: { detail: MatchDetail; onChange: (detail: MatchDetail) => void }) {
  const [home, setHome] = useState(detail.match.home_score?.toString() ?? '');
  const [away, setAway] = useState(detail.match.away_score?.toString() ?? '');
  const [status, setStatus] = useState(detail.match.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/matches/${detail.match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          home_score: home === '' ? null : Number(home),
          away_score: away === '' ? null : Number(away),
          status,
        }),
      });
      const fresh = await apiFetch<MatchDetail>(`/api/matches/${detail.match.id}`);
      onChange(fresh);
      setMessage('Score mis a jour.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card__title">Score et statut</div>
      <div className="card__body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label htmlFor="score-home">{detail.match.home_team_name}</label>
            <input id="score-home" type="number" min={0} value={home} onChange={(e) => setHome(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="score-away">{detail.match.away_team_name}</label>
            <input id="score-away" type="number" min={0} value={away} onChange={(e) => setAway(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="score-status">Statut</label>
          <select id="score-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="scheduled">A venir</option>
            <option value="live">En cours</option>
            <option value="finished">Termine</option>
            <option value="postponed">Reporte</option>
            <option value="forfeit">Forfait</option>
            <option value="cancelled">Annule</option>
          </select>
        </div>
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          Enregistrer
        </button>
        {message && <div className="hint" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  );
}

function FeuilleTab({ detail, onChange }: { detail: MatchDetail; onChange: (detail: MatchDetail) => void }) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const teamId = side === 'home' ? detail.match.home_team_id : detail.match.away_team_id;
  const teamName = side === 'home' ? detail.match.home_team_name : detail.match.away_team_name;

  return (
    <div className="card">
      <div className="card__title">
        <span>Retranscription de la feuille de match</span>
        <span className="btn-row">
          <button
            className={`chip${side === 'home' ? ' is-active' : ''}`}
            onClick={() => setSide('home')}
          >
            {detail.match.home_team_name}
          </button>
          <button
            className={`chip${side === 'away' ? ' is-active' : ''}`}
            onClick={() => setSide('away')}
          >
            {detail.match.away_team_name}
          </button>
        </span>
      </div>
      <SheetEditor
        key={side}
        matchId={detail.match.id}
        side={side}
        teamId={teamId}
        teamName={teamName}
        data={side === 'home' ? detail.home : detail.away}
        onSaved={onChange}
      />
    </div>
  );
}

function NotesTab({
  detail,
  onChange,
  reload,
}: {
  detail: MatchDetail;
  onChange: (detail: MatchDetail) => void;
  reload: () => void;
}) {
  const [selected, setSelected] = useState<Appearance | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const players = useMemo(
    () =>
      [...detail.home.starters, ...detail.home.substitutes, ...detail.home.unused,
       ...detail.away.starters, ...detail.away.substitutes, ...detail.away.unused],
    [detail],
  );
  const rated = players.filter((player) => player.rating != null).length;
  const used = players.filter((player) => player.role !== 'unused');

  const setRating = async (appearance: Appearance, rating: number | null) => {
    setBusy(true);
    try {
      await apiFetch(`/api/appearances/${appearance.id}/rating`, {
        method: 'PUT',
        body: JSON.stringify({ rating, comment: comment || null }),
      });
      const fresh = await apiFetch<MatchDetail>(`/api/matches/${detail.match.id}`);
      onChange(fresh);
      setSelected(
        [...fresh.home.starters, ...fresh.home.substitutes, ...fresh.home.unused,
         ...fresh.away.starters, ...fresh.away.substitutes, ...fresh.away.unused]
          .find((row) => row.id === appearance.id) ?? null,
      );
    } finally {
      setBusy(false);
    }
  };

  const applyAuto = async () => {
    setBusy(true);
    try {
      const result = await apiFetch<{ detail: MatchDetail; applied: number }>(
        `/api/matches/${detail.match.id}/ratings/auto`,
        { method: 'POST' },
      );
      onChange(result.detail);
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (!used.length) {
    return (
      <div className="card">
        <div className="empty">
          Aucun joueur utilise n est enregistre. Retranscrivez d abord la feuille de match.
        </div>
      </div>
    );
  }

  return (
    <div className="layout-2">
      <div className="card">
        <div className="card__title">
          <span>Joueurs utilises ({used.length})</span>
          <span className="hint">{rated} note(s) attribuee(s)</span>
        </div>
        <div className="card__body card__body--flush">
          <Lineups detail={detail} onSelect={(appearance) => {
            setSelected(appearance);
            setComment(appearance.comment ?? '');
          }} />
        </div>
      </div>

      <aside>
        <div className="card">
          <div className="card__title">Notation</div>
          <div className="card__body">
            {selected ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <strong>{playerName(selected)}</strong>{' '}
                  <span className="hint">
                    {selected.minutes} min • {selected.role === 'starter' ? 'titulaire' : selected.role === 'sub' ? 'entre en jeu' : 'non entre'}
                  </span>
                </div>
                <RatingInput
                  value={selected.rating}
                  suggestion={selected.auto_rating}
                  disabled={busy}
                  onChange={(value) => setRating(selected, value)}
                />
                <div className="field" style={{ marginTop: 10 }}>
                  <label htmlFor="rating-comment">Commentaire</label>
                  <textarea
                    id="rating-comment"
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Match plein, tres actif sur son cote..."
                  />
                </div>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => setRating(selected, selected.rating)}
                >
                  Enregistrer le commentaire
                </button>
              </>
            ) : (
              <div className="hint">
                Cliquez sur la pastille de note d un joueur pour lui attribuer une note de 0 a 10.
                Les notes en italique sont celles proposees par le bareme automatique.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__title">Bareme automatique</div>
          <div className="card__body">
            <p className="hint" style={{ marginTop: 0 }}>
              Base 5,5 ajustee par le resultat, les buts, les passes decisives, les cartons, les clean
              sheets et le temps de jeu.
            </p>
            <button className="btn btn--primary" onClick={applyAuto} disabled={busy}>
              Appliquer aux joueurs non notes
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ClassementTab({ detail }: { detail: MatchDetail }) {
  const poolId = detail.match.pool_id;
  const competitionId = detail.match.competition_id;
  const query = poolId ? `pool=${poolId}` : competitionId ? `competition=${competitionId}` : null;
  const standings = useApi<{ standings: StandingRow[] }>(query ? `/api/standings?${query}` : null);

  if (!query) return <div className="card"><div className="empty">Rencontre hors championnat.</div></div>;
  if (standings.loading) return <div className="empty">Chargement du classement...</div>;

  return (
    <div className="card">
      <div className="card__title">
        {detail.match.competition_name} {detail.match.pool_name ? `• ${detail.match.pool_name}` : ''}
      </div>
      <div className="card__body card__body--flush">
        <StandingsTable
          standings={standings.data?.standings ?? []}
          highlight={[detail.match.home_team_id, detail.match.away_team_id]}
        />
      </div>
    </div>
  );
}
