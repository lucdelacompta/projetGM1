import { useNavigate } from 'react-router-dom';
import Crest from './Crest';
import { formatTime } from '../lib/format';
import type { MatchRow } from '../lib/types';

interface Props {
  match: MatchRow;
  showDate?: boolean;
  hasSheet?: boolean;
}

/** Ligne de score facon Flashscore : heure/statut, equipes, score. */
export default function MatchRowItem({ match, showDate = false, hasSheet = false }: Props) {
  const navigate = useNavigate();
  const played = match.home_score != null && match.away_score != null;
  const homeWin = played && match.home_score! > match.away_score!;
  const awayWin = played && match.away_score! > match.home_score!;

  return (
    <div
      className="match-row"
      onClick={() => navigate(`/match/${match.id}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/match/${match.id}`);
      }}
    >
      <div className="match-row__time">
        {match.status === 'live' ? (
          <span className="live pulse">EN COURS</span>
        ) : match.status === 'postponed' ? (
          'REP.'
        ) : match.status === 'cancelled' ? (
          'ANN.'
        ) : (
          <>
            {showDate && <div>{match.kickoff.slice(8, 10)}/{match.kickoff.slice(5, 7)}</div>}
            {formatTime(match.kickoff)}
          </>
        )}
      </div>

      <div className="match-row__teams">
        <div className={`match-row__team${played && awayWin ? ' is-loser' : ''}`}>
          <Crest name={match.home_team_name} logo={match.home_logo} />
          <span>{match.home_team_name}</span>
        </div>
        <div className={`match-row__team${played && homeWin ? ' is-loser' : ''}`}>
          <Crest name={match.away_team_name} logo={match.away_logo} />
          <span>{match.away_team_name}</span>
        </div>
      </div>

      <div className="match-row__score">
        <div className={played && awayWin ? 'dim' : undefined}>{match.home_score ?? '-'}</div>
        <div className={played && homeWin ? 'dim' : undefined}>{match.away_score ?? '-'}</div>
      </div>

      <div className={`match-row__flag${hasSheet ? ' has-sheet' : ''}`} title={hasSheet ? 'Feuille de match retranscrite' : 'Feuille de match a saisir'}>
        {hasSheet ? '📋' : '›'}
      </div>
    </div>
  );
}
