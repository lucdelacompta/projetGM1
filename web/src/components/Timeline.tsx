import { EVENT_ICON, EVENT_LABEL, playerName } from '../lib/format';
import type { MatchEventRow, MatchRow } from '../lib/types';

interface Props {
  match: MatchRow;
  events: MatchEventRow[];
  onDelete?: (eventId: number) => void;
}

/** Fil chronologique des faits de jeu, cote domicile a gauche. */
export default function Timeline({ match, events, onDelete }: Props) {
  if (!events.length) {
    return <div className="empty">Aucun fait de jeu saisi pour cette rencontre.</div>;
  }
  return (
    <div className="timeline">
      {events.map((event) => {
        const isHome = event.team_id === match.home_team_id;
        const cell = (
          <div className={`timeline__cell${isHome ? '' : ' timeline__cell--away'}`}>
            <span title={EVENT_LABEL[event.type] ?? event.type}>{EVENT_ICON[event.type] ?? '•'}</span>
            <span>
              {event.last_name ? playerName(event) : <span className="hint">Joueur non identifie</span>}
              {event.related_last_name && (
                <span className="timeline__assist">
                  {' '}
                  ({event.type === 'substitution' ? 'sort' : 'passe'} : {playerName({ first_name: event.related_first_name, last_name: event.related_last_name })})
                </span>
              )}
              {event.type === 'penalty_goal' && <span className="timeline__assist"> (pen.)</span>}
              {event.type === 'own_goal' && <span className="timeline__assist"> (csc)</span>}
            </span>
            {onDelete && (
              <button className="btn btn--ghost btn--danger" onClick={() => onDelete(event.id)} title="Supprimer">
                ×
              </button>
            )}
          </div>
        );
        return (
          <div className="timeline__row" key={event.id}>
            {isHome ? cell : <div />}
            <div className="timeline__minute">{event.minute}'</div>
            {isHome ? <div /> : cell}
          </div>
        );
      })}
    </div>
  );
}
