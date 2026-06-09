/*
 * 82-0 — game logic and UI controller
 *
 * Flow: 5 rounds. Each round the slot machine locks in a random unused decade
 * and a random franchise from that decade. You pick one player and slot him at
 * an open court position he actually played. One team skip + one era skip per
 * game. After 5 picks the season is simulated into a 0-82 -> 82-0 record.
 */

const TOTAL_ROUNDS = 5;

// Reference totals a 5-man starting lineup would need to be "elite" in each
// category. Used to normalize the roster's combined stats into a strength.
const ELITE = { ppg: 130, rpg: 50, apg: 32, spg: 8.5, bpg: 7.5 };
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

async function newRoll({ decade, excludeTeam } = {}) {
  const open = openPositions();
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

  // Map strength (~0.45 floor .. ~1.15 ceiling) onto a 0..82 win curve.
  const t = clamp((strength - 0.5) / (1.12 - 0.5), 0, 1);
  let wins = Math.round(82 * easeInOutCubic(t));

  // A perfect season only if the team is elite across the board, not just on
  // average — every category must clear the elite bar.
  const balanced = Object.values(catScore).every((v) => v >= 1.0);
  if (balanced && strength >= 1.05) wins = 82;
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
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---- Rendering -------------------------------------------------------------
function render() {
  renderCourt();
  renderStatus();
  renderRoster();
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
  $("#team-skip").textContent = `Team skip (${state.skips.team})`;
  $("#era-skip").textContent = `Era skip (${state.skips.era})`;
  $("#team-skip").disabled = state.skips.team <= 0 || state.spinning;
  $("#era-skip").disabled = state.skips.era <= 0 || state.spinning;
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
    sm.style.background = `linear-gradient(100deg, ${hexA(meta.c1, 0.22)} 0%, var(--panel) 60%)`;
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

async function spinTo(opts) {
  state.spinning = true;
  renderStatus();
  const reel = $("#reel-team");
  reel.classList.add("spinning");

  // Quick visual shuffle through random combos before locking in.
  const decades = await DataProvider.getDecades();
  const ticks = 12;
  for (let i = 0; i < ticks; i++) {
    const d = pick(decades);
    const teams = await DataProvider.getTeams(d);
    setReel(d, pick(teams));
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
  await spinTo({ decade: state.current.decade, excludeTeam: state.current.team });
  render();
}

async function eraSkip() {
  if (state.skips.era <= 0 || state.spinning) return;
  state.skips.era -= 1;
  await spinTo();
  render();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function finishGame() {
  const result = simulate(state.lineup);
  showResult(result);
}

// ---- Result screen ---------------------------------------------------------
function showResult(r) {
  $("#game-screen").classList.add("hidden");
  const screen = $("#result-screen");
  screen.classList.remove("hidden");

  const perfect = r.wins === 82;
  $("#result-record").textContent = `${r.wins}–${r.losses}`;
  $("#result-record").className = perfect ? "record perfect" : "record";
  $("#result-grade").textContent = r.grade;
  $("#result-blurb").textContent = r.blurb;

  const lineupHtml = POSITIONS.map((pos) => {
    const s = state.lineup[pos];
    return `<li><span class="rl-pos">${pos}</span> <span class="rl-name">${s.player.name}</span> <span class="rl-meta">${s.team} · ${s.decade}</span></li>`;
  }).join("");
  $("#result-lineup").innerHTML = lineupHtml;

  $("#result-best").textContent = r.bestPick.name;
  $("#result-weakness").textContent = r.weakness;

  if (perfect) launchConfetti();
}

// ---- Start / reset ---------------------------------------------------------
async function startGame(mode) {
  state.mode = mode;
  state.round = 0;
  state.lineup = {};
  state.usedDecades = [];
  state.current = null;
  state.skips = { team: 1, era: 1 };
  state.spinning = false;

  $("#start-screen").classList.add("hidden");
  $("#result-screen").classList.add("hidden");
  $("#game-screen").classList.remove("hidden");
  $("#mode-badge").textContent =
    mode === "hoopiq" ? "Hoop IQ" : "Classic";

  await nextRound();
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
  $("#result-screen").classList.add("hidden");
  $("#game-screen").classList.add("hidden");
  $("#start-screen").classList.remove("hidden");
}

// ---- Confetti (perfect season only) ----------------------------------------
function launchConfetti() {
  const c = $("#confetti");
  c.innerHTML = "";
  const colors = ["#f9d342", "#ff5f6d", "#3ec6ff", "#7ee787", "#fff"];
  for (let i = 0; i < 90; i++) {
    const bit = el("div", "confetti-bit");
    bit.style.left = Math.random() * 100 + "vw";
    bit.style.background = pick(colors);
    bit.style.animationDelay = Math.random() * 0.8 + "s";
    bit.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
    c.appendChild(bit);
  }
  setTimeout(() => (c.innerHTML = ""), 4000);
}

// ---- Wire up ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  $("#play-classic").addEventListener("click", () => startGame("classic"));
  $("#play-hoopiq").addEventListener("click", () => startGame("hoopiq"));
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
});
