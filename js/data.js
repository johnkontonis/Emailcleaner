/*
 * ─────────────────────────────────────────────────────────────────────────
 *  TRIP DATA  ·  This is the ONE file you edit to load your real itinerary.
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Everything in the app — the calendar, the day-by-day schedule, the
 *  reservations list, reminders, things to do and places to eat — is built
 *  from the single `TRIP` object below.
 *
 *  Dates are "YYYY-MM-DD". Times are 24h "HH:MM" (or "" / omitted for all-day).
 *
 *  STATUS: Flights below are CONFIRMED from booking documents (Emirates GTV6ZJ
 *  and SKY express ZKHT01). Items marked ✳️ TENTATIVE are placeholders to
 *  confirm — hotels, the Crete⇄Rome leg, any extra stops, and day plans aren't
 *  booked/known yet. Things-to-do and places-to-eat are real, well-known
 *  SUGGESTIONS (not bookings) so the sections aren't empty.
 */

const TRIP = {
  title: "Kontonis Family — European Adventure",
  subtitle: "Greece & Italy · Summer 2026",
  startDate: "2026-06-27",
  endDate: "2026-07-16",
  homeCity: "Melbourne",
  // Family of 4: John, Nevzer, Dion & Sophia (kept generic per preference).
  travelers: ["The Kontonis family"],

  // Cities visited, in order. Chania (arrive) & Rome (depart) are anchored by
  // the flights. The Crete→Rome transition (05–06 Jul) is ✳️ TENTATIVE, and
  // there may be extra stops in between — send details and I'll adjust.
  cities: [
    { name: "Chania (Crete)", country: "Greece", emoji: "🇬🇷", arrive: "2026-06-28", depart: "2026-07-02" },
    { name: "Rome",           country: "Italy",  emoji: "🇮🇹", arrive: "2026-07-06", depart: "2026-07-14" },
  ],

  // ── Reservations ──────────────────────────────────────────────────────
  // CONFIRMED flights. Emirates intl seats shown are Dion's e-ticket (GTV6ZJ);
  // the SKY express domestic leg (ZKHT01) has the whole family's seats.
  reservations: [
    {
      type: "flight", title: "Melbourne → Dubai", airline: "Emirates", code: "EK407",
      date: "2026-06-27", time: "21:15", endDate: "2026-06-28", endTime: "05:15",
      from: "Melbourne (MEL) · International", to: "Dubai (DXB) · Terminal 3",
      terminal: "Arrives DXB Terminal 3", seats: "35F (Dion)", confirmation: "GTV6ZJ",
      notes: "Premium Economy (Flex Plus) · 35 kg checked baggage. Ticket 176 2211993713-14. Be at MEL ~3h before (check-in from 17:15).",
    },
    {
      type: "flight", title: "Dubai → Athens", airline: "Emirates", code: "EK209",
      date: "2026-06-28", time: "10:50", endTime: "15:00",
      from: "Dubai (DXB) · Terminal 3", to: "Athens (ATH) · Eleftherios Venizelos",
      terminal: "Departs DXB Terminal 3", seats: "14F (Dion)", confirmation: "GTV6ZJ",
      notes: "Premium Economy (Flex Plus). ⚠️ Athens is a connection: arrive 15:00, then domestic SKY express to Crete at 17:30 — collect bags & re-check (~2h30).",
    },
    {
      type: "flight", title: "Athens → Chania (Crete)", airline: "SKY express", code: "GQ254",
      date: "2026-06-28", time: "17:30", endTime: "18:30",
      from: "Athens (ATH)", to: "Chania (CHQ) · Crete",
      seats: "1A, 2A, 1B, 2B (whole family)", confirmation: "ZKHT01",
      notes: "Economy · direct 1h. Booking.com ref 40-1009310867, PIN 2861. 4 checked bags (23 kg) + 4 carry-on (8 kg).",
    },
    {
      type: "hotel", title: "JW Marriott Crete Resort & Spa", city: "Chania (Crete)",
      date: "2026-06-28", endDate: "2026-07-02", time: "15:00", endTime: "11:00",
      address: "Marathi, Akrotiri, Chania 731 00, Crete, Greece", phone: "+30 282 1030550",
      confirmation: "74382334",
      notes: "Guest: Nevzer Kontonis · 4 guests, 1 room. 1-Bedroom Suite — 1 King + sofa bed, sea view, terrace. Smoke-free. ⚠️ Non-refundable after 11:59 PM, 19 Jun 2026. Beach resort on the Akrotiri peninsula (~15 min from Chania airport, ~20 min from the old town).",
    },
    {
      type: "flight", title: "Rome → Dubai", airline: "Emirates", code: "EK096",
      date: "2026-07-14", time: "22:10", endDate: "2026-07-15", endTime: "06:10",
      from: "Rome (FCO) · Fiumicino", to: "Dubai (DXB) · Terminal 3",
      terminal: "Departs FCO Terminal 3 · Arrives DXB Terminal 3", seats: "14A (Dion)", confirmation: "GTV6ZJ",
      notes: "Premium Economy (Flex Plus) · 35 kg checked baggage. Be at FCO ~3h before (check-in from 18:10).",
    },
    {
      type: "flight", title: "Dubai → Melbourne", airline: "Emirates", code: "EK406",
      date: "2026-07-15", time: "07:05", endDate: "2026-07-16", endTime: "05:30",
      from: "Dubai (DXB) · Terminal 3", to: "Melbourne (MEL) · International",
      terminal: "Departs DXB Terminal 3", seats: "33J (Dion)", confirmation: "GTV6ZJ",
      notes: "Premium Economy (Flex Plus) · 35 kg checked baggage. ⚠️ Tight Dubai connection (~55 min) — move quickly at DXB.",
    },
  ],

  // ── Day-by-day schedule ───────────────────────────────────────────────
  // Skeleton for the whole trip. Confirmed flights merge in by date.
  // The Crete→Rome transition (05–06 Jul) is ✳️ TENTATIVE.
  days: [
    { date: "2026-06-27", city: "Melbourne", title: "Depart Melbourne", items: [
      { time: "18:00", type: "transfer", title: "Head to Melbourne Airport (MEL)", notes: "Allow ~3h for an international flight." },
    ]},
    { date: "2026-06-28", city: "Chania (Crete)", title: "Arrive Athens → fly to Crete 🇬🇷", items: [
      { time: "15:00", type: "note", title: "Land in Athens — collect bags & re-check", notes: "Tight ~2h30 connection to the domestic SKY express flight." },
      { time: "19:00", type: "transfer", title: "Chania Airport → JW Marriott (Marathi)", notes: "Short ~15 min hop on the Akrotiri peninsula." },
      { time: "20:30", type: "activity", title: "First night — settle in & dinner at the resort", notes: "Easy, jet-lag-friendly evening. Old town can wait for tomorrow." },
    ]},
    { date: "2026-06-29", city: "Chania (Crete)", title: "Chania, Crete", items: [] },
    { date: "2026-06-30", city: "Chania (Crete)", title: "Chania, Crete", items: [] },
    { date: "2026-07-01", city: "Chania (Crete)", title: "Chania, Crete", items: [] },
    { date: "2026-07-02", city: "Chania (Crete)", title: "Check out of Chania hotel", items: [
      { time: "11:00", type: "transfer", title: "Hotel check-out (by 11:00)", notes: "✳️ Where to next? Send the next leg + hotel and I'll fill in 02–06 Jul." },
    ]},
    { date: "2026-07-03", city: "✳️ Next stop (TBD)", title: "✳️ TBD — awaiting details", items: [] },
    { date: "2026-07-04", city: "✳️ Next stop (TBD)", title: "✳️ TBD — awaiting details", items: [] },
    { date: "2026-07-05", city: "✳️ Next stop (TBD)", title: "✳️ TBD — awaiting details", items: [] },
    { date: "2026-07-06", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-07", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-08", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-09", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-10", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-11", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-12", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-13", city: "Rome", title: "Rome", items: [
      { time: "", type: "note", title: "Pre-book Rome → FCO airport transfer", notes: "Van taxi for 4 + luggage. Flight out is 22:10." },
    ]},
    { date: "2026-07-14", city: "Rome", title: "Depart Rome (night flight)", items: [
      { time: "19:00", type: "transfer", title: "Rome → Fiumicino Airport (FCO)", notes: "Be at FCO ~3h before EK096 (22:10)." },
    ]},
    { date: "2026-07-15", city: "In transit", title: "In transit via Dubai", items: [] },
    { date: "2026-07-16", city: "Melbourne", title: "Arrive home in Melbourne", items: [
      { time: "05:30", type: "transfer", title: "Land at MEL — welcome home! 🎉", notes: "" },
    ]},
  ],

  // ── Things to do (real, well-known SUGGESTIONS — tick them off) ─────────
  thingsToDo: [
    { city: "Chania (Crete)", name: "Chania Old Town & Venetian Harbour", category: "Sights",  notes: "Wander the harbour & lighthouse at golden hour." },
    { city: "Chania (Crete)", name: "Balos Lagoon & Gramvousa",           category: "Day trip", notes: "Turquoise lagoon — boat trip or 4x4 + boat." },
    { city: "Chania (Crete)", name: "Elafonissi Beach (pink sand)",       category: "Day trip", notes: "Shallow, calm water — great for the kids." },
    { city: "Chania (Crete)", name: "Falassarna Beach sunset",            category: "Beach",    notes: "Long sandy beach, famous sunsets." },
    { city: "Chania (Crete)", name: "Samaria or Imbros Gorge hike",       category: "Nature",   notes: "Imbros is shorter/easier with children." },
    { city: "Chania (Crete)", name: "Maritime Museum of Crete",           category: "Museum",   notes: "By the harbour — quick, kid-friendly." },
    { city: "Chania (Crete)", name: "Knossos Palace (day trip)",          category: "Day trip", notes: "Minoan palace near Heraklion — longer drive." },
    { city: "Rome",   name: "Colosseum & Roman Forum",          category: "Sights",  notes: "Book skip-the-line. Hats & water — little shade." },
    { city: "Rome",   name: "Vatican Museums & Sistine Chapel", category: "Museum",  notes: "Book ahead. Shoulders & knees covered." },
    { city: "Rome",   name: "St. Peter's Basilica & dome climb", category: "Sights", notes: "Free entry; small fee for the dome." },
    { city: "Rome",   name: "Trevi Fountain",                   category: "Sights",  notes: "Toss a coin. Best early or late." },
    { city: "Rome",   name: "Pantheon",                         category: "Sights",  notes: "Stunning dome; reserve a slot online." },
    { city: "Rome",   name: "Villa Borghese gardens & boats",   category: "Family",  notes: "Rowboats + bikes — great for the kids." },
    { city: "Rome",   name: "Trastevere evening wander",        category: "Family",  notes: "Cobbled lanes, gelato, lively dinner spots." },
  ],

  // ── Places to eat (real, well-known SUGGESTIONS — no bookings yet) ──────
  placesToEat: [
    { city: "Chania (Crete)", name: "Tamam",          cuisine: "Cretan",        area: "Old Town",     notes: "Traditional Cretan in a former hammam.", reservation: "" },
    { city: "Chania (Crete)", name: "To Maridaki",    cuisine: "Seafood / meze", area: "Chania",      notes: "Local favourite for fresh fish & mezze.", reservation: "" },
    { city: "Chania (Crete)", name: "Salis",          cuisine: "Modern Cretan", area: "Venetian Harbour", notes: "Harbour views, good for families.", reservation: "" },
    { city: "Chania (Crete)", name: "Oasis",          cuisine: "Souvlaki / gyros", area: "Chania",    notes: "Quick, cheap, kid-friendly.", reservation: "" },
    { city: "Chania (Crete)", name: "Bougatsa Chania", cuisine: "Bougatsa",     area: "Old Town",     notes: "Cretan cheese pastry — breakfast/snack.", reservation: "" },
    { city: "Rome",   name: "Roscioli",            cuisine: "Roman / deli",     area: "Campo de' Fiori", notes: "Famous carbonara. Book ahead.", reservation: "" },
    { city: "Rome",   name: "Pizzarium Bonci",     cuisine: "Pizza al taglio",  area: "Prati",       notes: "Quick lunch near the Vatican.", reservation: "" },
    { city: "Rome",   name: "Armando al Pantheon", cuisine: "Trattoria",        area: "Pantheon",    notes: "Cozy, family-run. Reserve early!", reservation: "" },
    { city: "Rome",   name: "Giolitti",            cuisine: "Gelato",           area: "Centro",      notes: "Classic gelateria since 1900.", reservation: "" },
    { city: "Rome",   name: "Da Enzo al 29",       cuisine: "Roman trattoria",  area: "Trastevere",  notes: "Beloved local spot — go early or queue.", reservation: "" },
  ],

  // ── Reminders (practical, derived from the flights) ────────────────────
  reminders: [
    { date: "2026-06-19", time: "09:00", title: "Check passports valid 6+ months",       notes: "All 4 travelers — Greece & Italy (Schengen)." },
    { date: "2026-06-19", time: "20:00", title: "⚠️ Chania hotel free-cancellation ends tonight", notes: "Confirmation 74382334 — prepaid / non-refundable after 11:59 PM, 19 Jun." },
    { date: "2026-06-20", time: "12:00", title: "Buy family travel insurance",            notes: "Include medical & baggage cover." },
    { date: "2026-06-22", time: "12:00", title: "Check Greece & Italy entry requirements", notes: "Schengen rules for Australian passport holders." },
    { date: "2026-06-25", time: "21:15", title: "Online check-in opens (EK407)",          notes: "Emirates opens ~48h before departure." },
    { date: "2026-06-26", time: "20:00", title: "Pack — EU Type C/F adapters & chargers",  notes: "Emirates 35 kg checked; SKY express 23 kg checked + 8 kg carry-on." },
    { date: "2026-06-27", time: "18:15", title: "Arrive at Melbourne Airport (MEL)",       notes: "~3h before EK407 (21:15). 90 min before for passport control." },
    { date: "2026-06-28", time: "15:00", title: "Athens: clear immigration, grab bags, re-check", notes: "Only ~2h30 to the Crete flight (SKY express GQ254, 17:30)." },
    { date: "2026-07-13", time: "18:00", title: "Confirm Rome → FCO airport transfer",     notes: "Van taxi for 4 + luggage." },
    { date: "2026-07-14", time: "19:10", title: "Arrive at Rome Fiumicino (FCO)",          notes: "~3h before EK096 (22:10)." },
  ],

  // Handy numbers shown on the Info screen.
  emergency: [
    { label: "EU emergency (all)",      value: "112" },
    { label: "Greece — Police",         value: "100" },
    { label: "Greece — Ambulance",      value: "166" },
    { label: "Italy — Police",          value: "113" },
    { label: "Emirates (Australia)",    value: "1300 303 777" },
    { label: "Aus consular emergency",  value: "+61 2 6261 3305" },
  ],
};

// Expose for the app.
window.TRIP = TRIP;
