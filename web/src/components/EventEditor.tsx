import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { EVENT_LABEL, playerName } from '../lib/format';
import type { Appearance, MatchDetail } from '../lib/types';

interface Props {
  detail: MatchDetail;
  onChange: (detail: MatchDetail) => void;
}

const TYPES = ['goal', 'penalty_goal', 'own_goal', 'yellow', 'second_yellow', 'red', 'penalty_missed', 'penalty_saved'];

/** Ajout d un fait de jeu (but, carton, penalty) sur la rencontre. */
export default function EventEditor({ detail, onChange }: Props) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [type, setType] = useState('goal');
  const [minute, setMinute] = useState('45');
  const [playerId, setPlayerId] = useState<string>('');
  const [assistId, setAssistId] = useState<string>('');
  const [recomputeScore, setRecomputeScore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sideData = side === 'home' ? detail.home : detail.away;
  const players: Appearance[] = [...sideData.starters, ...sideData.substitutes];
  const teamId = side === 'home' ? detail.match.home_team_id : detail.match.away_team_id;
  const isGoal = type === 'goal' || type === 'penalty_goal';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ detail: MatchDetail }>(
        `/api/matches/${detail.match.id}/events${recomputeScore ? '?recompute_score=1' : ''}`,
        {
          method: 'POST',
          body: JSON.stringify({
            team_id: teamId,
            player_id: playerId ? Number(playerId) : null,
            related_player_id: isGoal && assistId ? Number(assistId) : null,
            minute: Number(minute),
            type,
          }),
        },
      );
      onChange(result.detail);
      setAssistId('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card__body">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div className="field">
          <label htmlFor="event-side">Equipe</label>
          <select
            id="event-side"
            value={side}
            onChange={(event) => {
              setSide(event.target.value as 'home' | 'away');
              setPlayerId('');
              setAssistId('');
            }}
          >
            <option value="home">{detail.match.home_team_name}</option>
            <option value="away">{detail.match.away_team_name}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="event-type">Fait de jeu</label>
          <select id="event-type" value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map((item) => (
              <option key={item} value={item}>
                {EVENT_LABEL[item]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="event-minute">Minute</label>
          <input
            id="event-minute"
            type="number"
            min={0}
            max={130}
            value={minute}
            onChange={(event) => setMinute(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="event-player">Joueur</label>
          <select id="event-player" value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
            <option value="">— non identifie —</option>
            {players.map((player) => (
              <option key={player.player_id} value={player.player_id}>
                {player.shirt_number ? `${player.shirt_number}. ` : ''}
                {playerName(player)}
              </option>
            ))}
          </select>
        </div>
        {isGoal && (
          <div className="field">
            <label htmlFor="event-assist">Passeur</label>
            <select id="event-assist" value={assistId} onChange={(event) => setAssistId(event.target.value)}>
              <option value="">— aucun —</option>
              {players
                .filter((player) => String(player.player_id) !== playerId)
                .map((player) => (
                  <option key={player.player_id} value={player.player_id}>
                    {playerName(player)}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      <div className="btn-row">
        <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={recomputeScore}
            onChange={(event) => setRecomputeScore(event.target.checked)}
          />
          Recalculer le score a partir des buts saisis
        </label>
        <button className="btn btn--primary" onClick={submit} disabled={busy}>
          {busy ? 'Ajout...' : 'Ajouter le fait de jeu'}
        </button>
      </div>
      {players.length === 0 && (
        <div className="hint" style={{ marginTop: 8 }}>
          Astuce : retranscrivez d abord la composition pour pouvoir associer un buteur.
        </div>
      )}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
