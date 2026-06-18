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
 *  STATUS: International flights below are CONFIRMED from the Emirates e-ticket
 *  (booking GTV6ZJ). Items marked ✳️ TENTATIVE are placeholders to confirm —
 *  the Athens⇄Rome split, hotels, internal travel, and day plans aren't in the
 *  ticket yet. Things-to-do and places-to-eat are real, well-known SUGGESTIONS
 *  (not bookings) so the sections aren't empty.
 */

const TRIP = {
  title: "Kontonis Family — European Adventure",
  subtitle: "Greece & Italy · Summer 2026",
  startDate: "2026-06-27",
  endDate: "2026-07-16",
  homeCity: "Melbourne",
  travelers: ["The Kontonis family"],

  // Cities visited, in order. Athens & Rome dates are anchored by the flights;
  // the split between them (07-06) is ✳️ TENTATIVE — confirm & I'll adjust.
  cities: [
    { name: "Athens", country: "Greece", emoji: "🇬🇷", arrive: "2026-06-28", depart: "2026-07-06" },
    { name: "Rome",   country: "Italy",  emoji: "🇮🇹", arrive: "2026-07-06", depart: "2026-07-14" },
  ],

  // ── Reservations ──────────────────────────────────────────────────────
  // CONFIRMED Emirates flights from the e-ticket (booking ref GTV6ZJ,
  // ticket 176 2211993713-14). Seats shown are Dion's (single e-ticket).
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
      notes: "Premium Economy (Flex Plus) · 35 kg checked baggage. Connection in Dubai ~5h35.",
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
  // City split on 07-06 is ✳️ TENTATIVE.
  days: [
    { date: "2026-06-27", city: "Melbourne", title: "Depart Melbourne", items: [
      { time: "18:00", type: "transfer", title: "Head to Melbourne Airport (MEL)", notes: "Allow ~3h for an international flight." },
    ]},
    { date: "2026-06-28", city: "Athens", title: "Arrive in Athens 🇬🇷", items: [
      { time: "16:00", type: "transfer", title: "Airport → accommodation", notes: "Metro Line 3 or taxi (~€40 flat fare to centre)." },
      { time: "19:00", type: "activity", title: "Easy first evening — dinner in Plaka", notes: "Jet-lag friendly stroll under the Acropolis." },
    ]},
    { date: "2026-06-29", city: "Athens", title: "Athens", items: [] },
    { date: "2026-06-30", city: "Athens", title: "Athens", items: [] },
    { date: "2026-07-01", city: "Athens", title: "Athens", items: [] },
    { date: "2026-07-02", city: "Athens", title: "Athens", items: [] },
    { date: "2026-07-03", city: "Athens", title: "Athens", items: [] },
    { date: "2026-07-04", city: "Athens", title: "Athens", items: [] },
    { date: "2026-07-05", city: "Athens", title: "Athens", items: [] },
    { date: "2026-07-06", city: "Rome", title: "✳️ Athens → Rome (confirm travel)", items: [
      { time: "", type: "note", title: "✳️ TENTATIVE: how do we get from Athens to Rome?", notes: "Flight or ferry? Send details and I'll add the booking + fix these dates." },
    ]},
    { date: "2026-07-07", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-08", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-09", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-10", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-11", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-12", city: "Rome", title: "Rome", items: [] },
    { date: "2026-07-13", city: "Rome", title: "Rome", items: [
      { time: "", type: "note", title: "Pre-book Rome → FCO airport transfer", notes: "Van taxi for the family + luggage. Flight out is 22:10." },
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
    { city: "Athens", name: "Acropolis & the Parthenon",        category: "Sights",  notes: "Go early (08:00) to beat heat & crowds. Book timed entry." },
    { city: "Athens", name: "Acropolis Museum",                 category: "Museum",  notes: "Cool, modern, kid-friendly. Glass floor over ruins." },
    { city: "Athens", name: "Ancient Agora & Temple of Hephaestus", category: "Sights", notes: "Best-preserved ancient temple in Greece." },
    { city: "Athens", name: "Plaka & Anafiotika wander",        category: "Family",  notes: "Charming old streets below the Acropolis." },
    { city: "Athens", name: "National Archaeological Museum",   category: "Museum",  notes: "World-class ancient Greek collection." },
    { city: "Athens", name: "Mount Lycabettus at sunset",       category: "Sights",  notes: "Funicular to the top for city + sea views." },
    { city: "Athens", name: "Day trip: Cape Sounion (Temple of Poseidon)", category: "Day trip", notes: "Sunset over the Aegean — ~1.5h drive." },
    { city: "Athens", name: "Optional day trip: Nafplio or Delphi", category: "Day trip", notes: "Decide based on energy & weather." },
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
    { city: "Athens", name: "O Thanasis",          cuisine: "Souvlaki / grill", area: "Monastiraki", notes: "Famous kebabs by Monastiraki square.", reservation: "" },
    { city: "Athens", name: "Kostas",              cuisine: "Souvlaki",         area: "Agia Irini",  notes: "Tiny legendary souvlaki spot, lunch.", reservation: "" },
    { city: "Athens", name: "Ta Karamanlidika tou Fani", cuisine: "Meze / deli", area: "Psyrri",    notes: "Great mezze platters, family-friendly.", reservation: "" },
    { city: "Athens", name: "Diporto Agoras",      cuisine: "Old taverna",      area: "Central Market", notes: "No-frills classic; cash only.", reservation: "" },
    { city: "Athens", name: "Lukumades",           cuisine: "Dessert",          area: "Agia Irini",  notes: "Greek honey doughnuts — kid favourite.", reservation: "" },
    { city: "Rome",   name: "Roscioli",            cuisine: "Roman / deli",     area: "Campo de' Fiori", notes: "Famous carbonara. Book ahead.", reservation: "" },
    { city: "Rome",   name: "Pizzarium Bonci",     cuisine: "Pizza al taglio",  area: "Prati",       notes: "Quick lunch near the Vatican.", reservation: "" },
    { city: "Rome",   name: "Armando al Pantheon", cuisine: "Trattoria",        area: "Pantheon",    notes: "Cozy, family-run. Reserve early!", reservation: "" },
    { city: "Rome",   name: "Giolitti",            cuisine: "Gelato",           area: "Centro",      notes: "Classic gelateria since 1900.", reservation: "" },
    { city: "Rome",   name: "Da Enzo al 29",       cuisine: "Roman trattoria",  area: "Trastevere",  notes: "Beloved local spot — go early or queue.", reservation: "" },
  ],

  // ── Reminders (practical, derived from the flights) ────────────────────
  reminders: [
    { date: "2026-06-19", time: "09:00", title: "Check passports valid 6+ months",       notes: "All travelers — Greece & Italy (Schengen)." },
    { date: "2026-06-20", time: "12:00", title: "Buy family travel insurance",            notes: "Include medical & baggage cover." },
    { date: "2026-06-22", time: "12:00", title: "Check Greece & Italy entry requirements", notes: "Schengen rules for Australian passport holders." },
    { date: "2026-06-25", time: "21:15", title: "Online check-in opens (EK407)",          notes: "Emirates opens ~48h before departure." },
    { date: "2026-06-26", time: "20:00", title: "Pack — EU Type C/F adapters & chargers",  notes: "PE allowance: 35 kg checked + 10 kg carry-on each." },
    { date: "2026-06-27", time: "18:15", title: "Arrive at Melbourne Airport (MEL)",       notes: "~3h before EK407 (21:15). 90 min before for passport control." },
    { date: "2026-07-13", time: "18:00", title: "Confirm Rome → FCO airport transfer",     notes: "Van taxi for the family + luggage." },
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
