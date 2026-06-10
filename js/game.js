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

function finishGame() {
  const result = simulate(state.lineup);
  showResult(result);
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
  $("#result-screen").classList.add("hidden");
  $("#game-screen").classList.add("hidden");
  $("#start-screen").classList.remove("hidden");
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

// ---- Saving / sharing your record ------------------------------------------
const RECORDS_KEY = "eighty2_records_v1";

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY)) || [];
  } catch {
    return [];
  }
}

function bestRecord() {
  const recs = loadRecords();
  if (!recs.length) return null;
  return recs.reduce((a, b) => (b.wins > a.wins ? b : a));
}

function renderPersonalBest() {
  const best = bestRecord();
  const node = $("#personal-best");
  if (!best) {
    node.classList.add("hidden");
    return;
  }
  node.classList.remove("hidden");
  node.innerHTML = `Personal best &nbsp;<b>${best.wins}–${best.losses}</b>&nbsp; (${best.grade}) · ${loadRecords().length} recorded`;
}

function saveResult() {
  if (!lastResult) return;
  const recs = loadRecords();
  recs.push(lastResult);
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(recs.slice(-200)));
  } catch {
    /* storage may be unavailable (private mode) — fail quietly */
  }
  const btn = $("#save-result");
  btn.textContent = "✓ Recorded";
  btn.disabled = true;
  renderPersonalBest();
}

async function shareResult() {
  if (!lastResult) return;
  const r = lastResult;
  const five = r.lineup
    .map((s) => `${s.pos}: ${s.name} (${s.abbr} ${s.decade})`)
    .join("\n");
  const text =
    `82-0 · Built for Dion Kontonis\n` +
    `My season: ${r.wins}–${r.losses} (Grade ${r.grade}, strength ${r.strength}/100)\n\n` +
    `${five}\n\nPlay: https://emailcleaner-olive.vercel.app`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "82-0", text });
    } else {
      await navigator.clipboard.writeText(text);
      showShareToast("Result copied to clipboard");
    }
  } catch {
    /* user dismissed the share sheet — ignore */
  }
}

function showShareToast(msg) {
  const btn = $("#share-result");
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = original), 1800);
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
  $("#save-result").addEventListener("click", saveResult);
  $("#share-result").addEventListener("click", shareResult);
});
