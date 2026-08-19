import { useState } from 'react';
import { apiFetch, useApi } from '../lib/api';

interface SyncStatus {
  running: boolean;
  source: string;
  offline: boolean;
  configured_clubs: string[];
  runs: {
    id: number;
    source: string;
    scope: string | null;
    started_at: string;
    finished_at: string | null;
    status: string;
    inserted: number;
    updated: number;
    requests: number;
    message: string | null;
  }[];
}

interface SyncReport {
  clubs: number;
  teams: number;
  matches_inserted: number;
  matches_updated: number;
  requests: number;
  warnings: string[];
  status: string;
  message?: string;
}

export default function ImportPage() {
  const status = useApi<SyncStatus>('/api/sync/status');
  const [clubs, setClubs] = useState('');
  const [pool, setPool] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<unknown>(null);

  const runClubs = async () => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const payload = clubs.trim()
        ? { clubs: clubs.split(',').map((value) => value.trim()).filter(Boolean) }
        : {};
      setReport(await apiFetch<SyncReport>('/api/sync/clubs', { method: 'POST', body: JSON.stringify(payload) }));
      status.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runPool = async () => {
    const [cp, ph, po] = pool.split('/').map((value) => value.trim());
    if (!cp || !ph || !po) {
      setError('Format attendu : cp_no/ph_no/po_no (ex : 420001/1/3)');
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(
        await apiFetch<SyncReport>('/api/sync/pool', {
          method: 'POST',
          body: JSON.stringify({ cp_no: cp, ph_no: ph, po_no: po }),
        }),
      );
      status.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runProbe = async () => {
    setBusy(true);
    setError(null);
    try {
      setProbe(await apiFetch('/api/sync/probe'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="layout-2">
      <div>
        <div className="card">
          <div className="card__title">Import depuis la FFF</div>
          <div className="card__body">
            <p className="hint" style={{ marginTop: 0 }}>
              Les donnees sont recuperees depuis l API publique <code>{status.data?.source}</code>
              (calendriers, resultats, equipes, clubs). L import est volontairement lent (une requete
              toutes les {'~'}0,6 s) pour ne pas solliciter le serveur de la federation.
            </p>

            <div className="field">
              <label htmlFor="clubs">Numeros de club FFF (cl_no), separes par des virgules</label>
              <input
                id="clubs"
                value={clubs}
                placeholder={status.data?.configured_clubs.join(', ') || '553, 12345'}
                onChange={(event) => setClubs(event.target.value)}
              />
            </div>
            <button className="btn btn--primary" onClick={runClubs} disabled={busy}>
              {busy ? 'Import en cours...' : 'Importer ces clubs'}
            </button>

            <div className="field" style={{ marginTop: 18 }}>
              <label htmlFor="pool">Poule complete (cp_no/ph_no/po_no)</label>
              <input
                id="pool"
                value={pool}
                placeholder="420001/1/3"
                onChange={(event) => setPool(event.target.value)}
              />
            </div>
            <div className="btn-row">
              <button className="btn" onClick={runPool} disabled={busy}>
                Importer la poule
              </button>
              <button className="btn btn--ghost" onClick={runProbe} disabled={busy}>
                Tester la connexion a la FFF
              </button>
            </div>

            {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

            {report && (
              <div style={{ marginTop: 14 }}>
                <div className="success">
                  Import termine ({report.status}) : {report.matches_inserted} rencontres ajoutees,{' '}
                  {report.matches_updated} mises a jour, {report.clubs} clubs, {report.teams} equipes,{' '}
                  {report.requests} requetes.
                </div>
                {report.warnings?.length > 0 && (
                  <ul className="hint">
                    {report.warnings.slice(0, 8).map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                )}
                {report.message && <div className="error">{report.message}</div>}
              </div>
            )}

            {probe != null && (
              <pre
                className="hint"
                style={{ marginTop: 12, maxHeight: 240, overflow: 'auto', background: 'var(--bg-row)', padding: 10, borderRadius: 8 }}
              >
                {JSON.stringify(probe, null, 2)}
              </pre>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__title">Historique des imports</div>
          <div className="card__body card__body--flush">
            <table className="table">
              <thead>
                <tr>
                  <th>Debut</th>
                  <th>Perimetre</th>
                  <th>Etat</th>
                  <th className="num">Ajouts</th>
                  <th className="num">MAJ</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {(status.data?.runs ?? []).map((run) => (
                  <tr key={run.id}>
                    <td className="hint">{run.started_at}</td>
                    <td>{run.scope ?? '—'}</td>
                    <td>
                      <span className={`badge ${run.status === 'ok' ? 'badge--accent' : 'badge--finished'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="num">{run.inserted}</td>
                    <td className="num">{run.updated}</td>
                    <td className="hint">{run.message ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!status.data?.runs.length && <div className="empty">Aucun import lance pour le moment.</div>}
          </div>
        </div>
      </div>

      <aside>
        <div className="card">
          <div className="card__title">Ou trouver les identifiants ?</div>
          <div className="card__body hint">
            <p style={{ marginTop: 0 }}>
              Sur fff.fr, l URL d une fiche club contient son numero (<code>cl_no</code>). Celle d une
              poule contient la competition (<code>cp_no</code>), la phase (<code>ph_no</code>) et la
              poule (<code>po_no</code>).
            </p>
            <p style={{ marginBottom: 0 }}>
              Si l import echoue avec une erreur reseau, le serveur qui heberge AmateurScore n a
              probablement pas d acces sortant vers <code>api-dofa.fff.fr</code> : utilisez le bouton
              de test de connexion pour le verifier.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
