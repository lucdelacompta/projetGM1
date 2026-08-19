PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clubs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fff_id      TEXT UNIQUE,
  name        TEXT NOT NULL,
  short_name  TEXT,
  logo_url    TEXT,
  ligue       TEXT,
  district    TEXT,
  city        TEXT,
  colors      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);

CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id    INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  fff_key    TEXT UNIQUE,
  name       TEXT NOT NULL,
  category   TEXT,
  level      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_teams_club ON teams(club_id);

CREATE TABLE IF NOT EXISTS competitions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  fff_cp_no TEXT,
  name      TEXT NOT NULL,
  season    TEXT NOT NULL,
  level     TEXT,
  type      TEXT,
  UNIQUE (name, season)
);

CREATE TABLE IF NOT EXISTS pools (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  fff_ph_no      TEXT,
  fff_po_no      TEXT,
  name           TEXT NOT NULL,
  UNIQUE (competition_id, name)
);

CREATE TABLE IF NOT EXISTS matches (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fff_ma_no      TEXT UNIQUE,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
  pool_id        INTEGER REFERENCES pools(id) ON DELETE SET NULL,
  season         TEXT NOT NULL,
  round          INTEGER,
  kickoff        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'scheduled',
  home_team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_score     INTEGER,
  away_score     INTEGER,
  home_score_ht  INTEGER,
  away_score_ht  INTEGER,
  venue          TEXT,
  referee        TEXT,
  source         TEXT NOT NULL DEFAULT 'manual',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff);
CREATE INDEX IF NOT EXISTS idx_matches_pool ON matches(pool_id);
CREATE INDEX IF NOT EXISTS idx_matches_home ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away ON matches(away_team_id);

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id       INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  birth_date    TEXT,
  position      TEXT,
  license       TEXT,
  shirt_number  INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(last_name, first_name);

CREATE TABLE IF NOT EXISTS match_sheets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  side       TEXT NOT NULL CHECK (side IN ('home','away')),
  formation  TEXT,
  coach      TEXT,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated')),
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (match_id, side)
);

CREATE TABLE IF NOT EXISTS appearances (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id     INTEGER NOT NULL REFERENCES match_sheets(id) ON DELETE CASCADE,
  match_id     INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  shirt_number INTEGER,
  position     TEXT,
  role         TEXT NOT NULL DEFAULT 'starter' CHECK (role IN ('starter','sub','unused')),
  minute_in    INTEGER,
  minute_out   INTEGER,
  captain      INTEGER NOT NULL DEFAULT 0,
  rating       REAL,
  auto_rating  REAL,
  comment      TEXT,
  rated_at     TEXT,
  UNIQUE (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_appearances_sheet ON appearances(sheet_id);
CREATE INDEX IF NOT EXISTS idx_appearances_player ON appearances(player_id);

CREATE TABLE IF NOT EXISTS match_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id          INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id           INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id         INTEGER REFERENCES players(id) ON DELETE SET NULL,
  related_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  minute            INTEGER NOT NULL,
  type              TEXT NOT NULL,
  detail            TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_events_player ON match_events(player_id);

CREATE TABLE IF NOT EXISTS sync_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  scope       TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status      TEXT NOT NULL DEFAULT 'running',
  inserted    INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  requests    INTEGER NOT NULL DEFAULT 0,
  message     TEXT
);

CREATE VIEW IF NOT EXISTS v_matches AS
SELECT
  m.*,
  ht.name  AS home_team_name,
  at.name  AS away_team_name,
  hc.id    AS home_club_id,
  ac.id    AS away_club_id,
  hc.name  AS home_club_name,
  ac.name  AS away_club_name,
  hc.logo_url AS home_logo,
  ac.logo_url AS away_logo,
  c.name   AS competition_name,
  c.level  AS competition_level,
  p.name   AS pool_name
FROM matches m
JOIN teams ht ON ht.id = m.home_team_id
JOIN teams at ON at.id = m.away_team_id
JOIN clubs hc ON hc.id = ht.club_id
JOIN clubs ac ON ac.id = at.club_id
LEFT JOIN competitions c ON c.id = m.competition_id
LEFT JOIN pools p ON p.id = m.pool_id;
