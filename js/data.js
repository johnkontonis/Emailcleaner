/*
 * 82-0 — Player dataset
 *
 * A curated roster of NBA stars grouped by decade and franchise.
 * Stats are approximate career per-game averages:
 *   ppg = points, rpg = rebounds, apg = assists, spg = steals, bpg = blocks
 *
 * Steals/blocks were not officially tracked before the 1973-74 season, so for
 * earlier players those values are fair estimates (per the original game's
 * "missing defensive stats from older eras are estimated" rule).
 *
 * The whole dataset is exposed through a small async provider interface
 * (see DataProvider at the bottom) so it can later be swapped for a live API
 * without touching the game logic.
 */

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const POSITION_NAMES = {
  PG: "Point Guard",
  SG: "Shooting Guard",
  SF: "Small Forward",
  PF: "Power Forward",
  C: "Center",
};
const DECADES = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];

// p(name, positions, ppg, rpg, apg, spg, bpg)
function p(name, pos, ppg, rpg, apg, spg, bpg) {
  return { name, pos, ppg, rpg, apg, spg, bpg };
}

const ROSTERS = {
  "1960s": {
    "San Francisco Warriors": [
      p("Wilt Chamberlain", ["C"], 39.6, 25.1, 4.6, 1.6, 3.5),
      p("Nate Thurmond", ["C", "PF"], 15.0, 15.0, 2.7, 1.0, 2.4),
      p("Paul Arizin", ["SF", "SG"], 22.8, 8.6, 2.3, 1.0, 0.4),
      p("Tom Meschery", ["PF"], 12.9, 9.4, 1.6, 0.8, 0.4),
    ],
    "Boston Celtics": [
      p("Bill Russell", ["C"], 15.1, 22.5, 4.3, 1.4, 3.6),
      p("Bob Cousy", ["PG"], 18.4, 5.2, 7.5, 1.6, 0.1),
      p("John Havlicek", ["SF", "SG"], 20.8, 6.3, 4.8, 1.4, 0.3),
      p("Sam Jones", ["SG"], 17.7, 4.9, 2.5, 1.0, 0.2),
      p("K.C. Jones", ["PG"], 7.4, 3.5, 4.3, 1.4, 0.1),
    ],
    "Los Angeles Lakers": [
      p("Jerry West", ["PG", "SG"], 27.0, 5.8, 6.7, 2.6, 0.7),
      p("Elgin Baylor", ["SF", "PF"], 27.4, 13.5, 4.3, 1.4, 0.5),
      p("Gail Goodrich", ["PG", "SG"], 18.6, 3.0, 4.7, 1.1, 0.1),
    ],
    "Cincinnati Royals": [
      p("Oscar Robertson", ["PG"], 25.7, 7.5, 9.5, 1.8, 0.3),
      p("Jerry Lucas", ["PF", "C"], 17.0, 15.6, 3.3, 0.9, 0.5),
    ],
    "St. Louis Hawks": [
      p("Bob Pettit", ["PF", "C"], 26.4, 16.2, 3.0, 1.2, 0.8),
      p("Lenny Wilkens", ["PG"], 16.5, 4.7, 6.7, 1.8, 0.2),
    ],
    "Philadelphia 76ers": [
      p("Hal Greer", ["SG", "PG"], 19.2, 5.0, 4.0, 1.4, 0.2),
      p("Billy Cunningham", ["SF", "PF"], 20.8, 10.4, 4.3, 1.3, 0.4),
      p("Chet Walker", ["SF"], 18.2, 7.1, 2.1, 0.9, 0.3),
    ],
  },

  "1970s": {
    "Milwaukee Bucks": [
      p("Kareem Abdul-Jabbar", ["C"], 30.4, 15.3, 4.3, 1.1, 3.0),
      p("Oscar Robertson", ["PG"], 16.3, 5.5, 7.5, 1.6, 0.2),
      p("Bob Dandridge", ["SF"], 18.5, 6.8, 3.4, 1.2, 0.5),
    ],
    "Los Angeles Lakers": [
      p("Jerry West", ["PG", "SG"], 22.5, 4.6, 7.5, 2.6, 0.6),
      p("Wilt Chamberlain", ["C"], 17.7, 19.2, 4.1, 1.3, 3.0),
      p("Gail Goodrich", ["PG", "SG"], 22.0, 3.2, 5.0, 1.2, 0.1),
    ],
    "New York Knicks": [
      p("Walt Frazier", ["PG", "SG"], 18.9, 5.9, 6.1, 1.9, 0.2),
      p("Willis Reed", ["C"], 18.7, 12.9, 1.8, 1.0, 1.1),
      p("Earl Monroe", ["SG", "PG"], 18.8, 3.0, 3.9, 1.1, 0.1),
      p("Dave DeBusschere", ["PF"], 16.1, 11.0, 2.9, 1.1, 0.6),
      p("Bill Bradley", ["SF"], 12.4, 3.2, 3.4, 0.8, 0.1),
    ],
    "Boston Celtics": [
      p("Dave Cowens", ["C", "PF"], 17.6, 13.6, 3.8, 1.1, 0.9),
      p("John Havlicek", ["SF", "SG"], 20.8, 6.3, 4.8, 1.3, 0.3),
      p("Jo Jo White", ["PG", "SG"], 17.2, 4.0, 4.9, 1.2, 0.2),
    ],
    "Golden State Warriors": [
      p("Rick Barry", ["SF"], 23.2, 6.5, 5.1, 2.0, 0.5),
      p("Nate Thurmond", ["C", "PF"], 15.0, 15.0, 2.7, 1.0, 2.4),
    ],
    "Philadelphia 76ers": [
      p("Julius Erving", ["SF"], 24.2, 8.5, 3.9, 1.8, 1.5),
      p("George McGinnis", ["PF"], 20.2, 11.0, 3.5, 2.0, 0.5),
      p("Doug Collins", ["SG"], 17.9, 3.2, 3.3, 1.2, 0.2),
    ],
    "Portland Trail Blazers": [
      p("Bill Walton", ["C"], 13.3, 10.5, 3.4, 0.8, 2.2),
      p("Maurice Lucas", ["PF"], 14.6, 9.1, 2.6, 1.0, 0.6),
    ],
  },

  "1980s": {
    "Los Angeles Lakers": [
      p("Magic Johnson", ["PG"], 19.5, 7.2, 11.2, 1.9, 0.4),
      p("Kareem Abdul-Jabbar", ["C"], 21.5, 8.7, 3.0, 0.8, 2.4),
      p("James Worthy", ["SF"], 17.6, 5.1, 3.0, 1.1, 0.7),
      p("Byron Scott", ["SG"], 14.1, 3.0, 3.0, 1.2, 0.2),
      p("A.C. Green", ["PF"], 9.6, 7.4, 1.1, 0.8, 0.5),
    ],
    "Boston Celtics": [
      p("Larry Bird", ["SF", "PF"], 24.3, 10.0, 6.3, 1.7, 0.8),
      p("Kevin McHale", ["PF", "C"], 17.9, 7.3, 1.7, 0.4, 1.7),
      p("Robert Parish", ["C"], 14.5, 9.1, 1.4, 0.8, 1.5),
      p("Dennis Johnson", ["PG", "SG"], 14.1, 3.9, 5.0, 1.3, 0.4),
      p("Danny Ainge", ["SG", "PG"], 11.5, 2.7, 4.0, 1.1, 0.1),
    ],
    "Chicago Bulls": [
      p("Michael Jordan", ["SG"], 32.6, 6.0, 5.8, 2.7, 0.9),
      p("Scottie Pippen", ["SF", "SG"], 14.4, 5.6, 4.0, 1.9, 0.8),
    ],
    "Philadelphia 76ers": [
      p("Julius Erving", ["SF"], 22.0, 6.9, 3.8, 1.7, 1.4),
      p("Moses Malone", ["C"], 24.5, 14.0, 1.4, 0.9, 1.5),
      p("Charles Barkley", ["PF"], 22.1, 11.7, 3.9, 1.5, 0.8),
      p("Maurice Cheeks", ["PG"], 11.1, 2.8, 6.7, 2.3, 0.3),
    ],
    "Detroit Pistons": [
      p("Isiah Thomas", ["PG"], 19.2, 3.6, 9.3, 1.9, 0.3),
      p("Joe Dumars", ["SG"], 16.1, 2.2, 4.5, 0.9, 0.1),
      p("Bill Laimbeer", ["C"], 12.9, 9.7, 2.0, 0.6, 0.5),
      p("Dennis Rodman", ["PF"], 8.8, 11.5, 1.8, 0.8, 0.7),
      p("Adrian Dantley", ["SF"], 24.3, 5.7, 3.0, 1.0, 0.2),
    ],
    "Houston Rockets": [
      p("Hakeem Olajuwon", ["C"], 23.9, 12.1, 2.3, 1.9, 3.4),
      p("Ralph Sampson", ["C", "PF"], 19.0, 10.1, 2.5, 0.9, 1.9),
    ],
    "Utah Jazz": [
      p("Karl Malone", ["PF"], 25.0, 10.1, 3.6, 1.4, 0.8),
      p("John Stockton", ["PG"], 13.1, 2.7, 10.5, 2.2, 0.2),
    ],
    "Atlanta Hawks": [
      p("Dominique Wilkins", ["SF"], 24.8, 6.7, 2.5, 1.3, 0.6),
      p("Spud Webb", ["PG"], 9.9, 2.2, 5.3, 1.1, 0.1),
    ],
  },

  "1990s": {
    "Chicago Bulls": [
      p("Michael Jordan", ["SG"], 30.1, 6.2, 5.3, 2.3, 0.8),
      p("Scottie Pippen", ["SF", "SG"], 17.7, 6.7, 5.6, 2.1, 0.8),
      p("Dennis Rodman", ["PF"], 7.3, 16.7, 2.8, 0.7, 0.5),
      p("Toni Kukoc", ["SF", "PF"], 14.1, 4.5, 4.2, 1.0, 0.4),
      p("Horace Grant", ["PF"], 12.6, 9.0, 2.4, 1.1, 1.0),
    ],
    "Houston Rockets": [
      p("Hakeem Olajuwon", ["C"], 23.5, 11.3, 2.8, 1.7, 3.2),
      p("Clyde Drexler", ["SG", "SF"], 20.4, 6.1, 5.6, 2.0, 0.7),
      p("Robert Horry", ["PF", "SF"], 9.0, 5.5, 2.4, 1.2, 0.9),
    ],
    "Utah Jazz": [
      p("Karl Malone", ["PF"], 25.0, 10.1, 3.6, 1.4, 0.8),
      p("John Stockton", ["PG"], 13.1, 2.7, 10.5, 2.2, 0.2),
      p("Jeff Hornacek", ["SG"], 14.5, 3.4, 4.9, 1.4, 0.2),
    ],
    "Orlando Magic": [
      p("Shaquille O'Neal", ["C"], 27.2, 12.5, 2.9, 0.9, 2.6),
      p("Penny Hardaway", ["PG", "SG"], 19.0, 4.5, 6.3, 2.0, 0.6),
      p("Nick Anderson", ["SG", "SF"], 15.4, 5.5, 3.0, 1.5, 0.4),
    ],
    "San Antonio Spurs": [
      p("David Robinson", ["C"], 21.1, 10.6, 2.5, 1.4, 3.0),
      p("Tim Duncan", ["PF", "C"], 21.9, 12.2, 2.9, 0.7, 2.6),
      p("Sean Elliott", ["SF"], 14.2, 4.3, 2.6, 0.9, 0.4),
    ],
    "Seattle SuperSonics": [
      p("Gary Payton", ["PG"], 16.3, 3.9, 6.7, 1.8, 0.2),
      p("Shawn Kemp", ["PF", "C"], 14.6, 8.4, 1.7, 1.1, 1.2),
      p("Detlef Schrempf", ["SF", "PF"], 13.9, 6.2, 3.4, 1.0, 0.4),
    ],
    "Phoenix Suns": [
      p("Charles Barkley", ["PF"], 23.0, 11.5, 4.1, 1.5, 0.7),
      p("Kevin Johnson", ["PG"], 17.9, 3.3, 9.1, 1.5, 0.2),
    ],
    "New York Knicks": [
      p("Patrick Ewing", ["C"], 21.0, 9.8, 1.9, 1.0, 2.4),
      p("John Starks", ["SG", "PG"], 12.5, 2.5, 3.6, 1.2, 0.2),
    ],
    "Indiana Pacers": [
      p("Reggie Miller", ["SG"], 18.2, 3.0, 3.0, 1.1, 0.2),
      p("Rik Smits", ["C"], 14.8, 6.1, 1.5, 0.5, 1.2),
    ],
  },

  "2000s": {
    "Los Angeles Lakers": [
      p("Kobe Bryant", ["SG"], 25.0, 5.2, 4.7, 1.4, 0.5),
      p("Shaquille O'Neal", ["C"], 23.7, 10.9, 2.5, 0.6, 2.3),
      p("Pau Gasol", ["PF", "C"], 17.0, 9.2, 3.2, 0.5, 1.6),
      p("Lamar Odom", ["PF", "SF"], 13.3, 8.4, 3.7, 1.0, 0.9),
    ],
    "San Antonio Spurs": [
      p("Tim Duncan", ["PF", "C"], 19.0, 10.8, 3.0, 0.7, 2.2),
      p("Tony Parker", ["PG"], 15.5, 2.7, 5.6, 0.8, 0.1),
      p("Manu Ginobili", ["SG"], 13.3, 3.5, 3.8, 1.3, 0.3),
    ],
    "Cleveland Cavaliers": [
      p("LeBron James", ["SF", "PG"], 27.8, 7.0, 6.9, 1.7, 0.9),
      p("Zydrunas Ilgauskas", ["C"], 13.0, 7.7, 1.3, 0.5, 1.6),
    ],
    "Miami Heat": [
      p("Dwyane Wade", ["SG"], 24.7, 4.9, 6.4, 1.8, 1.0),
      p("Shaquille O'Neal", ["C"], 19.6, 9.0, 2.4, 0.5, 1.9),
      p("Alonzo Mourning", ["C"], 10.0, 6.0, 0.5, 0.4, 2.2),
    ],
    "Dallas Mavericks": [
      p("Dirk Nowitzki", ["PF"], 20.7, 7.5, 2.4, 0.8, 0.8),
      p("Jason Kidd", ["PG"], 12.6, 6.3, 8.7, 1.9, 0.3),
      p("Michael Finley", ["SG", "SF"], 15.7, 4.4, 3.0, 1.0, 0.3),
    ],
    "Phoenix Suns": [
      p("Steve Nash", ["PG"], 14.3, 3.0, 8.5, 0.7, 0.1),
      p("Amar'e Stoudemire", ["PF", "C"], 21.4, 8.8, 1.2, 0.8, 1.3),
      p("Shawn Marion", ["SF", "PF"], 15.2, 8.7, 1.9, 1.5, 1.1),
    ],
    "Detroit Pistons": [
      p("Chauncey Billups", ["PG"], 15.2, 2.9, 5.4, 1.0, 0.2),
      p("Richard Hamilton", ["SG"], 17.1, 3.1, 3.4, 0.9, 0.2),
      p("Ben Wallace", ["C"], 5.7, 9.6, 1.3, 1.3, 2.0),
      p("Rasheed Wallace", ["PF", "C"], 14.4, 6.7, 1.8, 0.9, 1.3),
    ],
    "Boston Celtics": [
      p("Paul Pierce", ["SF"], 19.7, 5.6, 3.5, 1.3, 0.6),
      p("Kevin Garnett", ["PF", "C"], 17.8, 10.0, 3.7, 1.3, 1.4),
      p("Ray Allen", ["SG"], 18.9, 4.1, 3.4, 1.1, 0.2),
      p("Rajon Rondo", ["PG"], 10.6, 4.6, 8.5, 1.8, 0.1),
    ],
    "Denver Nuggets": [
      p("Carmelo Anthony", ["SF"], 24.8, 6.2, 3.1, 1.1, 0.5),
      p("Allen Iverson", ["PG", "SG"], 26.7, 3.7, 6.2, 2.2, 0.2),
    ],
  },

  "2010s": {
    "Golden State Warriors": [
      p("Stephen Curry", ["PG"], 24.6, 4.7, 6.4, 1.6, 0.2),
      p("Klay Thompson", ["SG"], 19.5, 3.5, 2.3, 0.8, 0.5),
      p("Draymond Green", ["PF", "C"], 8.7, 7.0, 5.6, 1.4, 0.9),
      p("Kevin Durant", ["SF", "PF"], 27.0, 7.1, 5.4, 0.7, 1.1),
    ],
    "Miami Heat": [
      p("LeBron James", ["SF"], 26.9, 7.6, 6.7, 1.6, 0.8),
      p("Dwyane Wade", ["SG"], 22.1, 4.6, 5.3, 1.5, 0.8),
      p("Chris Bosh", ["PF", "C"], 18.0, 7.9, 1.9, 0.8, 0.9),
    ],
    "Oklahoma City Thunder": [
      p("Kevin Durant", ["SF"], 28.2, 7.3, 4.1, 1.2, 1.0),
      p("Russell Westbrook", ["PG"], 23.0, 7.4, 8.4, 1.7, 0.3),
      p("James Harden", ["SG"], 16.8, 4.1, 3.7, 1.5, 0.4),
    ],
    "Cleveland Cavaliers": [
      p("LeBron James", ["SF", "PG"], 26.0, 8.0, 8.0, 1.4, 0.6),
      p("Kyrie Irving", ["PG"], 22.8, 3.8, 5.7, 1.3, 0.4),
      p("Kevin Love", ["PF", "C"], 17.6, 10.4, 2.3, 0.8, 0.4),
    ],
    "San Antonio Spurs": [
      p("Kawhi Leonard", ["SF"], 19.9, 6.4, 2.9, 1.8, 0.7),
      p("Tony Parker", ["PG"], 15.0, 2.6, 5.6, 0.7, 0.1),
      p("LaMarcus Aldridge", ["PF", "C"], 19.4, 8.2, 2.0, 0.6, 1.0),
    ],
    "Houston Rockets": [
      p("James Harden", ["SG", "PG"], 29.0, 6.0, 7.5, 1.7, 0.5),
      p("Chris Paul", ["PG"], 18.7, 4.5, 9.4, 2.2, 0.1),
      p("Dwight Howard", ["C"], 15.8, 12.7, 1.4, 0.8, 1.8),
    ],
    "Los Angeles Clippers": [
      p("Chris Paul", ["PG"], 18.7, 4.0, 9.8, 2.3, 0.1),
      p("Blake Griffin", ["PF"], 21.5, 8.9, 4.2, 0.9, 0.5),
      p("DeAndre Jordan", ["C"], 9.5, 10.7, 0.9, 0.6, 1.8),
    ],
    "New Orleans Pelicans": [
      p("Anthony Davis", ["PF", "C"], 23.9, 10.4, 2.4, 1.3, 2.3),
      p("Jrue Holiday", ["PG", "SG"], 16.5, 4.5, 6.6, 1.6, 0.6),
    ],
    "Portland Trail Blazers": [
      p("Damian Lillard", ["PG"], 25.1, 4.2, 6.7, 1.0, 0.3),
      p("CJ McCollum", ["SG"], 20.0, 3.5, 3.4, 0.9, 0.5),
    ],
  },

  "2020s": {
    "Denver Nuggets": [
      p("Nikola Jokic", ["C"], 21.6, 11.0, 7.2, 1.3, 0.7),
      p("Jamal Murray", ["PG"], 18.5, 4.1, 5.4, 1.1, 0.3),
      p("Aaron Gordon", ["PF", "SF"], 14.5, 6.0, 3.0, 0.8, 0.6),
    ],
    "Milwaukee Bucks": [
      p("Giannis Antetokounmpo", ["PF", "SF"], 29.5, 11.5, 5.9, 1.1, 1.1),
      p("Damian Lillard", ["PG"], 24.6, 4.4, 7.0, 1.0, 0.3),
      p("Khris Middleton", ["SF", "SG"], 18.5, 5.0, 4.8, 1.2, 0.3),
    ],
    "Los Angeles Lakers": [
      p("LeBron James", ["SF", "PG"], 26.5, 8.0, 8.2, 1.1, 0.6),
      p("Anthony Davis", ["PF", "C"], 24.5, 10.5, 2.9, 1.2, 2.3),
    ],
    "Golden State Warriors": [
      p("Stephen Curry", ["PG"], 27.5, 5.0, 6.2, 1.0, 0.3),
      p("Klay Thompson", ["SG"], 19.0, 3.8, 2.4, 0.7, 0.5),
      p("Draymond Green", ["PF", "C"], 8.0, 7.2, 6.5, 1.2, 0.8),
    ],
    "Dallas Mavericks": [
      p("Luka Doncic", ["PG", "SG"], 28.6, 8.7, 8.3, 1.4, 0.5),
      p("Kyrie Irving", ["PG", "SG"], 24.5, 4.8, 5.2, 1.3, 0.6),
    ],
    "Philadelphia 76ers": [
      p("Joel Embiid", ["C"], 27.9, 11.2, 3.7, 1.0, 1.7),
      p("James Harden", ["PG", "SG"], 21.0, 6.1, 10.7, 1.2, 0.5),
      p("Tyrese Maxey", ["PG", "SG"], 20.0, 3.3, 5.0, 0.9, 0.4),
    ],
    "Boston Celtics": [
      p("Jayson Tatum", ["SF", "PF"], 26.9, 8.1, 4.6, 1.0, 0.7),
      p("Jaylen Brown", ["SG", "SF"], 23.0, 5.5, 3.3, 1.1, 0.4),
      p("Kristaps Porzingis", ["C", "PF"], 19.5, 7.2, 2.0, 0.7, 1.9),
    ],
    "Phoenix Suns": [
      p("Kevin Durant", ["SF", "PF"], 27.1, 6.6, 5.0, 0.7, 1.2),
      p("Devin Booker", ["SG", "PG"], 26.5, 4.6, 6.5, 1.0, 0.3),
    ],
    "Oklahoma City Thunder": [
      p("Shai Gilgeous-Alexander", ["PG", "SG"], 27.5, 5.0, 6.0, 1.8, 0.9),
      p("Chet Holmgren", ["C", "PF"], 16.5, 7.9, 2.4, 0.6, 2.3),
      p("Jalen Williams", ["SF", "SG"], 18.0, 4.5, 4.5, 1.3, 0.6),
    ],
    "Memphis Grizzlies": [
      p("Ja Morant", ["PG"], 22.4, 5.7, 7.4, 1.0, 0.3),
      p("Jaren Jackson Jr.", ["PF", "C"], 18.0, 5.8, 1.5, 1.0, 2.3),
    ],
  },
};

/*
 * DataProvider — the single seam between the game and its data source.
 * Today it serves the baked-in ROSTERS above. To use a live API later,
 * replace the body of these methods with fetch() calls returning the same
 * shapes; the rest of the game never has to change.
 */
const DataProvider = {
  async getDecades() {
    return DECADES.filter((d) => Object.keys(ROSTERS[d] || {}).length > 0);
  },
  async getTeams(decade) {
    return Object.keys(ROSTERS[decade] || {});
  },
  async getRoster(decade, team) {
    return (ROSTERS[decade] && ROSTERS[decade][team]) || [];
  },
};
