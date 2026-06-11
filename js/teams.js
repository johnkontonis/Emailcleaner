/*
 * 82-0 — team identity (colors, abbreviation, logo)
 *
 * Team colors and abbreviations are factual. Logos are not bundled with this
 * project; teamLogo() returns a public CDN URL that the browser loads at
 * render time, and the UI falls back to a colored initials badge whenever a
 * logo is missing or fails to load (and for historical franchise names). NBA
 * team names and logos are trademarks of their respective teams.
 */

// name -> { abbr, slug (ESPN), c1 (primary), c2 (secondary) }
const TEAM_META = {
  "Atlanta Hawks": { abbr: "ATL", slug: "atl", c1: "#E03A3E", c2: "#C1D32F" },
  "Boston Celtics": { abbr: "BOS", slug: "bos", c1: "#007A33", c2: "#BA9653" },
  "Brooklyn Nets": { abbr: "BKN", slug: "bkn", c1: "#000000", c2: "#FFFFFF" },
  "Charlotte Hornets": { abbr: "CHA", slug: "cha", c1: "#1D1160", c2: "#00788C" },
  "Chicago Bulls": { abbr: "CHI", slug: "chi", c1: "#CE1141", c2: "#111111" },
  "Cleveland Cavaliers": { abbr: "CLE", slug: "cle", c1: "#860038", c2: "#FDBB30" },
  "Dallas Mavericks": { abbr: "DAL", slug: "dal", c1: "#00538C", c2: "#B8C4CA" },
  "Denver Nuggets": { abbr: "DEN", slug: "den", c1: "#0E2240", c2: "#FEC524" },
  "Detroit Pistons": { abbr: "DET", slug: "det", c1: "#C8102E", c2: "#1D42BA" },
  "Golden State Warriors": { abbr: "GSW", slug: "gs", c1: "#1D428A", c2: "#FFC72C" },
  "Houston Rockets": { abbr: "HOU", slug: "hou", c1: "#CE1141", c2: "#111111" },
  "Indiana Pacers": { abbr: "IND", slug: "ind", c1: "#002D62", c2: "#FDBB30" },
  "Los Angeles Clippers": { abbr: "LAC", slug: "lac", c1: "#C8102E", c2: "#1D428A" },
  "Los Angeles Lakers": { abbr: "LAL", slug: "lal", c1: "#552583", c2: "#FDB927" },
  "Memphis Grizzlies": { abbr: "MEM", slug: "mem", c1: "#5D76A9", c2: "#12173F" },
  "Miami Heat": { abbr: "MIA", slug: "mia", c1: "#98002E", c2: "#F9A01B" },
  "Milwaukee Bucks": { abbr: "MIL", slug: "mil", c1: "#00471B", c2: "#EEE1C6" },
  "Minnesota Timberwolves": { abbr: "MIN", slug: "min", c1: "#0C2340", c2: "#236192" },
  "New Orleans Pelicans": { abbr: "NOP", slug: "no", c1: "#0C2340", c2: "#C8102E" },
  "New York Knicks": { abbr: "NYK", slug: "ny", c1: "#006BB6", c2: "#F58426" },
  "Oklahoma City Thunder": { abbr: "OKC", slug: "okc", c1: "#007AC1", c2: "#EF3B24" },
  "Orlando Magic": { abbr: "ORL", slug: "orl", c1: "#0077C0", c2: "#C4CED4" },
  "Philadelphia 76ers": { abbr: "PHI", slug: "phi", c1: "#006BB6", c2: "#ED174C" },
  "Phoenix Suns": { abbr: "PHX", slug: "phx", c1: "#1D1160", c2: "#E56020" },
  "Portland Trail Blazers": { abbr: "POR", slug: "por", c1: "#E03A3E", c2: "#111111" },
  "Sacramento Kings": { abbr: "SAC", slug: "sac", c1: "#5A2D81", c2: "#63727A" },
  "San Antonio Spurs": { abbr: "SAS", slug: "sa", c1: "#9EA8B2", c2: "#111111" },
  "Toronto Raptors": { abbr: "TOR", slug: "tor", c1: "#CE1141", c2: "#111111" },
  "Utah Jazz": { abbr: "UTA", slug: "utah", c1: "#002B5C", c2: "#F9A01B" },
  "Washington Wizards": { abbr: "WAS", slug: "wsh", c1: "#002B5C", c2: "#E31837" },
};

// Historical / relocated franchise names from the curated seed -> identity.
// These render as colored initials badges (no anachronistic modern logo).
const TEAM_ALIASES = {
  "San Francisco Warriors": "Golden State Warriors",
  "Seattle SuperSonics": "Oklahoma City Thunder",
  "New Jersey Nets": "Brooklyn Nets",
  "Cincinnati Royals": "Sacramento Kings",
  "Kansas City Kings": "Sacramento Kings",
  "St. Louis Hawks": "Atlanta Hawks",
  "Baltimore Bullets": "Washington Wizards",
  "Washington Bullets": "Washington Wizards",
};

function teamInitials(name) {
  const words = name.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || name;
  return last.slice(0, 3).toUpperCase();
}

// Returns { abbr, c1, c2, logo } for any team name. logo is null when we
// should render a colored initials badge instead (historical names / unknown).
function teamMeta(name) {
  const direct = TEAM_META[name];
  if (direct) {
    return {
      abbr: direct.abbr,
      c1: direct.c1,
      c2: direct.c2,
      logo: `https://a.espncdn.com/i/teamlogos/nba/500/${direct.slug}.png`,
    };
  }
  const alias = TEAM_ALIASES[name];
  if (alias && TEAM_META[alias]) {
    const m = TEAM_META[alias];
    return { abbr: teamInitials(name), c1: m.c1, c2: m.c2, logo: null };
  }
  return { abbr: teamInitials(name), c1: "#3a4252", c2: "#1d2740", logo: null };
}
