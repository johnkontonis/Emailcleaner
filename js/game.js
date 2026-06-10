/*
 * 82-0 — game logic and UI controller
 *
 * Flow: 5 rounds. Each round the slot machine locks in a random unused decade
 * and a random franchise from that decade. You pick one player and slot him at
 * an open court position he actually played. One team skip + one era skip per
 * game. After 5 picks the season is simulated into a 0-82 -> 82-0 record.
 */

const TOTAL_ROUNDS = 5;

// Combined 5-man totals that represent an "elite" lineup in each category
// (catScore = 1.0). Anchored to the best totals actually reachable from the
// full dataset, so a strong roster scores like one — not an automatic tank.
const ELITE = { ppg: 120, rpg: 50, apg: 28, spg: 7.5, bpg: 6.5 };
const CATEGORY_LABELS = {
  ppg: "Scoring",
  rpg: "Rebounding",
  apg: "Playmaking",
  spg: "Perimeter Defense",
  bpg: "Rim Protection",
};

const state = {
  mode: "classic", // "classic" | "hoopiq"
  round: 0,
  lineup: {}, // position -> { player, decade, team }
  usedDecades: [],
  current: null, // { decade, team, roster }
  skips: { team: 1, era: 1 },
  spinning: false,
  filter: "", // roster search text
  posFilter: "ALL", // PG/SG/SF/PF/C or ALL
  sort: "ppg", // ppg/rpg/apg/spg/bpg/name
  user: "Dion", // active solo user
  h2h: null, // head-to-head session, when active
  daily: null, // { date, teams: [{decade, team}] } for the daily challenge
};

// ---- DOM helpers -----------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

// ---- Slot machine ----------------------------------------------------------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function rollDecade() {
  const all = await DataProvider.getDecades();
  const available = all.filter((d) => !state.usedDecades.includes(d));
  return pick(available);
}

async function rollTeam(decade, exclude) {
  let teams = await DataProvider.getTeams(decade);
  // Prefer not to re-roll the exact same team on a skip.
  if (exclude && teams.length > 1) teams = teams.filter((t) => t !== exclude);
  return pick(teams);
}

function rosterCanFill(roster, open) {
  return roster.some((pl) => pl.pos.some((p) => open.includes(p)));
}

// Unused decades (excluding the current one) where `team` has a playable
// roster — used by an era skip to keep the team and change only the era.
async function teamDecades(team, open) {
  const all = await DataProvider.getDecades();
  const out = [];
  for (const d of all) {
    if (state.usedDecades.includes(d)) continue;
    if (state.current && d === state.current.decade) continue;
    const roster = await DataProvider.getRoster(d, team);
    if (roster.length && (!open || rosterCanFill(roster, open))) out.push(d);
  }
  return out;
}

// Roll a team + decade. Lock behavior:
//   { decade }            -> team skip: keep the era, change the team
//   { team }              -> era skip: keep the team, change the era
//   {}                    -> fresh round: both random
async function newRoll({ decade, team, excludeTeam } = {}) {
  const open = openPositions();

  // Daily challenge: the five teams are fixed and shared by everyone today.
  if (state.daily) {
    const preset = state.daily.teams[state.round - 1];
    const roster = await DataProvider.getRoster(preset.decade, preset.team);
    state.current = { decade: preset.decade, team: preset.team, roster };
    return state.current;
  }

  // Era skip: keep the team, move it to a different unused era.
  if (team) {
    const decs = await teamDecades(team, open);
    if (decs.length) {
      const d = pick(decs);
      const roster = await DataProvider.getRoster(d, team);
      state.current = { decade: d, team, roster };
      return state.current;
    }
    // No other era has this team — fall through to a normal roll.
  }

  // Try to land on a roll that can actually fill an open slot, so the game
  // never deadlocks when skips are gone. Fall back to whatever we last rolled
  // if (somehow) nothing qualifies after a bounded search.
  let last = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const d = decade || (await rollDecade());
    const t = await rollTeam(d, attempt === 0 ? excludeTeam : null);
    const roster = await DataProvider.getRoster(d, t);
    last = { decade: d, team: t, roster };
    if (rosterCanFill(roster, open)) break;
  }
  state.current = last;
  return state.current;
}

// ---- Simulation ------------------------------------------------------------
function simulate(lineup) {
  const players = Object.values(lineup).map((s) => s.player);
  const totals = { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 };
  for (const pl of players) {
    for (const k of Object.keys(totals)) totals[k] += pl[k];
  }

  // Per-category score, capped a little above 1 so a stacked category can
  // offset a weak one — but every category still has to show up.
  const catScore = {};
  for (const k of Object.keys(totals)) {
    catScore[k] = Math.min(totals[k] / ELITE[k], 1.3);
  }

  // Weighted overall strength. Scoring and playmaking move the needle most,
  // but defense matters — a one-dimensional team won't run the table.
  const weights = { ppg: 0.30, rpg: 0.20, apg: 0.22, spg: 0.14, bpg: 0.14 };
  let strength = 0;
  for (const k of Object.keys(weights)) strength += catScore[k] * weights[k];

  // Map strength onto a 0..82 win curve. Anchored to measured play:
  // a throw-together lineup (strength ~0.37) lands ~10 wins, a balanced
  // effort (~0.61) ~.500, a strong roster (~0.84) ~70, and only a near-elite
  // team (~0.93+) approaches a clean sheet.
  const t = clamp((strength - 0.297) / 0.635, 0, 1);
  let wins = Math.round(82 * t);

  // A perfect season only if the team is elite across the board, not just on
  // average — every category must clear the elite bar.
  const balanced = Object.values(catScore).every((v) => v >= 1.0);
  if (balanced && strength >= 0.95) wins = 82;
  wins = clamp(wins, 0, 82);
  const losses = 82 - wins;

  // Best pick: value scoring plus the things that scale (defense, playmaking).
  let best = players[0];
  const value = (pl) =>
    pl.ppg + pl.rpg * 1.1 + pl.apg * 1.4 + pl.spg * 3 + pl.bpg * 3;
  for (const pl of players) if (value(pl) > value(best)) best = pl;

  // Weakness: the category furthest below the elite bar.
  let weakKey = "ppg";
  for (const k of Object.keys(catScore)) {
    if (catScore[k] < catScore[weakKey]) weakKey = k;
  }

  return {
    wins,
    losses,
    grade: gradeFor(wins),
    blurb: blurbFor(wins),
    bestPick: best,
    weakness: CATEGORY_LABELS[weakKey],
    totals,
    catScore,
    strength,
  };
}

function gradeFor(w) {
  if (w === 82) return "S+";
  if (w >= 74) return "S";
  if (w >= 66) return "A";
  if (w >= 56) return "B";
  if (w >= 45) return "C";
  if (w >= 30) return "D";
  return "F";
}

function blurbFor(w) {
  if (w === 82) return "PERFECT SEASON. Immortality.";
  if (w >= 70) return "An all-time juggernaut.";
  if (w >= 60) return "Championship favorite.";
  if (w >= 50) return "Solid playoff team.";
  if (w >= 40) return "Play-in bound.";
  if (w >= 25) return "Lottery looms.";
  return "Tank commander.";
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- Rendering -------------------------------------------------------------
function render() {
  renderCourt();
  renderStatus();
  renderNeeds();
  renderRoster();
}

// Open-position tracker in the pinned panel, so you always know what you still
// need to fill while scrolling the roster.
function renderNeeds() {
  const node = $("#sm-needs");
  if (!node) return;
  const open = openPositions();
  node.innerHTML =
    `<span class="sm-needs-label">Still need</span>` +
    POSITIONS.map((pos) => {
      const filled = !open.includes(pos);
      return `<span class="need ${filled ? "done" : "open"}">${pos}${filled ? " ✓" : ""}</span>`;
    }).join("");
}

function openPositions() {
  return POSITIONS.filter((pos) => !state.lineup[pos]);
}

function renderCourt() {
  const wrap = $("#court");
  wrap.innerHTML = "";
  for (const pos of POSITIONS) {
    const slot = state.lineup[pos];
    const node = el("div", "slot" + (slot ? " filled" : ""));
    const label = el("div", "slot-pos", pos);
    node.appendChild(label);
    if (slot) {
      const meta = teamMeta(slot.team);
      node.style.borderColor = meta.c1;
      node.style.background = `linear-gradient(180deg, ${hexA(meta.c1, 0.32)} 0%, rgba(0,0,0,0.25) 100%)`;
      node.appendChild(el("div", "slot-logo", teamBadgeHTML(meta)));
      node.appendChild(el("div", "slot-name", slot.player.name));
      node.appendChild(
        el("div", "slot-meta", `${meta.abbr} · ${slot.decade}`)
      );
    } else {
      node.style.borderColor = "";
      node.style.background = "";
      node.appendChild(el("div", "slot-empty", POSITION_NAMES[pos]));
    }
    wrap.appendChild(node);
  }
}

function renderStatus() {
  $("#round-indicator").textContent =
    state.round > TOTAL_ROUNDS
      ? "Season locked in"
      : `Round ${state.round} / ${TOTAL_ROUNDS}`;
  // Skips are off in the daily challenge so everyone faces the same five teams.
  const daily = !!state.daily;
  const skips = $("#skips");
  if (skips) skips.style.display = daily ? "none" : "";
  $("#team-skip").textContent = `Team skip (${state.skips.team})`;
  $("#era-skip").textContent = `Era skip (${state.skips.era})`;
  $("#team-skip").disabled = daily || state.skips.team <= 0 || state.spinning;
  $("#era-skip").disabled = daily || state.skips.era <= 0 || state.spinning;
}

function statLine(pl) {
  if (state.mode === "hoopiq") {
    return `<span class="hidden-stats">Stats hidden — Hoop IQ mode</span>`;
  }
  return `
    <span class="stat"><b>${pl.ppg}</b> PPG</span>
    <span class="stat"><b>${pl.rpg}</b> RPG</span>
    <span class="stat"><b>${pl.apg}</b> APG</span>
    <span class="stat"><b>${pl.spg}</b> SPG</span>
    <span class="stat"><b>${pl.bpg}</b> BPG</span>`;
}

function renderRoster() {
  const list = $("#roster-list");
  list.innerHTML = "";

  if (!state.current || state.round > TOTAL_ROUNDS) {
    const text = $("#reel-text");
    if (text) text.textContent = "—";
    return;
  }

  setReel(state.current.decade, state.current.team);
  const meta = teamMeta(state.current.team);

  const open = openPositions();
  const q = (state.filter || "").trim().toLowerCase();
  const posFilter = state.posFilter || "ALL";
  const sortKey = state.sort || "ppg";

  let roster = state.current.roster.filter(
    (pl) =>
      (!q || pl.name.toLowerCase().includes(q)) &&
      (posFilter === "ALL" || pl.pos.includes(posFilter))
  );

  // Eligible (fits an open slot) first, then by the chosen sort.
  const cmp =
    sortKey === "name"
      ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => b[sortKey] - a[sortKey];
  roster = roster.slice().sort((a, b) => {
    const ae = a.pos.some((p) => open.includes(p)) ? 0 : 1;
    const be = b.pos.some((p) => open.includes(p)) ? 0 : 1;
    return ae - be || cmp(a, b);
  });

  const total = state.current.roster.length;
  const eligibleCount = state.current.roster.filter((pl) =>
    pl.pos.some((p) => open.includes(p))
  ).length;
  const count = $("#roster-count");
  if (count) {
    count.textContent =
      q || posFilter !== "ALL"
        ? `${roster.length} of ${total} shown`
        : `${total} players · ${eligibleCount} fit an open slot`;
  }

  for (const pl of roster) {
    const eligible = pl.pos.filter((p) => open.includes(p));
    const card = el("div", "player-card" + (eligible.length ? "" : " disabled"));
    card.style.setProperty("--team", meta.c1);
    card.innerHTML = `
      <div class="player-head">
        <span class="player-name">${pl.name}</span>
        <span class="player-pos">${pl.pos.join(" / ")}</span>
      </div>
      <div class="player-stats">${statLine(pl)}</div>`;

    if (eligible.length) {
      const actions = el("div", "pick-actions");
      for (const pos of eligible) {
        const btn = el("button", "pick-btn", `Place at ${pos}`);
        btn.addEventListener("click", () => placePlayer(pl, pos));
        actions.appendChild(btn);
      }
      card.appendChild(actions);
    } else {
      card.appendChild(
        el("div", "pick-actions", `<span class="no-slot">No open slot for ${pl.pos.join("/")}</span>`)
      );
    }
    list.appendChild(card);
  }
}

// ---- Actions ---------------------------------------------------------------
function placePlayer(player, pos) {
  if (state.spinning || state.round > TOTAL_ROUNDS) return;
  state.lineup[pos] = {
    player,
    decade: state.current.decade,
    team: state.current.team,
  };
  state.usedDecades.push(state.current.decade);
  nextRound();
}

async function nextRound() {
  state.round += 1;
  if (state.round > TOTAL_ROUNDS) {
    finishGame();
    return;
  }
  // Fresh roster each round — clear any leftover search / filters.
  resetRosterControls();
  await spinTo();
  render();
}

// Paint the slot-machine reel (and game-screen accent) for a team + decade.
function setReel(decade, team) {
  const meta = teamMeta(team);
  const logo = $("#reel-logo");
  const text = $("#reel-text");
  if (text) {
    text.innerHTML = `<span class="reel-decade">${decade}</span> <span class="reel-name">${team}</span>`;
  }
  if (logo) logo.innerHTML = teamBadgeHTML(meta);
  const sm = $("#slot-machine");
  if (sm) {
    sm.style.borderColor = meta.c1;
    // Tint only the image layer so the panel's solid background stays opaque
    // (it's sticky — the roster must not show through it).
    sm.style.backgroundImage = `linear-gradient(100deg, ${hexA(meta.c1, 0.22)} 0%, transparent 55%)`;
  }
}

// A small team mark: real logo if available, else a colored initials badge.
function teamBadgeHTML(meta) {
  if (meta.logo) {
    return `<img class="team-logo" src="${meta.logo}" alt=""
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-badge',textContent:'${meta.abbr}',style:'background:${meta.c1};color:#fff'}))" />`;
  }
  return `<span class="team-badge" style="background:${meta.c1};color:#fff">${meta.abbr}</span>`;
}

// hex (#rrggbb) -> rgba string at the given alpha.
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

async function spinTo(opts = {}) {
  state.spinning = true;
  renderStatus();

  // Clear the roster while the reel rolls — players leave the screen until the
  // new team locks in.
  const list = $("#roster-list");
  if (list) list.innerHTML = "";
  const count = $("#roster-count");
  if (count) count.textContent = "Rolling…";

  const reel = $("#reel-team");
  reel.classList.add("spinning");

  const decades = await DataProvider.getDecades();
  // Honor any lock during the shuffle: a team skip fixes the era, an era skip
  // fixes the team.
  const teamLock = opts.team || null;
  let decadePool = decades;
  if (teamLock) {
    decadePool = await teamDecades(teamLock, null);
    if (!decadePool.length) decadePool = decades;
  }

  const ticks = 12;
  for (let i = 0; i < ticks; i++) {
    const d = opts.decade || pick(decadePool);
    const t = teamLock || pick(await DataProvider.getTeams(d));
    setReel(d, t);
    await sleep(40 + i * 12);
  }

  await newRoll(opts);
  if (state.current) setReel(state.current.decade, state.current.team);
  reel.classList.remove("spinning");
  state.spinning = false;
}

async function teamSkip() {
  if (state.skips.team <= 0 || state.spinning || !state.current) return;
  state.skips.team -= 1;
  // Keep the era, change the team.
  await spinTo({ decade: state.current.decade, excludeTeam: state.current.team });
  render();
}

async function eraSkip() {
  if (state.skips.era <= 0 || state.spinning || !state.current) return;
  state.skips.era -= 1;
  const keptTeam = state.current.team;
  // Keep the team, change the era.
  await spinTo({ team: keptTeam });
  if (state.current.team !== keptTeam) {
    showRollNote(`${keptTeam} has no other open era — rolled a fresh team.`);
  }
  render();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function snapshotLineup() {
  return POSITIONS.map((pos) => {
    const s = state.lineup[pos];
    const meta = teamMeta(s.team);
    return {
      pos,
      name: s.player.name,
      team: s.team,
      abbr: meta.abbr,
      decade: s.decade,
    };
  });
}

function finishGame() {
  const result = simulate(state.lineup);
  if (state.h2h) {
    const who = state.h2h.builder;
    state.h2h.results[who] = {
      wins: result.wins,
      losses: result.losses,
      grade: result.grade,
      strength: Math.round(result.strength * 100),
      totals: result.totals,
      lineup: snapshotLineup(),
    };
    if (who === "Dion") {
      state.h2h.builder = "John";
      showHandoff("Dion");
    } else {
      showH2HResult();
    }
  } else {
    if (state.daily) recordDaily(result);
    showResult(result);
  }
}

// Keep each user's best score for today's daily challenge, for comparison.
function recordDaily(result) {
  const store = loadStore();
  store.daily = store.daily || {};
  const day = (store.daily[state.daily.date] = store.daily[state.daily.date] || {});
  const prev = day[state.user];
  if (!prev || result.wins > prev.wins) {
    day[state.user] = {
      wins: result.wins,
      losses: result.losses,
      grade: result.grade,
      strength: Math.round(result.strength * 100),
    };
  }
  saveStore(store);
}

// ---- Result screen ---------------------------------------------------------
let lastResult = null;

function showResult(r) {
  $("#game-screen").classList.add("hidden");
  const screen = $("#result-screen");
  screen.classList.remove("hidden");

  const perfect = r.wins === 82;
  // Wins green, losses red (or a single gold gradient for a perfect season).
  const rec = $("#result-record");
  rec.className = perfect ? "record perfect" : "record";
  rec.innerHTML = perfect
    ? `${r.wins}–${r.losses}`
    : `<span class="rec-w">${r.wins}</span><span class="rec-dash">–</span><span class="rec-l">${r.losses}</span>`;
  $("#result-grade").textContent = r.grade;
  $("#result-blurb").textContent = r.blurb;

  const lineup = POSITIONS.map((pos) => {
    const s = state.lineup[pos];
    const meta = teamMeta(s.team);
    return { pos, name: s.player.name, team: s.team, abbr: meta.abbr, decade: s.decade };
  });
  $("#result-lineup").innerHTML = lineup
    .map(
      (s) =>
        `<li><span class="rl-pos">${s.pos}</span> <span class="rl-name">${s.name}</span> <span class="rl-meta">${s.abbr} · ${s.decade}</span></li>`
    )
    .join("");

  renderRatingBars(r);
  $("#result-best").textContent = r.bestPick.name;
  $("#result-weakness").textContent = r.weakness;

  // Snapshot for saving / sharing.
  lastResult = {
    wins: r.wins,
    losses: r.losses,
    grade: r.grade,
    strength: Math.round(r.strength * 100),
    mode: state.mode,
    lineup,
    date: new Date().toISOString(),
  };

  // Reset the save button and show the standing personal best.
  const saveBtn = $("#save-result");
  saveBtn.disabled = false;
  saveBtn.textContent = "★ Record this result";
  renderPersonalBest();

  launchCelebration(r.wins);
}

// Show each category's combined total against the elite bar (catScore).
function renderRatingBars(r) {
  const rows = [
    ["ppg", "Scoring", "PPG"],
    ["rpg", "Rebounding", "RPG"],
    ["apg", "Playmaking", "APG"],
    ["spg", "Steals", "SPG"],
    ["bpg", "Blocks", "BPG"],
  ];
  $("#rating-bars").innerHTML = rows
    .map(([k, label, abbr]) => {
      const pct = Math.round(Math.min(r.catScore[k], 1) * 100);
      const elite = pct >= 100;
      return `
        <div class="rb-row">
          <span class="rb-label">${label}</span>
          <span class="rb-track">
            <span class="rb-fill${elite ? " elite" : ""}" style="width:${pct}%"></span>
          </span>
          <span class="rb-val">${r.totals[k].toFixed(1)} ${abbr}</span>
        </div>`;
    })
    .join("");
  $("#rating-value").textContent = `${(r.strength * 100).toFixed(0)} / 100`;
}

// ---- Start / reset ---------------------------------------------------------
function resetBuildState(mode) {
  state.mode = mode;
  state.round = 0;
  state.lineup = {};
  state.usedDecades = [];
  state.current = null;
  state.skips = { team: 1, era: 1 };
  state.spinning = false;
}

async function beginBuild() {
  $("#start-screen").classList.add("hidden");
  $("#result-screen").classList.add("hidden");
  $("#handoff-screen").classList.add("hidden");
  $("#h2h-result-screen").classList.add("hidden");
  $("#game-screen").classList.remove("hidden");
  $("#mode-badge").textContent = state.mode === "hoopiq" ? "Hoop IQ" : "Classic";

  const bb = $("#builder-badge");
  if (state.h2h) {
    bb.classList.remove("hidden");
    bb.textContent = `${state.h2h.builder} building`;
  } else {
    bb.classList.add("hidden");
  }
  await nextRound();
}

// Solo game, attributed to the selected user.
async function startSolo(mode) {
  state.h2h = null;
  state.daily = null;
  resetBuildState(mode);
  await beginBuild();
}

// Two-player head-to-head: Dion builds, then John, then compare.
async function startH2H() {
  state.daily = null;
  state.h2h = { builder: "Dion", results: {} };
  resetBuildState("classic");
  await beginBuild();
}

// ---- Daily challenge -------------------------------------------------------
// Deterministic RNG so everyone gets the same five teams on a given day.
function seededRand(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A team is dead-end-proof for the daily if it can field every position.
function teamCoversAll(roster) {
  const cov = new Set();
  for (const pl of roster) pl.pos.forEach((p) => cov.add(p));
  return POSITIONS.every((p) => cov.has(p));
}

async function buildDailyTeams(date) {
  const rnd = seededRand(parseInt(date.replace(/-/g, ""), 10) || 1);
  const pickR = (arr) => arr[Math.floor(rnd() * arr.length)];
  const decades = (await DataProvider.getDecades()).slice();
  // Seeded shuffle, take five distinct decades.
  for (let i = decades.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [decades[i], decades[j]] = [decades[j], decades[i]];
  }
  const chosen = decades.slice(0, 5);
  const teams = [];
  for (const d of chosen) {
    const names = await DataProvider.getTeams(d);
    let team = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const cand = pickR(names);
      if (teamCoversAll(await DataProvider.getRoster(d, cand))) {
        team = cand;
        break;
      }
    }
    teams.push({ decade: d, team: team || pickR(names) });
  }
  return teams;
}

async function startDaily() {
  state.h2h = null;
  const date = todayStamp();
  state.daily = { date, teams: await buildDailyTeams(date) };
  resetBuildState("classic");
  await beginBuild();
}

let rollNoteTimer = null;
function showRollNote(msg) {
  const note = $("#roll-note");
  if (!note) return;
  note.textContent = msg;
  note.classList.remove("hidden");
  note.classList.add("show");
  clearTimeout(rollNoteTimer);
  rollNoteTimer = setTimeout(() => {
    note.classList.remove("show");
    setTimeout(() => note.classList.add("hidden"), 300);
  }, 3200);
}

function resetRosterControls() {
  state.filter = "";
  state.posFilter = "ALL";
  state.sort = "ppg";
  const search = $("#roster-search");
  if (search) search.value = "";
  const sort = $("#sort-select");
  if (sort) sort.value = "ppg";
  const chips = $("#pos-chips");
  if (chips) {
    for (const c of chips.children) c.classList.toggle("active", c.dataset.pos === "ALL");
  }
}

function backToStart() {
  state.h2h = null;
  $("#result-screen").classList.add("hidden");
  $("#h2h-result-screen").classList.add("hidden");
  $("#handoff-screen").classList.add("hidden");
  $("#game-screen").classList.add("hidden");
  $("#start-screen").classList.remove("hidden");
  renderScoreboard();
}

// ---- Celebration (scales with the record) ----------------------------------
const FX_COLORS = ["#f5b942", "#ffce6b", "#4cc2ff", "#34d399", "#f6685e", "#fff"];

// Tiered: the better the season, the bigger the show.
function launchCelebration(wins) {
  if (wins >= 82) {
    launchConfetti(150);
    fireworksShow(7, 6); // bursts per wave, waves
  } else if (wins >= 70) {
    launchConfetti(90);
    fireworksShow(5, 3);
  } else if (wins >= 55) {
    launchConfetti(60);
    fireworksShow(3, 2);
  } else if (wins >= 41) {
    fireworksShow(2, 1);
  }
  // Below .500: no celebration — you've got work to do.
}

function launchConfetti(n = 90) {
  const c = $("#confetti");
  c.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const bit = el("div", "confetti-bit");
    bit.style.left = Math.random() * 100 + "vw";
    bit.style.background = pick(FX_COLORS);
    bit.style.animationDelay = Math.random() * 0.9 + "s";
    bit.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    c.appendChild(bit);
  }
  setTimeout(() => (c.innerHTML = ""), 4200);
}

function fireworksShow(burstsPerWave, waves) {
  const layer = $("#fireworks");
  let wave = 0;
  const fire = () => {
    for (let b = 0; b < burstsPerWave; b++) {
      setTimeout(
        () => firework(layer, 12 + Math.random() * 60, 8 + Math.random() * 44),
        Math.random() * 500
      );
    }
    if (++wave < waves) setTimeout(fire, 650);
  };
  fire();
}

function firework(layer, xVw, yVh) {
  const color = pick(FX_COLORS);
  const sparks = 26;
  const burst = el("div", "fw-burst");
  burst.style.left = xVw + "vw";
  burst.style.top = yVh + "vh";
  for (let i = 0; i < sparks; i++) {
    const angle = (i / sparks) * Math.PI * 2;
    const dist = 70 + Math.random() * 60;
    const s = el("div", "fw-spark");
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    s.style.background = color;
    burst.appendChild(s);
  }
  layer.appendChild(burst);
  setTimeout(() => burst.remove(), 1300);
}

// ---- Store: per-user records + head-to-head series -------------------------
const STORE_KEY = "eighty2_store_v1";
const USERS = ["Dion", "John"];

function loadStore() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(STORE_KEY));
  } catch {
    s = null;
  }
  if (!s || typeof s !== "object") s = {};
  s.Dion = s.Dion || [];
  s.John = s.John || [];
  s.h2h = s.h2h || [];
  return s;
}

function saveStore(s) {
  try {
    s.Dion = s.Dion.slice(-200);
    s.John = s.John.slice(-200);
    s.h2h = s.h2h.slice(-200);
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode) — fail quietly */
  }
}

function bestFor(user) {
  const recs = loadStore()[user] || [];
  if (!recs.length) return null;
  return recs.reduce((a, b) => (b.wins > a.wins ? b : a));
}

function h2hTally() {
  const recs = loadStore().h2h;
  const t = { Dion: 0, John: 0, ties: 0 };
  for (const r of recs) {
    if (r.winner === "tie") t.ties += 1;
    else t[r.winner] += 1;
  }
  return t;
}

// ---- Start-screen scoreboard ------------------------------------------------
function renderScoreboard() {
  const t = h2hTally();
  const db = bestFor("Dion");
  const jb = bestFor("John");
  const best = (b) => (b ? `${b.wins}–${b.losses} (${b.grade})` : "—");
  $("#scoreboard").innerHTML = `
    <div class="sb-title">Head-to-head series</div>
    <div class="sb-h2h">
      <span class="sb-name dion">Dion</span>
      <span class="sb-score">${t.Dion}<span class="sb-dash">–</span>${t.John}</span>
      <span class="sb-name john">John</span>
    </div>
    <div class="sb-sub">${
      t.Dion + t.John + t.ties === 0
        ? "No matchups yet — play Head-to-Head"
        : `${t.Dion + t.John + t.ties} played${t.ties ? ` · ${t.ties} tied` : ""}`
    }</div>
    <div class="sb-bests">
      <div><span class="sb-dot dion"></span>Dion best <b>${best(db)}</b></div>
      <div><span class="sb-dot john"></span>John best <b>${best(jb)}</b></div>
    </div>`;
}

// ---- Solo: record + share ---------------------------------------------------
function renderPersonalBest() {
  const node = $("#personal-best");
  node.classList.remove("hidden");

  // Daily challenge: show today's Dion-vs-John comparison.
  if (state.daily) {
    const day = (loadStore().daily || {})[state.daily.date] || {};
    const cell = (u) =>
      day[u]
        ? `<b class="${u.toLowerCase()}">${u} ${day[u].wins}–${day[u].losses}</b>`
        : `<span class="${u.toLowerCase()}">${u} —</span>`;
    node.innerHTML = `Today's challenge &nbsp; ${cell("Dion")} &nbsp;vs&nbsp; ${cell("John")}`;
    return;
  }

  const best = bestFor(state.user);
  const count = (loadStore()[state.user] || []).length;
  node.innerHTML = best
    ? `${state.user}'s best &nbsp;<b>${best.wins}–${best.losses}</b>&nbsp; (${best.grade}) · ${count} recorded`
    : `${state.user} has no recorded seasons yet`;
}

function saveResult() {
  if (!lastResult) return;
  const store = loadStore();
  store[state.user].push(lastResult);
  saveStore(store);
  const btn = $("#save-result");
  btn.textContent = "✓ Recorded";
  btn.disabled = true;
  renderPersonalBest();
}

function shareText(r) {
  const five = r.lineup
    .map((s) => `${s.pos}: ${s.name} (${s.abbr} ${s.decade})`)
    .join("\n");
  return (
    `82-0 · Built for Dion Kontonis\n` +
    `${state.user}'s season: ${r.wins}–${r.losses} (Grade ${r.grade}, strength ${r.strength}/100)\n\n` +
    `${five}\n\nPlay: https://emailcleaner-olive.vercel.app`
  );
}

function drawShareCanvas(r) {
  const W = 1080, H = 1080;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  const perfect = r.wins === 82;

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#141d2e");
  g.addColorStop(1, "#090c14");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = "#f5b942";
  x.fillRect(0, 0, W, 12);

  x.textAlign = "center";
  x.fillStyle = "#ffffff";
  x.font = "900 140px Archivo, sans-serif";
  x.fillText("82–0", W / 2, 200);
  x.fillStyle = "#f5b942";
  x.font = "700 34px Inter, sans-serif";
  x.fillText("Built for Dion Kontonis", W / 2, 250);
  x.fillStyle = "#8b95a9";
  x.font = "600 28px Inter, sans-serif";
  const modeLabel = state.daily
    ? "Daily Challenge"
    : state.mode === "hoopiq"
    ? "Hoop IQ"
    : "Classic";
  x.fillText(`${state.user} · ${modeLabel}`, W / 2, 312);

  // Record, with wins/losses colored.
  x.font = "900 170px Archivo, sans-serif";
  const wT = String(r.wins), dT = " – ", lT = String(r.losses);
  const wW = x.measureText(wT).width;
  const dW = x.measureText(dT).width;
  const lW = x.measureText(lT).width;
  let sx = (W - (wW + dW + lW)) / 2;
  x.textAlign = "left";
  x.fillStyle = perfect ? "#f5b942" : "#34d399";
  x.fillText(wT, sx, 520);
  sx += wW;
  x.fillStyle = "#8b95a9";
  x.fillText(dT, sx, 520);
  sx += dW;
  x.fillStyle = perfect ? "#f5b942" : "#f6685e";
  x.fillText(lT, sx, 520);

  x.textAlign = "center";
  x.fillStyle = "#eef2f9";
  x.font = "800 44px Archivo, sans-serif";
  x.fillText(`Grade ${r.grade} · ${r.strength}/100`, W / 2, 600);

  // Lineup
  x.font = "600 36px Inter, sans-serif";
  let y = 700;
  for (const s of r.lineup) {
    x.fillStyle = "#f5b942";
    x.textAlign = "left";
    x.fillText(s.pos, 150, y);
    x.fillStyle = "#eef2f9";
    x.fillText(s.name, 250, y);
    x.fillStyle = "#8b95a9";
    x.textAlign = "right";
    x.fillText(`${s.abbr} · ${s.decade}`, W - 150, y);
    y += 64;
  }

  x.textAlign = "center";
  x.fillStyle = "#5d6678";
  x.font = "600 26px Inter, sans-serif";
  x.fillText("emailcleaner-olive.vercel.app", W / 2, 1030);
  return c;
}

async function shareResult() {
  if (!lastResult) return;
  const r = lastResult;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch {
    /* fonts API missing — use fallback fonts */
  }
  const canvas = drawShareCanvas(r);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const file =
    blob && window.File ? new File([blob], "82-0-result.png", { type: "image/png" }) : null;

  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "82-0", text: shareText(r) });
      return;
    }
  } catch {
    /* share sheet dismissed */
    return;
  }

  // No file sharing — offer a download, and copy the text summary.
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "82-0-result.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showShareToast("Image downloaded");
  }
  try {
    await navigator.clipboard.writeText(shareText(r));
  } catch {
    /* clipboard unavailable */
  }
}

function showShareToast(msg) {
  const btn = $("#share-result");
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = original), 1800);
}

// ---- Head-to-head: handoff + result ----------------------------------------
function showHandoff(justFinished) {
  $("#game-screen").classList.add("hidden");
  const next = state.h2h.builder;
  $("#handoff-title").textContent = `${justFinished}'s team is locked in`;
  $("#handoff-sub").textContent = `Pass the device to ${next} — no peeking at the picks!`;
  $("#handoff-continue").textContent = `${next}, build your team →`;
  $("#handoff-screen").classList.remove("hidden");
}

function handoffContinue() {
  resetBuildState("classic");
  beginBuild();
}

const CATS = [
  ["ppg", "PTS"],
  ["rpg", "REB"],
  ["apg", "AST"],
  ["spg", "STL"],
  ["bpg", "BLK"],
];

function showH2HResult() {
  const d = state.h2h.results.Dion;
  const j = state.h2h.results.John;

  let winner;
  if (d.wins !== j.wins) winner = d.wins > j.wins ? "Dion" : "John";
  else if (d.strength !== j.strength)
    winner = d.strength > j.strength ? "Dion" : "John";
  else winner = "tie";

  // Persist the matchup and add each lineup to its user's history.
  const store = loadStore();
  store.h2h.push({
    winner,
    Dion: { wins: d.wins, losses: d.losses, grade: d.grade, strength: d.strength },
    John: { wins: j.wins, losses: j.losses, grade: j.grade, strength: j.strength },
    date: new Date().toISOString(),
  });
  store.Dion.push({ ...d, mode: "h2h", date: new Date().toISOString() });
  store.John.push({ ...j, mode: "h2h", date: new Date().toISOString() });
  saveStore(store);

  $("#game-screen").classList.add("hidden");
  $("#handoff-screen").classList.add("hidden");
  $("#h2h-result-screen").classList.remove("hidden");

  $("#h2h-winner").textContent =
    winner === "tie" ? "It's a tie!" : `${winner} wins!`;
  $("#h2h-winner").className =
    "h2h-winner" + (winner === "tie" ? " tie" : ` win-${winner.toLowerCase()}`);
  $("#h2h-blurb").textContent =
    winner === "tie"
      ? "Dead even — identical projected records and strength."
      : `${winner}'s lineup projects to the better season.`;

  renderH2HSide($("#h2h-side-0"), "Dion", d, j, winner);
  renderH2HSide($("#h2h-side-1"), "John", j, d, winner);

  const t = h2hTally();
  $("#h2h-series").innerHTML =
    `Series so far &nbsp; <b class="dion">Dion ${t.Dion}</b> — <b class="john">${t.John} John</b>` +
    (t.ties ? ` · ${t.ties} tied` : "");

  const wins = winner === "Dion" ? d.wins : winner === "John" ? j.wins : 0;
  launchCelebration(wins);
}

function renderH2HSide(node, name, me, opp, winner) {
  const isWinner = winner === name;
  const cats = CATS.map(([k, abbr]) => {
    const win = me.totals[k] > opp.totals[k];
    return `<span class="h2h-cat ${win ? "won" : ""}">${abbr} ${me.totals[k].toFixed(1)}</span>`;
  }).join("");
  const lineup = me.lineup
    .map(
      (s) =>
        `<li><span class="rl-pos">${s.pos}</span> ${s.name} <span class="rl-meta">${s.abbr}·${s.decade}</span></li>`
    )
    .join("");
  node.className = "h2h-side" + (isWinner ? " winner" : "");
  node.innerHTML = `
    <div class="h2h-head">
      <span class="h2h-user ${name.toLowerCase()}">${name}</span>
      ${isWinner ? '<span class="h2h-crown">👑</span>' : ""}
    </div>
    <div class="h2h-record"><span class="rec-w">${me.wins}</span><span class="rec-dash">–</span><span class="rec-l">${me.losses}</span></div>
    <div class="h2h-meta">Grade ${me.grade} · strength ${me.strength}/100</div>
    <div class="h2h-cats">${cats}</div>
    <ul class="h2h-lineup">${lineup}</ul>`;
}

// ---- Wire up ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  renderScoreboard();
  $("#play-classic").addEventListener("click", () => startSolo("classic"));
  $("#play-hoopiq").addEventListener("click", () => startSolo("hoopiq"));
  $("#play-daily").addEventListener("click", startDaily);
  $("#play-h2h").addEventListener("click", startH2H);
  $("#user-toggle").addEventListener("click", (e) => {
    const b = e.target.closest(".utog");
    if (!b) return;
    state.user = b.dataset.user;
    for (const c of $("#user-toggle").children) {
      c.classList.toggle("active", c === b);
    }
  });
  $("#handoff-continue").addEventListener("click", handoffContinue);
  $("#h2h-again").addEventListener("click", startH2H);
  $("#h2h-home").addEventListener("click", backToStart);
  $("#team-skip").addEventListener("click", teamSkip);
  $("#era-skip").addEventListener("click", eraSkip);
  $("#play-again").addEventListener("click", backToStart);
  $("#roster-search").addEventListener("input", (e) => {
    state.filter = e.target.value;
    renderRoster();
  });
  $("#pos-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.posFilter = chip.dataset.pos;
    for (const c of $("#pos-chips").children) {
      c.classList.toggle("active", c === chip);
    }
    renderRoster();
  });
  $("#sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderRoster();
  });
  $("#save-result").addEventListener("click", saveResult);
  $("#share-result").addEventListener("click", shareResult);
});
