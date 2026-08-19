import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface SearchResults {
  clubs: { id: number; name: string }[];
  teams: { id: number; name: string; club_name: string }[];
  players: { id: number; first_name: string; last_name: string; club_name: string | null }[];
}

const EMPTY: SearchResults = { clubs: [], teams: [], players: [] };

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<SearchResults>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((payload) => {
          setResults(payload);
          setOpen(true);
        })
        .catch(() => setResults(EMPTY));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const total = results.clubs.length + results.teams.length + results.players.length;

  return (
    <div className="search" ref={boxRef}>
      <input
        value={query}
        placeholder="Club, equipe, joueur..."
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => total > 0 && setOpen(true)}
        aria-label="Rechercher"
      />
      {open && total > 0 && (
        <div className="search__results">
          {results.teams.length > 0 && (
            <div className="search__group">
              <div className="search__label">Equipes</div>
              {results.teams.map((team) => (
                <Link key={team.id} className="search__item" to={`/equipe/${team.id}`} onClick={() => setOpen(false)}>
                  {team.name} <span className="hint">{team.club_name}</span>
                </Link>
              ))}
            </div>
          )}
          {results.players.length > 0 && (
            <div className="search__group">
              <div className="search__label">Joueurs</div>
              {results.players.map((player) => (
                <Link key={player.id} className="search__item" to={`/joueur/${player.id}`} onClick={() => setOpen(false)}>
                  {player.first_name} {player.last_name} <span className="hint">{player.club_name ?? ''}</span>
                </Link>
              ))}
            </div>
          )}
          {results.clubs.length > 0 && (
            <div className="search__group">
              <div className="search__label">Clubs</div>
              {results.clubs.map((club) => (
                <Link key={club.id} className="search__item" to={`/clubs?club=${club.id}`} onClick={() => setOpen(false)}>
                  {club.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
