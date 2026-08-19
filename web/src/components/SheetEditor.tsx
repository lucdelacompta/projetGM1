import { useEffect, useMemo, useState } from 'react';
import { apiFetch, useApi } from '../lib/api';
import { POSITION_LABEL } from '../lib/format';
import type { AppearanceRole, MatchDetail, PlayerPosition, SheetSideData } from '../lib/types';

interface SquadPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: PlayerPosition | null;
  shirt_number: number | null;
  appearances: number;
}

interface Row {
  key: string;
  player_id: number | null;
  first_name: string;
  last_name: string;
  shirt_number: string;
  position: PlayerPosition | '';
  role: AppearanceRole;
  minute_in: string;
  minute_out: string;
  captain: boolean;
}

interface Props {
  matchId: number;
  side: 'home' | 'away';
  teamId: number;
  teamName: string;
  data: SheetSideData;
  onSaved: (detail: MatchDetail) => void;
}

const POSITIONS: PlayerPosition[] = ['GK', 'DEF', 'MID', 'FWD'];
let rowCounter = 0;
const nextKey = () => `row-${(rowCounter += 1)}`;

function emptyRow(role: AppearanceRole = 'starter'): Row {
  return {
    key: nextKey(),
    player_id: null,
    first_name: '',
    last_name: '',
    shirt_number: '',
    position: '',
    role,
    minute_in: '',
    minute_out: '',
    captain: false,
  };
}

/** Formulaire de retranscription d une feuille de match (une equipe). */
export default function SheetEditor({ matchId, side, teamId, teamName, data, onSaved }: Props) {
  const squad = useApi<{ squad: SquadPlayer[] }>(`/api/teams/${teamId}/squad`);
  const [rows, setRows] = useState<Row[]>([]);
  const [formation, setFormation] = useState('');
  const [coach, setCoach] = useState('');
  const [status, setStatus] = useState<'draft' | 'validated'>('draft');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    const existing = [...data.starters, ...data.substitutes, ...data.unused];
    setRows(
      existing.length
        ? existing.map((appearance) => ({
            key: nextKey(),
            player_id: appearance.player_id,
            first_name: appearance.first_name,
            last_name: appearance.last_name,
            shirt_number: appearance.shirt_number?.toString() ?? '',
            position: (appearance.position ?? appearance.player_position ?? '') as PlayerPosition | '',
            role: appearance.role,
            minute_in: appearance.minute_in?.toString() ?? '',
            minute_out: appearance.minute_out?.toString() ?? '',
            captain: appearance.captain === 1,
          }))
        : [],
    );
    setFormation(data.sheet?.formation ?? '');
    setCoach(data.sheet?.coach ?? '');
    setStatus((data.sheet?.status as 'draft' | 'validated') ?? 'draft');
  }, [data]);

  const usedIds = useMemo(
    () => new Set(rows.map((row) => row.player_id).filter((id): id is number => id != null)),
    [rows],
  );
  const starters = rows.filter((row) => row.role === 'starter').length;

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const prefill = () => {
    const players = squad.data?.squad ?? [];
    const byPosition = (position: PlayerPosition, count: number) =>
      players.filter((player) => player.position === position).slice(0, count);
    const eleven = [
      ...byPosition('GK', 1),
      ...byPosition('DEF', 4),
      ...byPosition('MID', 3),
      ...byPosition('FWD', 3),
    ];
    const bench = players.filter((player) => !eleven.some((p) => p.id === player.id)).slice(0, 5);
    setRows([
      ...eleven.map((player) => ({
        ...emptyRow('starter'),
        player_id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        shirt_number: player.shirt_number?.toString() ?? '',
        position: (player.position ?? '') as PlayerPosition | '',
      })),
      ...bench.map((player) => ({
        ...emptyRow('unused'),
        player_id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        shirt_number: player.shirt_number?.toString() ?? '',
        position: (player.position ?? '') as PlayerPosition | '',
      })),
    ]);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        formation: formation || null,
        coach: coach || null,
        status,
        players: rows.map((row) => ({
          player_id: row.player_id ?? undefined,
          first_name: row.first_name || undefined,
          last_name: row.last_name || undefined,
          shirt_number: row.shirt_number ? Number(row.shirt_number) : null,
          position: row.position || null,
          role: row.role,
          minute_in: row.minute_in ? Number(row.minute_in) : null,
          minute_out: row.minute_out ? Number(row.minute_out) : null,
          captain: row.captain,
        })),
      };
      const result = await apiFetch<{ detail: MatchDetail; appearances: number }>(
        `/api/matches/${matchId}/sheet/${side}`,
        { method: 'PUT', body: JSON.stringify(payload) },
      );
      setMessage({ type: 'success', text: `Feuille enregistree (${result.appearances} joueurs).` });
      onSaved(result.detail);
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card__body">
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <strong>{teamName}</strong>
        <span className="hint">
          {starters}/11 titulaires • {rows.length} joueurs sur la feuille
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <div className="field">
          <label htmlFor={`formation-${side}`}>Systeme de jeu</label>
          <input
            id={`formation-${side}`}
            value={formation}
            placeholder="4-3-3"
            onChange={(event) => setFormation(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`coach-${side}`}>Entraineur</label>
          <input id={`coach-${side}`} value={coach} onChange={(event) => setCoach(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`status-${side}`}>Etat de la feuille</label>
          <select
            id={`status-${side}`}
            value={status}
            onChange={(event) => setStatus(event.target.value as 'draft' | 'validated')}
          >
            <option value="draft">Brouillon</option>
            <option value="validated">Validee</option>
          </select>
        </div>
      </div>

      <div className="sheet-editor__row sheet-editor__head">
        <span>N°</span>
        <span>Joueur</span>
        <span>Poste</span>
        <span>Role</span>
        <span>Entre</span>
        <span>Sorti</span>
        <span>Cap.</span>
        <span />
      </div>

      {rows.map((row) => (
        <div className="sheet-editor__row" key={row.key}>
          <input
            type="number"
            min={1}
            max={99}
            value={row.shirt_number}
            onChange={(event) => update(row.key, { shirt_number: event.target.value })}
            aria-label="Numero"
          />
          {row.player_id != null ? (
            <select
              value={row.player_id}
              onChange={(event) => {
                const id = Number(event.target.value);
                const player = squad.data?.squad.find((p) => p.id === id);
                update(row.key, {
                  player_id: id,
                  first_name: player?.first_name ?? '',
                  last_name: player?.last_name ?? '',
                  position: (player?.position ?? row.position) as PlayerPosition | '',
                });
              }}
              aria-label="Joueur"
            >
              {squad.data?.squad
                .filter((player) => player.id === row.player_id || !usedIds.has(player.id))
                .map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.last_name} {player.first_name}
                  </option>
                ))}
            </select>
          ) : (
            <input
              value={`${row.first_name} ${row.last_name}`.trim()}
              placeholder="Prenom Nom"
              onChange={(event) => {
                const [first, ...rest] = event.target.value.split(' ');
                update(row.key, { first_name: first ?? '', last_name: rest.join(' ') });
              }}
              aria-label="Nouveau joueur"
            />
          )}
          <select
            value={row.position}
            onChange={(event) => update(row.key, { position: event.target.value as PlayerPosition | '' })}
            aria-label="Poste"
          >
            <option value="">—</option>
            {POSITIONS.map((position) => (
              <option key={position} value={position}>
                {POSITION_LABEL[position]}
              </option>
            ))}
          </select>
          <select
            value={row.role}
            onChange={(event) => update(row.key, { role: event.target.value as AppearanceRole })}
            aria-label="Role"
          >
            <option value="starter">Titulaire</option>
            <option value="sub">Entre en jeu</option>
            <option value="unused">Non entre</option>
          </select>
          <input
            type="number"
            min={0}
            max={120}
            value={row.minute_in}
            placeholder="—"
            disabled={row.role !== 'sub'}
            onChange={(event) => update(row.key, { minute_in: event.target.value })}
            aria-label="Minute d entree"
          />
          <input
            type="number"
            min={0}
            max={120}
            value={row.minute_out}
            placeholder="—"
            disabled={row.role === 'unused'}
            onChange={(event) => update(row.key, { minute_out: event.target.value })}
            aria-label="Minute de sortie"
          />
          <input
            type="checkbox"
            checked={row.captain}
            onChange={(event) => update(row.key, { captain: event.target.checked })}
            aria-label="Capitaine"
          />
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
            aria-label="Retirer"
          >
            ×
          </button>
        </div>
      ))}

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const free = squad.data?.squad.find((player) => !usedIds.has(player.id));
            setRows((current) => [
              ...current,
              free
                ? {
                    ...emptyRow(current.filter((r) => r.role === 'starter').length < 11 ? 'starter' : 'sub'),
                    player_id: free.id,
                    first_name: free.first_name,
                    last_name: free.last_name,
                    shirt_number: free.shirt_number?.toString() ?? '',
                    position: (free.position ?? '') as PlayerPosition | '',
                  }
                : emptyRow('sub'),
            ]);
          }}
        >
          + Ajouter un joueur de l effectif
        </button>
        <button type="button" className="btn" onClick={() => setRows((current) => [...current, emptyRow('sub')])}>
          + Joueur hors effectif
        </button>
        <button type="button" className="btn" onClick={prefill} disabled={!squad.data?.squad.length}>
          Pre-remplir un 4-3-3
        </button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer la feuille'}
        </button>
      </div>

      {message && <div className={message.type === 'error' ? 'error' : 'success'} style={{ marginTop: 10 }}>{message.text}</div>}
      {starters > 11 && <div className="error" style={{ marginTop: 6 }}>Trop de titulaires : 11 maximum.</div>}
    </div>
  );
}
