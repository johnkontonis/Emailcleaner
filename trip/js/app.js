/*
 * European Adventure — trip companion app.
 *
 * Pure vanilla JS, no build step. Everything renders from `window.TRIP`
 * (see js/data.js). To load a real itinerary you only edit that file.
 */
(function () {
  "use strict";

  const T = window.TRIP || {};

  // ── Small helpers ───────────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  };
  const esc = (s) => String(s == null ? "" : s);

  // ── Dates ────────────────────────────────────────────────────────────────
  // Parse "YYYY-MM-DD" as a LOCAL date (avoid the UTC-shift gotcha).
  const parseDate = (s) => {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (s) => {
    const d = parseDate(s);
    return d ? `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}` : "";
  };
  const fmtDateLong = (s) => {
    const d = parseDate(s);
    return d ? `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : "";
  };
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ap = h < 12 ? "am" : "pm";
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2, "0")}${ap}`;
  };
  const timeRange = (a, b) => (a && b ? `${fmtTime(a)} – ${fmtTime(b)}` : fmtTime(a) || "All day");

  // ── Type metadata (icon + colour) ─────────────────────────────────────────
  const TYPES = {
    flight:     { icon: "✈️", label: "Flight" },
    train:      { icon: "🚆", label: "Train" },
    hotel:      { icon: "🏨", label: "Hotel" },
    car:        { icon: "🚗", label: "Car" },
    ferry:      { icon: "⛴️", label: "Ferry" },
    tour:       { icon: "🎟️", label: "Tour" },
    restaurant: { icon: "🍽️", label: "Dining" },
    activity:   { icon: "📸", label: "Activity" },
    transfer:   { icon: "🚕", label: "Transfer" },
    meeting:    { icon: "🤝", label: "Meeting" },
    reminder:   { icon: "⏰", label: "Reminder" },
    note:       { icon: "📝", label: "Note" },
  };
  const typeInfo = (t) => TYPES[t] || { icon: "📌", label: t ? t[0].toUpperCase() + t.slice(1) : "Item" };

  // ── Persisted "checked" state (things to do / reminders) ───────────────────
  const STORE_KEY = "euro-trip:v1";
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  };
  const saveState = (s) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} };
  let state = loadState();
  const isDone = (key) => !!state[key];
  const toggleDone = (key) => { state[key] = !state[key]; saveState(state); };

  // ── Build a unified, time-sorted event list (reservations + day items) ─────
  // Each event: { date, time, endTime, type, title, sub, detail[], city }
  function buildEvents() {
    const out = [];
    (T.reservations || []).forEach((r, i) => {
      out.push({
        date: r.date, time: r.time, endTime: r.endTime, type: r.type,
        title: r.title, city: r.city, source: "reservation", ref: i,
        sub: resSub(r), detail: resDetail(r),
      });
    });
    (T.days || []).forEach((day) => {
      (day.items || []).forEach((it, j) => {
        out.push({
          date: day.date, time: it.time, endTime: it.endTime, type: it.type,
          title: it.title, city: day.city, source: "day", ref: `${day.date}:${j}`,
          sub: it.notes || "", detail: [],
        });
      });
    });
    out.sort((a, b) => (a.date === b.date
      ? (a.time || "99:99").localeCompare(b.time || "99:99")
      : a.date.localeCompare(b.date)));
    return out;
  }

  function resSub(r) {
    if (r.type === "flight" || r.type === "train" || r.type === "ferry")
      return [r.from, r.to].filter(Boolean).join(" → ");
    if (r.type === "hotel") return r.address || r.city || "";
    return r.location || r.address || r.city || "";
  }
  function resDetail(r) {
    const d = [];
    if (r.airline || r.operator) d.push([r.airline || r.operator, r.code].filter(Boolean).join(" · "));
    if (r.from && r.to) d.push(`${r.from} → ${r.to}`);
    if (r.terminal) d.push(r.terminal);
    if (r.seats) d.push("Seats " + r.seats);
    if (r.address) d.push("📍 " + r.address);
    if (r.phone) d.push("☎ " + r.phone);
    if (r.confirmation) d.push("Confirmation: " + r.confirmation);
    if (r.notes) d.push(r.notes);
    return d;
  }

  const EVENTS = buildEvents();

  // Build the full list of reminders (explicit + derived from key reservations).
  function buildReminders() {
    const out = (T.reminders || []).map((r, i) => ({
      date: r.date, time: r.time, title: r.title, notes: r.notes, ref: "rem:" + i,
    }));
    return out.sort((a, b) => (a.date === b.date
      ? (a.time || "99:99").localeCompare(b.time || "99:99")
      : a.date.localeCompare(b.date)));
  }
  const REMINDERS = buildReminders();

  // ── Reusable event card ────────────────────────────────────────────────────
  function eventCard(ev, opts = {}) {
    const ti = typeInfo(ev.type);
    const time = el("div", { class: "ev__time" },
      el("span", { class: "ev__t" }, ev.time ? fmtTime(ev.time) : "All day"),
      ev.endTime ? el("span", { class: "ev__t2" }, fmtTime(ev.endTime)) : null);
    const body = el("div", { class: "ev__body" },
      el("div", { class: "ev__title" }, ev.title || ti.label),
      ev.sub ? el("div", { class: "ev__sub" }, ev.sub) : null,
      ev.detail && ev.detail.length
        ? el("div", { class: "ev__detail" }, ...ev.detail.map((d) => el("div", { class: "ev__line" }, d)))
        : null);
    return el("div", { class: `ev ev--${ev.type || "note"}` },
      time,
      el("div", { class: "ev__icon", title: ti.label }, ti.icon),
      body);
  }

  // ── Countdown / trip status ────────────────────────────────────────────────
  function tripStatus() {
    const today = todayStr();
    if (!T.startDate) return { phase: "none", label: "" };
    if (today < T.startDate) {
      const n = daysBetween(today, T.startDate);
      return { phase: "before", days: n, label: n === 0 ? "Today!" : `${n} day${n === 1 ? "" : "s"} to go` };
    }
    if (today > (T.endDate || T.startDate)) return { phase: "after", label: "Trip complete 🎉" };
    const dayNo = daysBetween(T.startDate, today) + 1;
    const total = daysBetween(T.startDate, T.endDate) + 1;
    return { phase: "during", day: dayNo, total, label: `Day ${dayNo} of ${total}` };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  VIEWS
  // ════════════════════════════════════════════════════════════════════════

  function renderHome() {
    const v = $("#view-home");
    v.innerHTML = "";
    const status = tripStatus();
    const today = todayStr();

    // Hero / route summary
    const route = (T.cities || []).map((c) => `${c.emoji || ""} ${c.name}`).join("  →  ");
    v.append(el("div", { class: "hero" },
      el("div", { class: "hero__dates" }, `${fmtDate(T.startDate)} – ${fmtDate(T.endDate)}`),
      el("div", { class: "hero__route" }, route),
      T.travelers ? el("div", { class: "hero__people muted" }, "👨‍👩‍👧‍👦 " + T.travelers.join(", ")) : null));

    // Up next / today
    let heading = "Up next", upcoming = [];
    if (status.phase === "during") {
      heading = "Today";
      upcoming = EVENTS.filter((e) => e.date === today);
      if (!upcoming.length) { heading = "Up next"; upcoming = EVENTS.filter((e) => e.date > today).slice(0, 4); }
    } else if (status.phase === "before") {
      upcoming = EVENTS.filter((e) => e.date >= today).slice(0, 4);
    }
    if (upcoming.length) {
      v.append(sectionTitle(heading));
      const wrap = el("div", { class: "stack" });
      upcoming.forEach((e) => wrap.append(eventCard(e)));
      v.append(wrap);
    }

    // Next reservations strip
    const nextRes = EVENTS.filter((e) => e.source === "reservation" && e.date >= today).slice(0, 3);
    if (nextRes.length) {
      v.append(sectionTitle("Next bookings"));
      const wrap = el("div", { class: "stack" });
      nextRes.forEach((e) => wrap.append(eventCard(e)));
      v.append(wrap);
    }

    // Upcoming reminders
    const rem = REMINDERS.filter((r) => r.date >= today && !isDone(r.ref)).slice(0, 4);
    if (rem.length) {
      v.append(sectionTitle("Reminders"));
      const wrap = el("div", { class: "stack" });
      rem.forEach((r) => wrap.append(reminderRow(r)));
      v.append(wrap);
    }

    // Quick stats
    const stats = el("div", { class: "stats" },
      stat((T.cities || []).length, "Cities"),
      stat(daysBetween(T.startDate, T.endDate) + 1, "Days"),
      stat((T.reservations || []).length, "Bookings"),
      stat((T.thingsToDo || []).length, "To do"));
    v.append(stats);
  }

  function stat(n, label) {
    return el("div", { class: "stat" }, el("div", { class: "stat__n" }, String(n)), el("div", { class: "stat__l" }, label));
  }

  function reminderRow(r) {
    const done = isDone(r.ref);
    const cb = el("button", {
      class: "check" + (done ? " is-done" : ""), "aria-label": "Toggle reminder",
      onclick: () => { toggleDone(r.ref); render(); },
    }, done ? "✓" : "");
    return el("div", { class: "reminder" + (done ? " is-done" : "") },
      cb,
      el("div", { class: "reminder__body" },
        el("div", { class: "reminder__title" }, r.title),
        el("div", { class: "reminder__meta muted" }, `${fmtDate(r.date)}${r.time ? " · " + fmtTime(r.time) : ""}`),
        r.notes ? el("div", { class: "reminder__notes muted" }, r.notes) : null));
  }

  function sectionTitle(text, extra) {
    return el("div", { class: "section-title" }, el("h2", {}, text), extra || null);
  }

  // ── Calendar (day-by-day timeline) ─────────────────────────────────────────
  function renderCalendar() {
    const v = $("#view-calendar");
    v.innerHTML = "";
    v.append(sectionTitle("Itinerary"));

    const today = todayStr();
    const days = T.days && T.days.length ? T.days.map((d) => d.date) : [];
    // Ensure every trip date is present even if not in T.days.
    const allDates = new Set(days);
    EVENTS.forEach((e) => allDates.add(e.date));
    REMINDERS.forEach((r) => allDates.add(r.date));
    const ordered = Array.from(allDates).filter(Boolean).sort();

    ordered.forEach((date) => {
      const dayMeta = (T.days || []).find((d) => d.date === date) || {};
      const evs = EVENTS.filter((e) => e.date === date);
      const rems = REMINDERS.filter((r) => r.date === date);
      const isToday = date === today;
      const dayNo = (date >= T.startDate && date <= T.endDate) ? daysBetween(T.startDate, date) + 1 : null;

      const head = el("div", { class: "day__head" + (isToday ? " is-today" : "") },
        el("div", { class: "day__date" },
          el("span", { class: "day__dow" }, parseDate(date) ? DOW[parseDate(date).getDay()] : ""),
          el("span", { class: "day__num" }, parseDate(date) ? String(parseDate(date).getDate()) : ""),
          el("span", { class: "day__mon" }, parseDate(date) ? MON[parseDate(date).getMonth()] : "")),
        el("div", { class: "day__meta" },
          el("div", { class: "day__title" }, dayMeta.title || (dayMeta.city ? `In ${dayMeta.city}` : fmtDateLong(date))),
          el("div", { class: "day__city muted" },
            [dayNo ? `Day ${dayNo}` : null, dayMeta.city].filter(Boolean).join(" · "))),
        isToday ? el("span", { class: "pill pill--today" }, "Today") : null);

      const body = el("div", { class: "day__body" });
      if (!evs.length && !rems.length) body.append(el("div", { class: "muted day__empty" }, "Open day — nothing scheduled."));
      evs.forEach((e) => body.append(eventCard(e)));
      rems.forEach((r) => body.append(reminderRow(r)));

      v.append(el("section", { class: "day" }, head, body));
    });
  }

  // ── Reservations ───────────────────────────────────────────────────────────
  function renderReservations() {
    const v = $("#view-reservations");
    v.innerHTML = "";
    v.append(sectionTitle("Reservations"));

    const res = (T.reservations || []).slice().sort((a, b) =>
      (a.date === b.date ? (a.time || "").localeCompare(b.time || "") : a.date.localeCompare(b.date)));
    if (!res.length) { v.append(el("div", { class: "muted" }, "No reservations yet.")); return; }

    res.forEach((r) => {
      const ti = typeInfo(r.type);
      const rows = [];
      const add = (label, val) => { if (val) rows.push(el("div", { class: "kv" }, el("span", { class: "kv__k" }, label), el("span", { class: "kv__v" }, val))); };
      add("When", `${fmtDate(r.date)}${r.endDate && r.endDate !== r.date ? " → " + fmtDate(r.endDate) : ""}`);
      add("Time", timeRange(r.time, r.endTime));
      if (r.from || r.to) add("Route", [r.from, r.to].filter(Boolean).join("  →  "));
      add("Airline", [r.airline || r.operator, r.code].filter(Boolean).join(" · "));
      add("Address", r.address);
      add("Where", r.location);
      add("Terminal", r.terminal);
      add("Seats", r.seats);
      add("Phone", r.phone);
      if (r.notes) rows.push(el("div", { class: "res__notes" }, r.notes));

      const conf = r.confirmation
        ? el("button", {
            class: "conf",
            title: "Tap to copy",
            onclick: (e) => copyText(r.confirmation, e.currentTarget),
          }, el("span", { class: "conf__k" }, "Conf #"), el("span", { class: "conf__v" }, r.confirmation))
        : null;

      v.append(el("article", { class: `card card--${r.type}` },
        el("div", { class: "card__head" },
          el("span", { class: "card__icon" }, ti.icon),
          el("div", {},
            el("div", { class: "card__title" }, r.title),
            el("div", { class: "card__type muted" }, [ti.label, r.city].filter(Boolean).join(" · "))),
          conf),
        el("div", { class: "card__body" }, ...rows)));
    });
  }

  function copyText(text, btn) {
    const done = () => { if (btn) { const o = btn.querySelector(".conf__v").textContent; btn.querySelector(".conf__v").textContent = "Copied!"; setTimeout(() => (btn.querySelector(".conf__v").textContent = o), 1200); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(done);
    else done();
  }

  // ── Things to do ───────────────────────────────────────────────────────────
  function renderTodo() {
    const v = $("#view-todo");
    v.innerHTML = "";
    const done = (T.thingsToDo || []).filter((x, i) => isDone("todo:" + i)).length;
    v.append(sectionTitle("Things to do", el("span", { class: "muted count" }, `${done}/${(T.thingsToDo || []).length} done`)));

    byCity(T.thingsToDo || []).forEach(([city, items]) => {
      v.append(cityHeader(city));
      const wrap = el("div", { class: "stack" });
      items.forEach(({ item, idx }) => {
        const key = "todo:" + idx;
        const checked = isDone(key);
        wrap.append(el("div", { class: "todo" + (checked ? " is-done" : "") },
          el("button", {
            class: "check" + (checked ? " is-done" : ""), "aria-label": "Toggle",
            onclick: () => { toggleDone(key); render(); },
          }, checked ? "✓" : ""),
          el("div", { class: "todo__body" },
            el("div", { class: "todo__title" }, item.name),
            el("div", { class: "todo__meta muted" }, [item.category, item.notes].filter(Boolean).join(" · ")))));
      });
      v.append(wrap);
    });
  }

  // ── Places to eat ──────────────────────────────────────────────────────────
  function renderEat() {
    const v = $("#view-eat");
    v.innerHTML = "";
    v.append(sectionTitle("Places to eat"));

    byCity(T.placesToEat || []).forEach(([city, items]) => {
      v.append(cityHeader(city));
      const wrap = el("div", { class: "stack" });
      items.forEach(({ item }) => {
        wrap.append(el("article", { class: "eat" },
          el("div", { class: "eat__main" },
            el("div", { class: "eat__name" }, item.name),
            el("div", { class: "eat__meta muted" }, [item.cuisine, item.area].filter(Boolean).join(" · ")),
            item.notes ? el("div", { class: "eat__notes" }, item.notes) : null),
          item.reservation
            ? el("div", { class: "eat__res" }, "📅 " + item.reservation)
            : el("div", { class: "eat__res eat__res--none muted" }, "No booking")));
      });
      v.append(wrap);
    });
  }

  // ── Info ────────────────────────────────────────────────────────────────────
  function renderInfo() {
    const v = $("#view-info");
    v.innerHTML = "";
    v.append(sectionTitle("Trip info"));

    // Cities & dates
    const cities = el("div", { class: "stack" });
    (T.cities || []).forEach((c) => {
      cities.append(el("div", { class: "info-row" },
        el("span", { class: "info-row__icon" }, c.emoji || "📍"),
        el("div", {},
          el("div", { class: "info-row__title" }, `${c.name}, ${c.country}`),
          el("div", { class: "muted" }, `${fmtDate(c.arrive)} – ${fmtDate(c.depart)} · ${daysBetween(c.arrive, c.depart)} night${daysBetween(c.arrive, c.depart) === 1 ? "" : "s"}`))));
    });
    v.append(el("h3", { class: "info-h" }, "Where we're staying"), cities);

    // All reminders
    if (REMINDERS.length) {
      v.append(el("h3", { class: "info-h" }, "All reminders"));
      const wrap = el("div", { class: "stack" });
      REMINDERS.forEach((r) => wrap.append(reminderRow(r)));
      v.append(wrap);
    }

    // Emergency numbers
    if ((T.emergency || []).length) {
      v.append(el("h3", { class: "info-h" }, "Emergency & key numbers"));
      const wrap = el("div", { class: "stack" });
      (T.emergency || []).forEach((e) => {
        wrap.append(el("a", { class: "info-row info-row--link", href: "tel:" + String(e.value).replace(/\s/g, "") },
          el("span", { class: "info-row__icon" }, "☎"),
          el("div", {}, el("div", { class: "info-row__title" }, e.label), el("div", { class: "muted" }, e.value))));
      });
      v.append(wrap);
    }

    v.append(el("p", { class: "muted footer-note" },
      "Tip: add this app to your home screen for offline access. Edit ",
      el("code", {}, "js/data.js"), " to update the itinerary."));
  }

  // ── Helpers for city grouping ───────────────────────────────────────────────
  function byCity(items) {
    const order = (T.cities || []).map((c) => c.name);
    const groups = new Map();
    items.forEach((item, idx) => {
      const c = item.city || "Other";
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push({ item, idx });
    });
    return Array.from(groups.entries()).sort((a, b) => {
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }
  function cityHeader(city) {
    const meta = (T.cities || []).find((c) => c.name === city);
    return el("div", { class: "city-head" }, (meta && meta.emoji ? meta.emoji + " " : "") + city);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Navigation + boot
  // ════════════════════════════════════════════════════════════════════════
  const RENDERERS = {
    home: renderHome,
    calendar: renderCalendar,
    reservations: renderReservations,
    todo: renderTodo,
    eat: renderEat,
    info: renderInfo,
  };
  let current = "home";

  function show(target) {
    current = target;
    $$(".view").forEach((s) => (s.hidden = s.dataset.view !== target));
    $$(".tab").forEach((t) => {
      const active = t.dataset.target === target;
      t.classList.toggle("is-active", active);
      if (active) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    (RENDERERS[target] || renderHome)();
    window.scrollTo({ top: 0 });
  }

  function render() { (RENDERERS[current] || renderHome)(); renderChrome(); }

  function renderChrome() {
    $("#trip-title").textContent = T.title || "Our Trip";
    $("#trip-subtitle").textContent = T.subtitle || "";
    const s = tripStatus();
    const c = $("#countdown");
    c.innerHTML = "";
    if (s.label) {
      c.append(el("span", { class: "countdown__big" }, s.phase === "before" ? String(s.days) : (s.day || "")),
        el("span", { class: "countdown__lbl" }, s.label));
      c.classList.toggle("countdown--during", s.phase === "during");
    }
  }

  function init() {
    if (!T || !T.startDate) {
      $("#app").innerHTML = '<p class="muted" style="padding:2rem">No trip loaded. Add your itinerary in <code>js/data.js</code>.</p>';
      return;
    }
    renderChrome();
    $$(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.target)));
    show("home");
    // Refresh the countdown each minute so "today" stays accurate.
    setInterval(renderChrome, 60000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
