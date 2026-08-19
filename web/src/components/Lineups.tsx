import { Link } from 'react-router-dom';
import Crest from './Crest';
import { POSITION_SHORT, playerName, ratingClass } from '../lib/format';
import type { Appearance, MatchDetail, MatchEventRow, SheetSideData } from '../lib/types';

interface Props {
  detail: MatchDetail;
  onSelect?: (appearance: Appearance) => void;
}

/** Compositions des deux equipes, avec temps de jeu, faits de jeu et notes. */
export default function Lineups({ detail, onSelect }: Props) {
  return (
    <div className="lineups">
      <SideColumn
        title={detail.match.home_team_name}
        logo={detail.match.home_logo}
        data={detail.home}
        events={detail.events}
        onSelect={onSelect}
      />
      <SideColumn
        title={detail.match.away_team_name}
        logo={detail.match.away_logo}
        data={detail.away}
        events={detail.events}
        onSelect={onSelect}
      />
    </div>
  );
}

function SideColumn({
  title,
  logo,
  data,
  events,
  onSelect,
}: {
  title: string;
  logo: string | null;
  data: SheetSideData;
  events: MatchEventRow[];
  onSelect?: (appearance: Appearance) => void;
}) {
  if (!data.sheet) {
    return (
      <div className="lineups__col">
        <div className="lineups__head">
          <Crest name={title} logo={logo} />
          {title}
        </div>
        <div className="empty">Feuille de match non retranscrite.</div>
      </div>
    );
  }

  return (
    <div className="lineups__col">
      <div className="lineups__head">
        <Crest name={title} logo={logo} />
        <span>{title}</span>
        {data.sheet.formation && <span className="badge badge--accent">{data.sheet.formation}</span>}
        {data.sheet.status === 'validated' && <span className="badge badge--finished">Validee</span>}
      </div>
      {data.sheet.coach && <div className="hint">Entraineur : {data.sheet.coach}</div>}

      <div className="lineups__sub">Titulaires ({data.starters.length})</div>
      {data.starters.map((player) => (
        <PlayerLine key={player.id} appearance={player} events={events} onSelect={onSelect} />
      ))}

      {data.substitutes.length > 0 && (
        <>
          <div className="lineups__sub">Entres en jeu ({data.substitutes.length})</div>
          {data.substitutes.map((player) => (
            <PlayerLine key={player.id} appearance={player} events={events} onSelect={onSelect} />
          ))}
        </>
      )}

      {data.unused.length > 0 && (
        <>
          <div className="lineups__sub">Remplacants non utilises ({data.unused.length})</div>
          {data.unused.map((player) => (
            <PlayerLine key={player.id} appearance={player} events={events} onSelect={onSelect} />
          ))}
        </>
      )}
    </div>
  );
}

function PlayerLine({
  appearance,
  events,
  onSelect,
}: {
  appearance: Appearance;
  events: MatchEventRow[];
  onSelect?: (appearance: Appearance) => void;
}) {
  const own = events.filter((event) => event.player_id === appearance.player_id);
  const goals = own.filter((e) => e.type === 'goal' || e.type === 'penalty_goal').length;
  const yellow = own.some((e) => e.type === 'yellow');
  const red = own.some((e) => e.type === 'red' || e.type === 'second_yellow');
  const assists = events.filter(
    (event) =>
      event.related_player_id === appearance.player_id &&
      (event.type === 'goal' || event.type === 'penalty_goal'),
  ).length;
  const position = appearance.position ?? appearance.player_position;
  const note = appearance.rating ?? appearance.auto_rating;

  return (
    <div className="player-line">
      <span className="player-line__num">{appearance.shirt_number ?? '-'}</span>
      <span className="player-line__name">
        <Link to={`/joueur/${appearance.player_id}`}>{playerName(appearance)}</Link>
        {position && <span className="player-line__pos">{POSITION_SHORT[position]}</span>}
        {appearance.captain === 1 && <span className="captain">C</span>}
      </span>
      <span className="player-line__events">
        {goals > 0 && <span title={`${goals} but(s)`}>{'⚽'.repeat(Math.min(goals, 3))}</span>}
        {assists > 0 && <span title={`${assists} passe(s) decisive(s)`}>🅰{assists > 1 ? assists : ''}</span>}
        {yellow && <span title="Carton jaune">🟨</span>}
        {red && <span title="Carton rouge">🟥</span>}
        {appearance.role === 'sub' && appearance.minute_in != null && (
          <span title="Entre en jeu">▲{appearance.minute_in}'</span>
        )}
        {appearance.minute_out != null && <span title="Sorti">▼{appearance.minute_out}'</span>}
        {appearance.role === 'unused' && <span className="hint">non entre</span>}
      </span>
      <button
        type="button"
        className={`${ratingClass(note)}${appearance.rating == null && note != null ? ' rating--auto' : ''}`}
        title={
          appearance.rating != null
            ? 'Note attribuee'
            : note != null
              ? 'Note proposee par le bareme (non validee)'
              : 'Pas encore note'
        }
        onClick={() => onSelect?.(appearance)}
        style={{ border: 0, cursor: onSelect ? 'pointer' : 'default' }}
      >
        {note != null ? note.toFixed(1) : '—'}
      </button>
    </div>
  );
}
