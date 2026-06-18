/*
 * ─────────────────────────────────────────────────────────────────────────
 *  TRIP DATA  ·  This is the ONE file you edit to load your real itinerary.
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Everything in the app — the calendar, the day-by-day schedule, the
 *  reservations list, reminders, things to do and places to eat — is built
 *  from the single `TRIP` object below. Replace the sample content with your
 *  own and the whole app updates automatically. Nothing else needs to change.
 *
 *  Dates are "YYYY-MM-DD". Times are 24h "HH:MM" (or "" / omitted for all-day).
 *
 *  Reservation / event `type` controls the icon + colour. Supported types:
 *    flight · train · hotel · car · ferry · tour · restaurant · activity ·
 *    transfer · meeting · note   (anything else falls back to a generic pin)
 *
 *  The sample below is a 12-day Italy → France family trip so you can see the
 *  app fully working. Swap it out when you upload your itinerary.
 */

const TRIP = {
  title: "Kontonis Family — European Adventure",
  subtitle: "Italy & France · Summer 2026",
  startDate: "2026-07-04",
  endDate: "2026-07-15",
  homeCity: "Toronto",
  travelers: ["John", "Maria", "Alex", "Sophia"],

  // Cities visited, in order. `arrive`/`depart` are dates.
  cities: [
    { name: "Rome",     country: "Italy",  emoji: "🇮🇹", arrive: "2026-07-04", depart: "2026-07-08" },
    { name: "Florence", country: "Italy",  emoji: "🇮🇹", arrive: "2026-07-08", depart: "2026-07-11" },
    { name: "Paris",    country: "France", emoji: "🇫🇷", arrive: "2026-07-11", depart: "2026-07-15" },
  ],

  // ── Reservations ──────────────────────────────────────────────────────
  // Flights, hotels, trains, cars, tours — anything with a confirmation #.
  // These also show up on the calendar and inside each day automatically.
  reservations: [
    {
      type: "flight", title: "Toronto → Rome", airline: "Air Canada", code: "AC890",
      date: "2026-07-04", time: "21:55", endDate: "2026-07-05", endTime: "12:40",
      from: "Toronto (YYZ)", to: "Rome (FCO)", confirmation: "X7K2QP",
      seats: "32A–32D", terminal: "Terminal 1", notes: "Overnight flight. Check in online 24h before.",
    },
    {
      type: "hotel", title: "Hotel Artemide", city: "Rome",
      date: "2026-07-05", endDate: "2026-07-08", time: "15:00", endTime: "11:00",
      address: "Via Nazionale 22, Rome", confirmation: "HTL-559213",
      notes: "Family room, breakfast included. Check-in 3pm, check-out 11am.",
      phone: "+39 06 489911",
    },
    {
      type: "train", title: "Rome → Florence", operator: "Trenitalia Frecciarossa", code: "9518",
      date: "2026-07-08", time: "10:35", endTime: "12:08",
      from: "Roma Termini", to: "Firenze S.M.N.", confirmation: "TR-7781234",
      seats: "Coach 4, 5A–5D", notes: "High-speed train. Be at platform 15 min early.",
    },
    {
      type: "hotel", title: "Hotel Davanzati", city: "Florence",
      date: "2026-07-08", endDate: "2026-07-11", time: "14:00", endTime: "11:00",
      address: "Via Porta Rossa 5, Florence", confirmation: "HTL-880471",
      notes: "Central, near Ponte Vecchio. Free family welcome aperitivo.",
      phone: "+39 055 286666",
    },
    {
      type: "flight", title: "Florence → Paris", airline: "Air France", code: "AF1067",
      date: "2026-07-11", time: "13:20", endTime: "15:25",
      from: "Florence (FLR)", to: "Paris (CDG)", confirmation: "9PLM4R",
      seats: "18A–18D", notes: "Allow 2h for airport. Carry-on only recommended.",
    },
    {
      type: "hotel", title: "Hôtel Le Walt", city: "Paris",
      date: "2026-07-11", endDate: "2026-07-15", time: "15:00", endTime: "12:00",
      address: "37 Avenue de la Motte-Picquet, Paris", confirmation: "HTL-204918",
      notes: "Steps from the Eiffel Tower. Connecting rooms requested.",
      phone: "+33 1 45 51 55 83",
    },
    {
      type: "flight", title: "Paris → Toronto", airline: "Air Canada", code: "AC871",
      date: "2026-07-15", time: "13:30", endTime: "16:05",
      from: "Paris (CDG)", to: "Toronto (YYZ)", confirmation: "X7K2QP",
      seats: "29A–29D", notes: "Return leg. Daytime flight (~8h).",
    },
    {
      type: "tour", title: "Vatican & Sistine Chapel — Skip-the-Line", city: "Rome",
      date: "2026-07-06", time: "09:00", endTime: "12:00",
      location: "Vatican Museums entrance", confirmation: "GYG-RM-44219",
      notes: "Guided family tour. Bring printed/QR ticket. Dress code: shoulders & knees covered.",
    },
    {
      type: "tour", title: "Uffizi Gallery — Reserved Entry", city: "Florence",
      date: "2026-07-09", time: "10:00", endTime: "12:30",
      location: "Uffizi Gallery, Piazzale degli Uffizi", confirmation: "UFF-330155",
      notes: "Timed entry. Arrive 15 min early at reservation desk (door 3).",
    },
    {
      type: "tour", title: "Eiffel Tower Summit — Lift Tickets", city: "Paris",
      date: "2026-07-12", time: "18:30", endTime: "20:30",
      location: "Eiffel Tower, South Pillar", confirmation: "ET-901662",
      notes: "Sunset slot. Security line can be long — arrive 30 min early.",
    },
  ],

  // ── Day-by-day schedule ───────────────────────────────────────────────
  // Each day's `items` are the loose plans/notes for that day. Reservations
  // above are merged in automatically by date, so don't duplicate them here.
  days: [
    {
      date: "2026-07-04", city: "Rome", title: "Departure day",
      items: [
        { time: "18:30", type: "transfer", title: "Leave for the airport", notes: "Allow 3h before an international flight." },
      ],
    },
    {
      date: "2026-07-05", city: "Rome", title: "Arrive & ease in",
      items: [
        { time: "13:30", type: "transfer", title: "Taxi FCO → hotel", notes: "Fixed fare ~€55 to city centre." },
        { time: "17:00", type: "activity", title: "Evening stroll: Trevi Fountain & Spanish Steps", notes: "Gelato stop on the way back." },
      ],
    },
    {
      date: "2026-07-06", city: "Rome", title: "Ancient Rome & Vatican",
      items: [
        { time: "14:30", type: "activity", title: "Colosseum & Roman Forum", notes: "Tickets in Reservations. Hats & water — little shade." },
      ],
    },
    {
      date: "2026-07-07", city: "Rome", title: "Free family day",
      items: [
        { time: "10:00", type: "activity", title: "Villa Borghese gardens + rowboats", notes: "Great for the kids; bike rentals available." },
        { time: "20:00", type: "note", title: "Pack for Florence", notes: "Early-ish train tomorrow." },
      ],
    },
    {
      date: "2026-07-08", city: "Florence", title: "Train to Florence",
      items: [
        { time: "16:00", type: "activity", title: "Ponte Vecchio at golden hour", notes: "Window-shop the goldsmiths." },
      ],
    },
    {
      date: "2026-07-09", city: "Florence", title: "Renaissance day",
      items: [
        { time: "15:00", type: "activity", title: "Climb the Duomo / Giotto's Campanile", notes: "463 steps — worth it. Book the Duomo combo if not done." },
      ],
    },
    {
      date: "2026-07-10", city: "Florence", title: "Day trip option",
      items: [
        { time: "09:30", type: "activity", title: "Optional: Pisa or Tuscany hills", notes: "Decide morning-of based on weather & energy." },
      ],
    },
    {
      date: "2026-07-11", city: "Paris", title: "Fly to Paris",
      items: [
        { time: "19:30", type: "activity", title: "First look at the Eiffel Tower", notes: "From Champ de Mars — picnic dinner on the lawn." },
      ],
    },
    {
      date: "2026-07-12", city: "Paris", title: "Museums & the Tower",
      items: [
        { time: "10:00", type: "activity", title: "Louvre (morning, pre-booked) ", notes: "Head straight to the highlights with kids." },
      ],
    },
    {
      date: "2026-07-13", city: "Paris", title: "Montmartre & river",
      items: [
        { time: "10:30", type: "activity", title: "Montmartre & Sacré-Cœur", notes: "Artists' square; carousel for the little ones." },
        { time: "20:00", type: "activity", title: "Seine evening river cruise", notes: "Book a 1h sightseeing cruise near Pont de l'Alma." },
      ],
    },
    {
      date: "2026-07-14", city: "Paris", title: "Bastille Day 🎆",
      items: [
        { time: "11:00", type: "activity", title: "Morning parade on the Champs-Élysées", notes: "Very crowded — arrive early, hold hands." },
        { time: "22:00", type: "activity", title: "Bastille Day fireworks at the Eiffel Tower", notes: "Stake out a Champ de Mars spot by 20:00." },
      ],
    },
    {
      date: "2026-07-15", city: "Paris", title: "Fly home",
      items: [
        { time: "10:00", type: "transfer", title: "Hotel → CDG airport", notes: "Pre-book a van taxi for 4 + luggage." },
      ],
    },
  ],

  // ── Things to do ──────────────────────────────────────────────────────
  // Wishlist of sights/activities per city. The app lets you tick them off.
  thingsToDo: [
    { city: "Rome",     name: "Colosseum & Roman Forum", category: "Sights",    notes: "Iconic. Book skip-the-line." },
    { city: "Rome",     name: "Vatican Museums & Sistine Chapel", category: "Museum", notes: "Booked — see Reservations." },
    { city: "Rome",     name: "Trevi Fountain",          category: "Sights",    notes: "Toss a coin. Best early or late." },
    { city: "Rome",     name: "Pantheon",                category: "Sights",    notes: "Free-ish entry, stunning dome." },
    { city: "Rome",     name: "Villa Borghese & boats",  category: "Family",    notes: "Kids love the rowboats." },
    { city: "Florence", name: "Uffizi Gallery",          category: "Museum",    notes: "Booked — see Reservations." },
    { city: "Florence", name: "Climb the Duomo",         category: "Sights",    notes: "Book a timed slot." },
    { city: "Florence", name: "Ponte Vecchio",           category: "Sights",    notes: "Go at sunset." },
    { city: "Florence", name: "Boboli Gardens",          category: "Family",    notes: "Shade & space to run." },
    { city: "Paris",    name: "Eiffel Tower summit",     category: "Sights",    notes: "Booked — see Reservations." },
    { city: "Paris",    name: "Louvre Museum",           category: "Museum",    notes: "Pre-book morning entry." },
    { city: "Paris",    name: "Seine river cruise",      category: "Family",    notes: "1h, great with kids." },
    { city: "Paris",    name: "Montmartre & Sacré-Cœur", category: "Sights",    notes: "Funicular up the hill." },
    { city: "Paris",    name: "Luxembourg Gardens",      category: "Family",    notes: "Toy sailboats on the pond." },
  ],

  // ── Places to eat ─────────────────────────────────────────────────────
  // `reservation` is optional — fill it when you've booked a table.
  placesToEat: [
    { city: "Rome",     name: "Roscioli",            cuisine: "Roman / deli",   area: "Campo de' Fiori", notes: "Famous carbonara. Book ahead.", reservation: "" },
    { city: "Rome",     name: "Pizzarium Bonci",     cuisine: "Pizza al taglio", area: "Prati",          notes: "Quick lunch near the Vatican.", reservation: "" },
    { city: "Rome",     name: "Giolitti",            cuisine: "Gelato",         area: "Centro",          notes: "Classic gelateria since 1900.", reservation: "" },
    { city: "Rome",     name: "Armando al Pantheon", cuisine: "Trattoria",      area: "Pantheon",        notes: "Cozy, family-run. Reserve!", reservation: "Mon 7 Jul, 20:00 (4)" },
    { city: "Florence", name: "Trattoria Mario",     cuisine: "Tuscan",         area: "San Lorenzo",     notes: "Lunch only, no bookings, go early.", reservation: "" },
    { city: "Florence", name: "All'Antico Vinaio",   cuisine: "Schiacciata",    area: "Centro",          notes: "Legendary sandwiches. Expect a line.", reservation: "" },
    { city: "Florence", name: "Gelateria dei Neri",  cuisine: "Gelato",         area: "Santa Croce",     notes: "Among the best in town.", reservation: "" },
    { city: "Paris",    name: "Le Comptoir du Relais", cuisine: "Bistro",       area: "Saint-Germain",   notes: "Classic Paris bistro.", reservation: "" },
    { city: "Paris",    name: "Breizh Café",         cuisine: "Crêpes",         area: "Le Marais",       notes: "Kid-friendly savoury & sweet crêpes.", reservation: "" },
    { city: "Paris",    name: "Berthillon",          cuisine: "Ice cream",      area: "Île Saint-Louis", notes: "The Paris ice-cream institution.", reservation: "" },
    { city: "Paris",    name: "L'As du Fallafel",    cuisine: "Falafel",        area: "Le Marais",       notes: "Quick, cheap, delicious lunch.", reservation: "" },
  ],

  // ── Extra reminders ───────────────────────────────────────────────────
  // One-off to-dos with a date/time. Reservations already generate their own
  // "leave / check-in" nudges, so use this for everything else.
  reminders: [
    { date: "2026-06-20", time: "09:00", title: "Check passports are valid 6+ months", notes: "All four passports." },
    { date: "2026-06-28", time: "12:00", title: "Buy travel insurance",               notes: "Family policy with medical." },
    { date: "2026-07-03", time: "18:00", title: "Online check-in opens (AC890)",       notes: "24h before departure." },
    { date: "2026-07-03", time: "20:00", title: "Charge devices & pack adapters",      notes: "EU Type C/F plugs." },
    { date: "2026-07-07", time: "21:00", title: "Pack for the Florence train",         notes: "Train leaves 10:35 tomorrow." },
    { date: "2026-07-10", time: "21:00", title: "Re-pack & carry-on only for FLR→CDG", notes: "Short flight, light bags." },
    { date: "2026-07-14", time: "19:30", title: "Get fireworks spot at Champ de Mars", notes: "Bring a blanket & snacks." },
  ],

  // Handy numbers shown on the Info screen. Add your own.
  emergency: [
    { label: "EU emergency (all)", value: "112" },
    { label: "Italy — Police",     value: "113" },
    { label: "France — Police",    value: "17" },
    { label: "Travel insurance",   value: "+1 800 555 0199" },
  ],
};

// Expose for the app.
window.TRIP = TRIP;
