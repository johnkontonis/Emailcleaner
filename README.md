# European Adventure 🧳

A simple, installable trip companion for our family's European trip. It keeps
everything in one place:

- **🏠 Home** — countdown to the trip, what's on today / up next, next bookings,
  upcoming reminders, and trip stats.
- **🗓️ Calendar** — the full day-by-day itinerary, with today highlighted.
- **🎫 Bookings** — every reservation (flights, hotels, trains, tours) with
  confirmation numbers you can tap to copy.
- **📍 Do** — things to do in each city, with check-off so you can tick them off.
- **🍽️ Eat** — places to eat per city, with table-booking notes.
- **ℹ️ Info** — where you're staying, all reminders, and emergency numbers.

It's a static **PWA** (no build step) that works offline and can be added to
your phone's home screen.

## Run it

```bash
# serve it (recommended — service worker + manifest need http://)
python3 -m http.server 8000
# then open http://localhost:8000
```

On your phone, open the site and choose **Add to Home Screen** for an
app-like, offline experience.

## Loading your itinerary

**Everything in the app is generated from one file: [`js/data.js`](js/data.js).**
Open it and replace the sample `TRIP` object with your real trip. The structure
is documented inline at the top of the file. In short:

| Field | What it holds |
|-------|---------------|
| `title`, `subtitle`, `startDate`, `endDate`, `travelers` | Trip basics |
| `cities[]` | Each city + arrive/depart dates |
| `reservations[]` | Flights, hotels, trains, tours (+ confirmation #) |
| `days[]` | Day-by-day plans (reservations are merged in by date) |
| `thingsToDo[]` | Sights/activities per city (tick-off list) |
| `placesToEat[]` | Restaurants per city (+ optional booking note) |
| `reminders[]` | Dated to-dos / nudges |
| `emergency[]` | Key phone numbers |

Dates are `"YYYY-MM-DD"`; times are 24-hour `"HH:MM"`. Reservation/event
`type` (e.g. `flight`, `hotel`, `train`, `tour`, `activity`) sets the icon and
colour.

> **Got an itinerary to add?** Send it over (PDF, email, screenshots, or just
> paste it) and it'll be transcribed straight into `js/data.js` — no other
> files need to change.

## Project layout

```
index.html                 # app shell + bottom tab bar
css/styles.css             # styling (warm, postcard theme)
js/app.js                  # all rendering + navigation
js/data.js                 # ← the trip itinerary (edit this)
manifest.webmanifest       # PWA manifest
sw.js                      # service worker (offline cache)
scripts/make_icons.py      # regenerate the globe app icons
icons/                     # home-screen icons
```
