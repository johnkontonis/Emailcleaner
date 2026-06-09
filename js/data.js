/*
 * 82-0 — Player dataset
 *
 * A curated roster of NBA players grouped by decade and franchise.
 * Stats are approximate career per-game averages:
 *   ppg = points, rpg = rebounds, apg = assists, spg = steals, bpg = blocks
 *
 * Steals/blocks were not officially tracked before the 1973-74 season, so for
 * earlier players those values are fair estimates (per the original game's
 * "missing defensive stats from older eras are estimated" rule).
 *
 * The whole dataset is exposed through a small async provider interface
 * (see DataProvider at the bottom) so it can later be swapped for a live API
 * without touching the game logic. scripts/build_dataset.py can rewrite the
 * per-game numbers here with verified career stats from nba_api.
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
      p("Guy Rodgers", ["PG"], 11.7, 4.3, 7.8, 1.4, 0.1),
      p("Al Attles", ["PG", "SG"], 8.9, 3.9, 3.5, 1.2, 0.2),
      p("Wayne Hightower", ["PF", "SF"], 13.5, 8.7, 1.4, 0.7, 0.5),
    ],
    "Boston Celtics": [
      p("Bill Russell", ["C"], 15.1, 22.5, 4.3, 1.4, 3.6),
      p("Bob Cousy", ["PG"], 18.4, 5.2, 7.5, 1.6, 0.1),
      p("John Havlicek", ["SF", "SG"], 20.8, 6.3, 4.8, 1.4, 0.3),
      p("Sam Jones", ["SG"], 17.7, 4.9, 2.5, 1.0, 0.2),
      p("K.C. Jones", ["PG"], 7.4, 3.5, 4.3, 1.4, 0.1),
      p("Tom Heinsohn", ["PF", "C"], 18.6, 8.8, 2.0, 0.8, 0.6),
      p("Tom Sanders", ["PF", "SF"], 9.6, 6.3, 1.1, 0.8, 0.6),
      p("Bailey Howell", ["PF"], 18.7, 9.9, 1.8, 0.9, 0.6),
    ],
    "Los Angeles Lakers": [
      p("Jerry West", ["PG", "SG"], 27.0, 5.8, 6.7, 2.6, 0.7),
      p("Elgin Baylor", ["SF", "PF"], 27.4, 13.5, 4.3, 1.4, 0.5),
      p("Gail Goodrich", ["PG", "SG"], 18.6, 3.0, 4.7, 1.1, 0.1),
      p("Rudy LaRusso", ["PF", "SF"], 15.6, 9.4, 2.1, 0.9, 0.5),
      p("Dick Barnett", ["SG"], 15.8, 3.1, 2.9, 1.1, 0.2),
      p("Darrall Imhoff", ["C"], 7.2, 7.4, 1.6, 0.6, 1.0),
    ],
    "Cincinnati Royals": [
      p("Oscar Robertson", ["PG"], 25.7, 7.5, 9.5, 1.8, 0.3),
      p("Jerry Lucas", ["PF", "C"], 17.0, 15.6, 3.3, 0.9, 0.5),
      p("Wayne Embry", ["C"], 12.5, 9.1, 1.6, 0.6, 0.8),
      p("Adrian Smith", ["SG", "PG"], 11.2, 2.7, 2.5, 1.0, 0.1),
      p("Jack Twyman", ["SF", "SG"], 19.2, 6.6, 2.3, 0.9, 0.3),
    ],
    "St. Louis Hawks": [
      p("Bob Pettit", ["PF", "C"], 26.4, 16.2, 3.0, 1.2, 0.8),
      p("Lenny Wilkens", ["PG"], 16.5, 4.7, 6.7, 1.8, 0.2),
      p("Cliff Hagan", ["SF", "PF"], 18.0, 7.0, 2.6, 1.0, 0.3),
      p("Zelmo Beaty", ["C", "PF"], 17.1, 11.4, 1.5, 0.7, 1.1),
      p("Bill Bridges", ["PF"], 11.9, 11.9, 2.6, 1.0, 0.5),
    ],
    "Philadelphia 76ers": [
      p("Wilt Chamberlain", ["C"], 34.7, 23.3, 5.2, 1.5, 3.3),
      p("Hal Greer", ["SG", "PG"], 19.2, 5.0, 4.0, 1.4, 0.2),
      p("Billy Cunningham", ["SF", "PF"], 20.8, 10.4, 4.3, 1.3, 0.4),
      p("Chet Walker", ["SF"], 18.2, 7.1, 2.1, 0.9, 0.3),
      p("Wali Jones", ["PG", "SG"], 11.9, 2.8, 3.5, 1.2, 0.1),
      p("Luke Jackson", ["PF", "C"], 11.8, 9.0, 2.3, 0.8, 0.6),
    ],
    "New York Knicks": [
      p("Willis Reed", ["C", "PF"], 18.7, 12.9, 1.8, 1.0, 1.1),
      p("Walt Bellamy", ["C"], 20.1, 13.7, 2.4, 0.7, 1.4),
      p("Dick McGuire", ["PG"], 8.0, 4.0, 6.3, 1.2, 0.1),
      p("Willie Naulls", ["PF", "SF"], 15.8, 9.0, 1.5, 0.8, 0.4),
    ],
    "Baltimore Bullets": [
      p("Gus Johnson", ["PF", "SF"], 17.1, 12.7, 2.7, 1.3, 1.2),
      p("Earl Monroe", ["SG", "PG"], 23.7, 4.0, 4.2, 1.2, 0.2),
      p("Kevin Loughery", ["SG"], 12.7, 2.4, 2.7, 1.0, 0.1),
      p("Wes Unseld", ["C", "PF"], 13.9, 14.8, 3.9, 1.1, 0.7),
    ],
  },

  "1970s": {
    "Milwaukee Bucks": [
      p("Kareem Abdul-Jabbar", ["C"], 30.4, 15.3, 4.3, 1.1, 3.0),
      p("Oscar Robertson", ["PG"], 16.3, 5.5, 7.5, 1.6, 0.2),
      p("Bob Dandridge", ["SF"], 18.5, 6.8, 3.4, 1.2, 0.5),
      p("Jon McGlocklin", ["SG", "PG"], 12.0, 2.4, 3.2, 0.8, 0.1),
      p("Lucius Allen", ["PG", "SG"], 13.4, 3.2, 4.4, 1.4, 0.2),
    ],
    "Los Angeles Lakers": [
      p("Jerry West", ["PG", "SG"], 22.5, 4.6, 7.5, 2.6, 0.6),
      p("Wilt Chamberlain", ["C"], 17.7, 19.2, 4.1, 1.3, 3.0),
      p("Gail Goodrich", ["PG", "SG"], 22.0, 3.2, 5.0, 1.2, 0.1),
      p("Jim McMillian", ["SF"], 13.8, 5.6, 2.6, 1.0, 0.3),
      p("Happy Hairston", ["PF"], 13.1, 10.3, 1.8, 0.9, 0.6),
      p("Cazzie Russell", ["SF", "SG"], 15.1, 3.8, 2.3, 1.0, 0.2),
    ],
    "New York Knicks": [
      p("Walt Frazier", ["PG", "SG"], 18.9, 5.9, 6.1, 1.9, 0.2),
      p("Willis Reed", ["C"], 18.7, 12.9, 1.8, 1.0, 1.1),
      p("Earl Monroe", ["SG", "PG"], 18.8, 3.0, 3.9, 1.1, 0.1),
      p("Dave DeBusschere", ["PF"], 16.1, 11.0, 2.9, 1.1, 0.6),
      p("Bill Bradley", ["SF"], 12.4, 3.2, 3.4, 0.8, 0.1),
      p("Jerry Lucas", ["PF", "C"], 11.8, 10.0, 3.2, 0.9, 0.5),
      p("Dick Barnett", ["SG"], 11.8, 2.4, 2.6, 1.0, 0.2),
    ],
    "Boston Celtics": [
      p("Dave Cowens", ["C", "PF"], 17.6, 13.6, 3.8, 1.1, 0.9),
      p("John Havlicek", ["SF", "SG"], 20.8, 6.3, 4.8, 1.3, 0.3),
      p("Jo Jo White", ["PG", "SG"], 17.2, 4.0, 4.9, 1.2, 0.2),
      p("Paul Silas", ["PF"], 9.4, 9.9, 2.2, 0.9, 0.5),
      p("Don Nelson", ["PF", "SF"], 11.4, 5.2, 1.8, 0.7, 0.3),
      p("Charlie Scott", ["SG", "PG"], 20.7, 4.0, 4.9, 1.4, 0.3),
    ],
    "Golden State Warriors": [
      p("Rick Barry", ["SF"], 23.2, 6.5, 5.1, 2.0, 0.5),
      p("Nate Thurmond", ["C", "PF"], 15.0, 15.0, 2.7, 1.0, 2.4),
      p("Jamaal Wilkes", ["SF", "PF"], 17.7, 6.2, 2.5, 1.5, 0.4),
      p("Phil Smith", ["SG", "PG"], 14.5, 3.0, 4.2, 1.5, 0.3),
      p("Clifford Ray", ["C"], 8.0, 9.4, 1.9, 0.8, 1.3),
    ],
    "Philadelphia 76ers": [
      p("Julius Erving", ["SF"], 24.2, 8.5, 3.9, 1.8, 1.5),
      p("George McGinnis", ["PF"], 20.2, 11.0, 3.5, 2.0, 0.5),
      p("Doug Collins", ["SG"], 17.9, 3.2, 3.3, 1.2, 0.2),
      p("World B. Free", ["SG", "PG"], 20.3, 2.7, 4.0, 1.0, 0.2),
      p("Caldwell Jones", ["C", "PF"], 8.0, 8.1, 1.5, 0.6, 2.2),
      p("Bobby Jones", ["PF", "SF"], 12.1, 5.5, 2.6, 1.3, 1.4),
    ],
    "Portland Trail Blazers": [
      p("Bill Walton", ["C"], 13.3, 10.5, 3.4, 0.8, 2.2),
      p("Maurice Lucas", ["PF"], 14.6, 9.1, 2.6, 1.0, 0.6),
      p("Lionel Hollins", ["PG", "SG"], 14.2, 3.1, 4.6, 1.9, 0.3),
      p("Bob Gross", ["SF"], 9.4, 4.9, 3.1, 1.3, 0.6),
    ],
    "Washington Bullets": [
      p("Wes Unseld", ["C", "PF"], 10.8, 14.0, 3.9, 1.1, 0.6),
      p("Elvin Hayes", ["PF", "C"], 21.0, 12.5, 1.8, 1.0, 2.0),
      p("Phil Chenier", ["SG"], 17.2, 3.4, 3.0, 1.5, 0.3),
      p("Bob Dandridge", ["SF"], 18.0, 6.0, 3.5, 1.1, 0.4),
    ],
    "Chicago Bulls": [
      p("Bob Love", ["SF", "PF"], 17.6, 6.8, 2.0, 0.9, 0.4),
      p("Jerry Sloan", ["SG", "SF"], 14.0, 7.4, 2.5, 2.2, 0.3),
      p("Norm Van Lier", ["PG"], 11.8, 4.5, 7.0, 2.2, 0.2),
      p("Chet Walker", ["SF"], 19.4, 5.0, 2.4, 0.9, 0.3),
      p("Tom Boerwinkle", ["C"], 7.2, 9.0, 2.6, 0.7, 0.7),
    ],
  },

  "1980s": {
    "Los Angeles Lakers": [
      p("Magic Johnson", ["PG"], 19.5, 7.2, 11.2, 1.9, 0.4),
      p("Kareem Abdul-Jabbar", ["C"], 21.5, 8.7, 3.0, 0.8, 2.4),
      p("James Worthy", ["SF"], 17.6, 5.1, 3.0, 1.1, 0.7),
      p("Byron Scott", ["SG"], 14.1, 3.0, 3.0, 1.2, 0.2),
      p("A.C. Green", ["PF"], 9.6, 7.4, 1.1, 0.8, 0.5),
      p("Michael Cooper", ["SG", "SF"], 8.9, 3.2, 4.2, 1.5, 0.6),
      p("Norm Nixon", ["PG", "SG"], 15.7, 2.4, 7.2, 1.6, 0.1),
      p("Bob McAdoo", ["C", "PF"], 13.0, 5.5, 1.3, 0.5, 1.0),
    ],
    "Boston Celtics": [
      p("Larry Bird", ["SF", "PF"], 24.3, 10.0, 6.3, 1.7, 0.8),
      p("Kevin McHale", ["PF", "C"], 17.9, 7.3, 1.7, 0.4, 1.7),
      p("Robert Parish", ["C"], 14.5, 9.1, 1.4, 0.8, 1.5),
      p("Dennis Johnson", ["PG", "SG"], 14.1, 3.9, 5.0, 1.3, 0.4),
      p("Danny Ainge", ["SG", "PG"], 11.5, 2.7, 4.0, 1.1, 0.1),
      p("Cedric Maxwell", ["PF", "SF"], 12.5, 6.3, 2.5, 1.0, 0.6),
      p("Bill Walton", ["C"], 7.6, 6.8, 2.2, 0.6, 1.3),
    ],
    "Chicago Bulls": [
      p("Michael Jordan", ["SG"], 32.6, 6.0, 5.8, 2.7, 0.9),
      p("Scottie Pippen", ["SF", "SG"], 14.4, 5.6, 4.0, 1.9, 0.8),
      p("Horace Grant", ["PF"], 11.2, 8.2, 2.0, 1.0, 0.9),
      p("Charles Oakley", ["PF"], 11.6, 11.4, 2.5, 1.1, 0.4),
      p("John Paxson", ["PG", "SG"], 8.9, 1.6, 3.7, 0.8, 0.1),
    ],
    "Philadelphia 76ers": [
      p("Julius Erving", ["SF"], 22.0, 6.9, 3.8, 1.7, 1.4),
      p("Moses Malone", ["C"], 24.5, 14.0, 1.4, 0.9, 1.5),
      p("Charles Barkley", ["PF"], 22.1, 11.7, 3.9, 1.5, 0.8),
      p("Maurice Cheeks", ["PG"], 11.1, 2.8, 6.7, 2.3, 0.3),
      p("Andrew Toney", ["SG"], 15.9, 2.3, 4.2, 1.2, 0.2),
      p("Bobby Jones", ["PF", "SF"], 9.5, 4.5, 2.4, 1.2, 1.1),
    ],
    "Detroit Pistons": [
      p("Isiah Thomas", ["PG"], 19.2, 3.6, 9.3, 1.9, 0.3),
      p("Joe Dumars", ["SG"], 16.1, 2.2, 4.5, 0.9, 0.1),
      p("Bill Laimbeer", ["C"], 12.9, 9.7, 2.0, 0.6, 0.5),
      p("Dennis Rodman", ["PF"], 8.8, 11.5, 1.8, 0.8, 0.7),
      p("Adrian Dantley", ["SF"], 24.3, 5.7, 3.0, 1.0, 0.2),
      p("Vinnie Johnson", ["SG", "PG"], 12.0, 3.0, 3.3, 1.0, 0.2),
      p("Rick Mahorn", ["PF", "C"], 7.0, 6.9, 1.0, 0.6, 0.9),
    ],
    "Houston Rockets": [
      p("Hakeem Olajuwon", ["C"], 23.9, 12.1, 2.3, 1.9, 3.4),
      p("Ralph Sampson", ["C", "PF"], 19.0, 10.1, 2.5, 0.9, 1.9),
      p("Robert Reid", ["SF", "PF"], 11.5, 5.0, 3.0, 1.2, 0.5),
      p("Lewis Lloyd", ["SG", "SF"], 14.0, 4.0, 3.4, 1.4, 0.2),
    ],
    "Utah Jazz": [
      p("Karl Malone", ["PF"], 25.0, 10.1, 3.6, 1.4, 0.8),
      p("John Stockton", ["PG"], 13.1, 2.7, 10.5, 2.2, 0.2),
      p("Mark Eaton", ["C"], 6.0, 7.9, 1.0, 0.4, 3.5),
      p("Thurl Bailey", ["PF", "SF"], 14.5, 6.0, 1.6, 0.6, 1.2),
      p("Darrell Griffith", ["SG"], 16.2, 3.1, 2.8, 1.0, 0.3),
    ],
    "Atlanta Hawks": [
      p("Dominique Wilkins", ["SF"], 24.8, 6.7, 2.5, 1.3, 0.6),
      p("Spud Webb", ["PG"], 9.9, 2.2, 5.3, 1.1, 0.1),
      p("Doc Rivers", ["PG", "SG"], 12.8, 3.1, 5.7, 1.9, 0.3),
      p("Kevin Willis", ["PF", "C"], 12.6, 8.4, 1.0, 0.7, 0.9),
      p("Tree Rollins", ["C"], 6.0, 6.5, 0.9, 0.6, 2.5),
    ],
    "Milwaukee Bucks": [
      p("Sidney Moncrief", ["SG", "SF"], 15.6, 4.7, 3.6, 1.2, 0.3),
      p("Terry Cummings", ["PF", "SF"], 18.0, 8.0, 1.9, 1.2, 0.6),
      p("Marques Johnson", ["SF", "PF"], 20.1, 7.0, 3.6, 1.4, 0.6),
      p("Paul Pressey", ["SF", "PG"], 12.0, 4.5, 5.5, 1.7, 0.6),
    ],
    "Phoenix Suns": [
      p("Walter Davis", ["SG", "SF"], 18.9, 3.0, 3.4, 1.3, 0.2),
      p("Larry Nance", ["PF", "C"], 17.1, 8.0, 2.6, 1.0, 2.2),
      p("Kevin Johnson", ["PG"], 17.9, 3.3, 9.1, 1.5, 0.2),
      p("Alvan Adams", ["C", "PF"], 14.1, 7.0, 4.1, 1.3, 0.9),
    ],
  },

  "1990s": {
    "Chicago Bulls": [
      p("Michael Jordan", ["SG"], 30.1, 6.2, 5.3, 2.3, 0.8),
      p("Scottie Pippen", ["SF", "SG"], 17.7, 6.7, 5.6, 2.1, 0.8),
      p("Dennis Rodman", ["PF"], 7.3, 16.7, 2.8, 0.7, 0.5),
      p("Toni Kukoc", ["SF", "PF"], 14.1, 4.5, 4.2, 1.0, 0.4),
      p("Horace Grant", ["PF"], 12.6, 9.0, 2.4, 1.1, 1.0),
      p("B.J. Armstrong", ["PG"], 10.8, 1.9, 3.7, 0.9, 0.1),
      p("Steve Kerr", ["PG", "SG"], 6.0, 1.3, 1.8, 0.7, 0.1),
      p("Ron Harper", ["SG", "PG"], 9.5, 3.5, 3.0, 1.4, 0.4),
    ],
    "Houston Rockets": [
      p("Hakeem Olajuwon", ["C"], 23.5, 11.3, 2.8, 1.7, 3.2),
      p("Clyde Drexler", ["SG", "SF"], 20.4, 6.1, 5.6, 2.0, 0.7),
      p("Robert Horry", ["PF", "SF"], 9.0, 5.5, 2.4, 1.2, 0.9),
      p("Kenny Smith", ["PG"], 12.8, 2.2, 5.6, 1.1, 0.1),
      p("Sam Cassell", ["PG"], 15.7, 3.2, 6.0, 1.4, 0.2),
      p("Otis Thorpe", ["PF", "C"], 14.0, 8.2, 2.0, 0.9, 0.5),
      p("Mario Elie", ["SF", "SG"], 9.9, 3.2, 2.6, 1.0, 0.2),
    ],
    "Utah Jazz": [
      p("Karl Malone", ["PF"], 25.0, 10.1, 3.6, 1.4, 0.8),
      p("John Stockton", ["PG"], 13.1, 2.7, 10.5, 2.2, 0.2),
      p("Jeff Hornacek", ["SG"], 14.5, 3.4, 4.9, 1.4, 0.2),
      p("Bryon Russell", ["SF", "SG"], 10.0, 4.0, 1.6, 1.4, 0.4),
      p("Greg Ostertag", ["C"], 5.0, 6.7, 0.5, 0.4, 1.8),
    ],
    "Orlando Magic": [
      p("Shaquille O'Neal", ["C"], 27.2, 12.5, 2.9, 0.9, 2.6),
      p("Penny Hardaway", ["PG", "SG"], 19.0, 4.5, 6.3, 2.0, 0.6),
      p("Nick Anderson", ["SG", "SF"], 15.4, 5.5, 3.0, 1.5, 0.4),
      p("Dennis Scott", ["SF", "SG"], 12.8, 3.0, 2.2, 0.9, 0.3),
      p("Horace Grant", ["PF"], 12.0, 8.5, 2.6, 1.1, 0.9),
    ],
    "San Antonio Spurs": [
      p("David Robinson", ["C"], 21.1, 10.6, 2.5, 1.4, 3.0),
      p("Tim Duncan", ["PF", "C"], 21.9, 12.2, 2.9, 0.7, 2.6),
      p("Sean Elliott", ["SF"], 14.2, 4.3, 2.6, 0.9, 0.4),
      p("Avery Johnson", ["PG"], 8.9, 2.1, 5.5, 1.2, 0.1),
      p("Mario Elie", ["SG", "SF"], 10.0, 3.5, 2.8, 1.1, 0.2),
    ],
    "Seattle SuperSonics": [
      p("Gary Payton", ["PG"], 16.3, 3.9, 6.7, 1.8, 0.2),
      p("Shawn Kemp", ["PF", "C"], 14.6, 8.4, 1.7, 1.1, 1.2),
      p("Detlef Schrempf", ["SF", "PF"], 13.9, 6.2, 3.4, 1.0, 0.4),
      p("Hersey Hawkins", ["SG"], 14.0, 3.6, 2.8, 1.7, 0.3),
      p("Nate McMillan", ["PG", "SG"], 5.9, 4.0, 6.1, 2.0, 0.4),
    ],
    "Phoenix Suns": [
      p("Charles Barkley", ["PF"], 23.0, 11.5, 4.1, 1.5, 0.7),
      p("Kevin Johnson", ["PG"], 17.9, 3.3, 9.1, 1.5, 0.2),
      p("Dan Majerle", ["SG", "SF"], 12.8, 4.5, 3.4, 1.4, 0.4),
      p("Tom Chambers", ["PF", "SF"], 16.5, 6.0, 2.0, 0.8, 0.6),
      p("Jason Kidd", ["PG"], 12.0, 5.5, 8.5, 1.9, 0.3),
    ],
    "New York Knicks": [
      p("Patrick Ewing", ["C"], 21.0, 9.8, 1.9, 1.0, 2.4),
      p("John Starks", ["SG", "PG"], 12.5, 2.5, 3.6, 1.2, 0.2),
      p("Charles Oakley", ["PF"], 9.0, 9.8, 2.5, 1.3, 0.3),
      p("Allan Houston", ["SG"], 17.0, 2.8, 2.7, 0.8, 0.2),
      p("Larry Johnson", ["PF", "SF"], 14.0, 6.5, 3.0, 0.9, 0.3),
      p("Anthony Mason", ["PF", "SF"], 10.9, 8.3, 3.1, 0.8, 0.4),
    ],
    "Indiana Pacers": [
      p("Reggie Miller", ["SG"], 18.2, 3.0, 3.0, 1.1, 0.2),
      p("Rik Smits", ["C"], 14.8, 6.1, 1.5, 0.5, 1.2),
      p("Mark Jackson", ["PG"], 9.6, 4.0, 8.0, 1.4, 0.1),
      p("Dale Davis", ["PF", "C"], 8.5, 8.8, 1.0, 0.7, 1.3),
      p("Antonio Davis", ["PF", "C"], 9.5, 7.5, 0.9, 0.5, 1.2),
    ],
    "Los Angeles Lakers": [
      p("Shaquille O'Neal", ["C"], 26.0, 11.8, 3.1, 0.6, 2.4),
      p("Kobe Bryant", ["SG", "SF"], 19.9, 4.6, 3.8, 1.4, 0.6),
      p("Eddie Jones", ["SG", "SF"], 15.0, 3.8, 3.2, 2.0, 0.6),
      p("Nick Van Exel", ["PG"], 14.4, 3.0, 7.0, 1.2, 0.1),
      p("Robert Horry", ["PF", "SF"], 7.5, 5.0, 2.5, 1.1, 1.0),
    ],
  },

  "2000s": {
    "Los Angeles Lakers": [
      p("Kobe Bryant", ["SG"], 25.0, 5.2, 4.7, 1.4, 0.5),
      p("Shaquille O'Neal", ["C"], 23.7, 10.9, 2.5, 0.6, 2.3),
      p("Pau Gasol", ["PF", "C"], 17.0, 9.2, 3.2, 0.5, 1.6),
      p("Lamar Odom", ["PF", "SF"], 13.3, 8.4, 3.7, 1.0, 0.9),
      p("Derek Fisher", ["PG"], 8.3, 2.1, 3.0, 1.0, 0.1),
      p("Robert Horry", ["PF"], 6.5, 4.5, 2.0, 1.0, 0.9),
      p("Andrew Bynum", ["C"], 11.5, 7.7, 1.2, 0.3, 1.6),
    ],
    "San Antonio Spurs": [
      p("Tim Duncan", ["PF", "C"], 19.0, 10.8, 3.0, 0.7, 2.2),
      p("Tony Parker", ["PG"], 15.5, 2.7, 5.6, 0.8, 0.1),
      p("Manu Ginobili", ["SG"], 13.3, 3.5, 3.8, 1.3, 0.3),
      p("David Robinson", ["C"], 12.0, 8.0, 1.7, 1.0, 2.0),
      p("Bruce Bowen", ["SF"], 6.1, 2.9, 1.6, 0.9, 0.4),
      p("Robert Horry", ["PF"], 5.0, 4.0, 1.5, 0.9, 0.7),
    ],
    "Cleveland Cavaliers": [
      p("LeBron James", ["SF", "PG"], 27.8, 7.0, 6.9, 1.7, 0.9),
      p("Zydrunas Ilgauskas", ["C"], 13.0, 7.7, 1.3, 0.5, 1.6),
      p("Mo Williams", ["PG"], 13.2, 2.9, 4.9, 0.9, 0.1),
      p("Anderson Varejao", ["PF", "C"], 7.5, 7.0, 1.2, 0.9, 0.7),
      p("Larry Hughes", ["SG", "PG"], 14.0, 4.0, 4.0, 1.8, 0.4),
    ],
    "Miami Heat": [
      p("Dwyane Wade", ["SG"], 24.7, 4.9, 6.4, 1.8, 1.0),
      p("Shaquille O'Neal", ["C"], 19.6, 9.0, 2.4, 0.5, 1.9),
      p("Alonzo Mourning", ["C"], 10.0, 6.0, 0.5, 0.4, 2.2),
      p("Udonis Haslem", ["PF"], 8.0, 7.0, 1.0, 0.6, 0.3),
      p("Eddie Jones", ["SG", "SF"], 13.5, 3.5, 2.7, 1.6, 0.6),
    ],
    "Dallas Mavericks": [
      p("Dirk Nowitzki", ["PF"], 20.7, 7.5, 2.4, 0.8, 0.8),
      p("Jason Kidd", ["PG"], 12.6, 6.3, 8.7, 1.9, 0.3),
      p("Michael Finley", ["SG", "SF"], 15.7, 4.4, 3.0, 1.0, 0.3),
      p("Steve Nash", ["PG"], 15.6, 3.0, 7.3, 0.8, 0.1),
      p("Josh Howard", ["SF", "SG"], 14.5, 5.5, 1.8, 1.2, 0.6),
      p("Jason Terry", ["SG", "PG"], 15.0, 2.5, 4.0, 1.3, 0.2),
    ],
    "Phoenix Suns": [
      p("Steve Nash", ["PG"], 14.3, 3.0, 8.5, 0.7, 0.1),
      p("Amar'e Stoudemire", ["PF", "C"], 21.4, 8.8, 1.2, 0.8, 1.3),
      p("Shawn Marion", ["SF", "PF"], 15.2, 8.7, 1.9, 1.5, 1.1),
      p("Joe Johnson", ["SG", "SF"], 16.0, 4.0, 4.0, 1.0, 0.2),
      p("Raja Bell", ["SG"], 11.0, 3.0, 2.2, 1.2, 0.3),
    ],
    "Detroit Pistons": [
      p("Chauncey Billups", ["PG"], 15.2, 2.9, 5.4, 1.0, 0.2),
      p("Richard Hamilton", ["SG"], 17.1, 3.1, 3.4, 0.9, 0.2),
      p("Ben Wallace", ["C"], 5.7, 9.6, 1.3, 1.3, 2.0),
      p("Rasheed Wallace", ["PF", "C"], 14.4, 6.7, 1.8, 0.9, 1.3),
      p("Tayshaun Prince", ["SF"], 12.0, 4.5, 2.6, 0.8, 0.6),
    ],
    "Boston Celtics": [
      p("Paul Pierce", ["SF"], 19.7, 5.6, 3.5, 1.3, 0.6),
      p("Kevin Garnett", ["PF", "C"], 17.8, 10.0, 3.7, 1.3, 1.4),
      p("Ray Allen", ["SG"], 18.9, 4.1, 3.4, 1.1, 0.2),
      p("Rajon Rondo", ["PG"], 10.6, 4.6, 8.5, 1.8, 0.1),
      p("Kendrick Perkins", ["C"], 6.0, 6.0, 1.0, 0.4, 1.4),
    ],
    "Denver Nuggets": [
      p("Carmelo Anthony", ["SF"], 24.8, 6.2, 3.1, 1.1, 0.5),
      p("Allen Iverson", ["PG", "SG"], 26.7, 3.7, 6.2, 2.2, 0.2),
      p("Marcus Camby", ["C", "PF"], 9.5, 9.8, 1.8, 1.1, 2.5),
      p("Chauncey Billups", ["PG"], 17.0, 3.0, 6.0, 1.1, 0.2),
      p("Kenyon Martin", ["PF"], 12.0, 7.0, 1.8, 1.0, 1.0),
    ],
    "Orlando Magic": [
      p("Dwight Howard", ["C"], 15.7, 11.8, 1.4, 0.9, 1.8),
      p("Tracy McGrady", ["SG", "SF"], 28.0, 6.5, 5.5, 1.5, 0.9),
      p("Hedo Turkoglu", ["SF", "PF"], 13.0, 4.5, 3.5, 0.9, 0.3),
      p("Jameer Nelson", ["PG"], 12.0, 3.0, 5.0, 1.0, 0.1),
      p("Rashard Lewis", ["SF", "PF"], 16.0, 5.5, 2.0, 1.0, 0.5),
    ],
  },

  "2010s": {
    "Golden State Warriors": [
      p("Stephen Curry", ["PG"], 24.6, 4.7, 6.4, 1.6, 0.2),
      p("Klay Thompson", ["SG"], 19.5, 3.5, 2.3, 0.8, 0.5),
      p("Draymond Green", ["PF", "C"], 8.7, 7.0, 5.6, 1.4, 0.9),
      p("Kevin Durant", ["SF", "PF"], 27.0, 7.1, 5.4, 0.7, 1.1),
      p("Andre Iguodala", ["SF", "SG"], 7.8, 4.0, 3.4, 1.1, 0.5),
      p("Andrew Bogut", ["C"], 6.0, 8.0, 2.2, 0.6, 1.6),
      p("Harrison Barnes", ["SF", "PF"], 11.0, 4.5, 1.4, 0.7, 0.3),
    ],
    "Miami Heat": [
      p("LeBron James", ["SF"], 26.9, 7.6, 6.7, 1.6, 0.8),
      p("Dwyane Wade", ["SG"], 22.1, 4.6, 5.3, 1.5, 0.8),
      p("Chris Bosh", ["PF", "C"], 18.0, 7.9, 1.9, 0.8, 0.9),
      p("Ray Allen", ["SG"], 10.9, 2.7, 2.0, 0.8, 0.1),
      p("Mario Chalmers", ["PG"], 8.5, 2.5, 3.5, 1.5, 0.2),
      p("Udonis Haslem", ["PF", "C"], 6.0, 6.0, 0.8, 0.5, 0.3),
    ],
    "Oklahoma City Thunder": [
      p("Kevin Durant", ["SF"], 28.2, 7.3, 4.1, 1.2, 1.0),
      p("Russell Westbrook", ["PG"], 23.0, 7.4, 8.4, 1.7, 0.3),
      p("James Harden", ["SG"], 16.8, 4.1, 3.7, 1.5, 0.4),
      p("Serge Ibaka", ["PF", "C"], 12.0, 7.5, 0.5, 0.5, 2.4),
      p("Paul George", ["SF", "SG"], 21.0, 6.5, 3.5, 1.9, 0.4),
      p("Steven Adams", ["C"], 9.0, 7.5, 1.2, 1.0, 1.0),
    ],
    "Cleveland Cavaliers": [
      p("LeBron James", ["SF", "PG"], 26.0, 8.0, 8.0, 1.4, 0.6),
      p("Kyrie Irving", ["PG"], 22.8, 3.8, 5.7, 1.3, 0.4),
      p("Kevin Love", ["PF", "C"], 17.6, 10.4, 2.3, 0.8, 0.4),
      p("Tristan Thompson", ["C", "PF"], 9.0, 8.5, 0.6, 0.5, 0.7),
      p("J.R. Smith", ["SG"], 12.5, 3.0, 2.0, 1.0, 0.2),
    ],
    "San Antonio Spurs": [
      p("Kawhi Leonard", ["SF"], 19.9, 6.4, 2.9, 1.8, 0.7),
      p("Tony Parker", ["PG"], 15.0, 2.6, 5.6, 0.7, 0.1),
      p("Tim Duncan", ["PF", "C"], 14.0, 9.5, 2.5, 0.7, 1.8),
      p("LaMarcus Aldridge", ["PF", "C"], 19.4, 8.2, 2.0, 0.6, 1.0),
      p("Manu Ginobili", ["SG"], 11.0, 3.0, 4.0, 1.2, 0.3),
      p("Danny Green", ["SG", "SF"], 9.0, 3.5, 1.7, 1.2, 0.8),
    ],
    "Houston Rockets": [
      p("James Harden", ["SG", "PG"], 29.0, 6.0, 7.5, 1.7, 0.5),
      p("Chris Paul", ["PG"], 18.7, 4.5, 9.4, 2.2, 0.1),
      p("Dwight Howard", ["C"], 15.8, 12.7, 1.4, 0.8, 1.8),
      p("Clint Capela", ["C"], 12.0, 10.0, 1.0, 0.7, 1.6),
      p("Trevor Ariza", ["SF"], 11.0, 5.0, 2.5, 1.6, 0.3),
      p("Eric Gordon", ["SG", "PG"], 16.0, 2.3, 2.8, 0.6, 0.3),
    ],
    "Los Angeles Clippers": [
      p("Chris Paul", ["PG"], 18.7, 4.0, 9.8, 2.3, 0.1),
      p("Blake Griffin", ["PF"], 21.5, 8.9, 4.2, 0.9, 0.5),
      p("DeAndre Jordan", ["C"], 9.5, 10.7, 0.9, 0.6, 1.8),
      p("J.J. Redick", ["SG"], 15.0, 2.0, 2.0, 0.6, 0.1),
      p("Jamal Crawford", ["SG", "PG"], 15.0, 2.0, 3.4, 0.9, 0.2),
    ],
    "Toronto Raptors": [
      p("Kawhi Leonard", ["SF"], 26.6, 7.3, 3.3, 1.8, 0.4),
      p("Kyle Lowry", ["PG"], 16.0, 4.6, 6.8, 1.5, 0.4),
      p("DeMar DeRozan", ["SG", "SF"], 20.0, 4.0, 3.0, 1.0, 0.3),
      p("Pascal Siakam", ["PF", "SF"], 15.0, 6.5, 3.0, 0.9, 0.7),
      p("Serge Ibaka", ["C", "PF"], 13.0, 7.0, 0.8, 0.4, 1.4),
    ],
    "New Orleans Pelicans": [
      p("Anthony Davis", ["PF", "C"], 23.9, 10.4, 2.4, 1.3, 2.3),
      p("Jrue Holiday", ["PG", "SG"], 16.5, 4.5, 6.6, 1.6, 0.6),
      p("DeMarcus Cousins", ["C"], 21.0, 11.0, 3.2, 1.4, 1.3),
      p("Brandon Ingram", ["SF", "SG"], 18.0, 5.5, 3.5, 0.8, 0.6),
    ],
    "Portland Trail Blazers": [
      p("Damian Lillard", ["PG"], 25.1, 4.2, 6.7, 1.0, 0.3),
      p("CJ McCollum", ["SG"], 20.0, 3.5, 3.4, 0.9, 0.5),
      p("LaMarcus Aldridge", ["PF", "C"], 21.0, 9.0, 2.0, 0.7, 1.0),
      p("Jusuf Nurkic", ["C"], 14.0, 9.0, 2.5, 0.9, 1.3),
    ],
  },

  "2020s": {
    "Denver Nuggets": [
      p("Nikola Jokic", ["C"], 21.6, 11.0, 7.2, 1.3, 0.7),
      p("Jamal Murray", ["PG"], 18.5, 4.1, 5.4, 1.1, 0.3),
      p("Aaron Gordon", ["PF", "SF"], 14.5, 6.0, 3.0, 0.8, 0.6),
      p("Michael Porter Jr.", ["SF", "PF"], 16.0, 7.0, 1.5, 0.7, 0.5),
      p("Kentavious Caldwell-Pope", ["SG"], 12.0, 2.8, 2.5, 1.3, 0.3),
    ],
    "Milwaukee Bucks": [
      p("Giannis Antetokounmpo", ["PF", "SF"], 29.5, 11.5, 5.9, 1.1, 1.1),
      p("Damian Lillard", ["PG"], 24.6, 4.4, 7.0, 1.0, 0.3),
      p("Khris Middleton", ["SF", "SG"], 18.5, 5.0, 4.8, 1.2, 0.3),
      p("Brook Lopez", ["C"], 14.0, 5.5, 1.5, 0.6, 2.4),
      p("Jrue Holiday", ["PG", "SG"], 17.0, 4.8, 6.5, 1.6, 0.7),
    ],
    "Los Angeles Lakers": [
      p("LeBron James", ["SF", "PG"], 26.5, 8.0, 8.2, 1.1, 0.6),
      p("Anthony Davis", ["PF", "C"], 24.5, 10.5, 2.9, 1.2, 2.3),
      p("Austin Reaves", ["SG", "PG"], 14.0, 4.0, 5.0, 0.9, 0.3),
      p("D'Angelo Russell", ["PG", "SG"], 17.0, 3.0, 6.0, 1.0, 0.3),
      p("Rui Hachimura", ["PF", "SF"], 13.0, 4.5, 1.2, 0.5, 0.4),
    ],
    "Golden State Warriors": [
      p("Stephen Curry", ["PG"], 27.5, 5.0, 6.2, 1.0, 0.3),
      p("Klay Thompson", ["SG"], 19.0, 3.8, 2.4, 0.7, 0.5),
      p("Draymond Green", ["PF", "C"], 8.0, 7.2, 6.5, 1.2, 0.8),
      p("Andrew Wiggins", ["SF", "SG"], 17.0, 4.5, 2.3, 1.0, 0.7),
      p("Jonathan Kuminga", ["PF", "SF"], 14.0, 4.5, 2.0, 0.7, 0.5),
    ],
    "Dallas Mavericks": [
      p("Luka Doncic", ["PG", "SG"], 28.6, 8.7, 8.3, 1.4, 0.5),
      p("Kyrie Irving", ["PG", "SG"], 24.5, 4.8, 5.2, 1.3, 0.6),
      p("Dereck Lively II", ["C"], 9.0, 7.5, 1.5, 0.6, 1.4),
      p("P.J. Washington", ["PF", "SF"], 13.0, 6.0, 2.0, 0.9, 0.8),
      p("Daniel Gafford", ["C"], 11.0, 7.0, 1.2, 0.6, 1.8),
    ],
    "Philadelphia 76ers": [
      p("Joel Embiid", ["C"], 27.9, 11.2, 3.7, 1.0, 1.7),
      p("James Harden", ["PG", "SG"], 21.0, 6.1, 10.7, 1.2, 0.5),
      p("Tyrese Maxey", ["PG", "SG"], 20.0, 3.3, 5.0, 0.9, 0.4),
      p("Tobias Harris", ["PF", "SF"], 17.0, 6.5, 3.0, 0.9, 0.6),
      p("Paul George", ["SF", "SG"], 22.0, 6.0, 4.0, 1.7, 0.4),
    ],
    "Boston Celtics": [
      p("Jayson Tatum", ["SF", "PF"], 26.9, 8.1, 4.6, 1.0, 0.7),
      p("Jaylen Brown", ["SG", "SF"], 23.0, 5.5, 3.3, 1.1, 0.4),
      p("Kristaps Porzingis", ["C", "PF"], 19.5, 7.2, 2.0, 0.7, 1.9),
      p("Derrick White", ["PG", "SG"], 15.0, 4.0, 5.0, 1.0, 1.0),
      p("Jrue Holiday", ["PG", "SG"], 13.0, 5.0, 5.0, 1.0, 0.7),
      p("Al Horford", ["C", "PF"], 9.0, 6.5, 3.0, 0.7, 1.0),
    ],
    "Phoenix Suns": [
      p("Kevin Durant", ["SF", "PF"], 27.1, 6.6, 5.0, 0.7, 1.2),
      p("Devin Booker", ["SG", "PG"], 26.5, 4.6, 6.5, 1.0, 0.3),
      p("Bradley Beal", ["SG", "PG"], 18.0, 4.0, 5.0, 1.0, 0.5),
      p("Jusuf Nurkic", ["C"], 11.0, 9.0, 3.0, 1.0, 1.0),
    ],
    "Oklahoma City Thunder": [
      p("Shai Gilgeous-Alexander", ["PG", "SG"], 27.5, 5.0, 6.0, 1.8, 0.9),
      p("Chet Holmgren", ["C", "PF"], 16.5, 7.9, 2.4, 0.6, 2.3),
      p("Jalen Williams", ["SF", "SG"], 18.0, 4.5, 4.5, 1.3, 0.6),
      p("Luguentz Dort", ["SG", "SF"], 11.0, 3.5, 1.8, 1.0, 0.4),
      p("Isaiah Hartenstein", ["C"], 9.0, 9.0, 2.5, 0.9, 1.1),
    ],
    "Memphis Grizzlies": [
      p("Ja Morant", ["PG"], 22.4, 5.7, 7.4, 1.0, 0.3),
      p("Jaren Jackson Jr.", ["PF", "C"], 18.0, 5.8, 1.5, 1.0, 2.3),
      p("Desmond Bane", ["SG", "SF"], 18.0, 4.5, 4.0, 1.0, 0.4),
      p("Marcus Smart", ["PG", "SG"], 11.0, 3.0, 5.5, 1.5, 0.4),
    ],
    "Cleveland Cavaliers": [
      p("Donovan Mitchell", ["SG", "PG"], 26.0, 4.5, 5.0, 1.4, 0.4),
      p("Darius Garland", ["PG"], 20.0, 2.8, 7.5, 1.3, 0.1),
      p("Evan Mobley", ["PF", "C"], 16.0, 9.0, 3.0, 0.8, 1.5),
      p("Jarrett Allen", ["C"], 14.0, 10.0, 1.7, 0.8, 1.2),
    ],
    "Minnesota Timberwolves": [
      p("Anthony Edwards", ["SG", "SF"], 25.0, 5.5, 5.0, 1.3, 0.6),
      p("Rudy Gobert", ["C"], 13.0, 12.0, 1.2, 0.7, 2.1),
      p("Karl-Anthony Towns", ["C", "PF"], 22.0, 9.5, 3.5, 0.8, 1.0),
      p("Jaden McDaniels", ["SF", "PF"], 12.0, 4.0, 1.5, 1.0, 0.8),
      p("Mike Conley", ["PG"], 12.0, 2.8, 6.0, 1.2, 0.2),
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
