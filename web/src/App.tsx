import { NavLink, Route, Routes } from 'react-router-dom';
import SearchBox from './components/SearchBox';
import ScoresPage from './pages/ScoresPage';
import MatchPage from './pages/MatchPage';
import CompetitionsPage from './pages/CompetitionsPage';
import TeamPage from './pages/TeamPage';
import PlayerPage from './pages/PlayerPage';
import ClubsPage from './pages/ClubsPage';
import RankingsPage from './pages/RankingsPage';
import ImportPage from './pages/ImportPage';

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header__bar">
          <NavLink to="/" className="logo">
            <span className="logo__mark">⚽</span>
            <span>
              Amateur<span className="logo__amateur">Score</span>
            </span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              Scores
            </NavLink>
            <NavLink to="/competitions">Competitions</NavLink>
            <NavLink to="/clubs">Clubs</NavLink>
            <NavLink to="/classements">Notes</NavLink>
            <NavLink to="/import">Import FFF</NavLink>
          </nav>
          <SearchBox />
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<ScoresPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/competitions" element={<CompetitionsPage />} />
          <Route path="/clubs" element={<ClubsPage />} />
          <Route path="/equipe/:id" element={<TeamPage />} />
          <Route path="/joueur/:id" element={<PlayerPage />} />
          <Route path="/classements" element={<RankingsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="*" element={<div className="empty">Page introuvable.</div>} />
        </Routes>
      </main>

      <footer className="footer">
        AmateurScore — suivi du football amateur francais. Donnees issues de l API publique de la FFF
        et des feuilles de match retranscrites par les utilisateurs. Projet independant, sans lien
        avec la Federation Francaise de Football.
      </footer>
    </div>
  );
}
