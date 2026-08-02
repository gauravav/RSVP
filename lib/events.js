// The ceremonies a guest can RSVP to. Order here is the order they appear in
// the form, the admin table and the CSV.
//
// Marriage reuses the original `attending` / `guest_count` columns rather than
// getting its own pair. Those columns predate multi-event support and already
// hold every response collected so far, so pointing marriage at them keeps that
// data meaningful instead of stranding it beside an empty marriage_attending.
// Times carry an explicit -04:00 offset. North Carolina is on EDT in late
// August, not EST — writing them as EST (-05:00) would put every calendar
// invite an hour early.
export const EVENTS = [
  {
    key: 'haldi',
    label: 'Haldi',
    attendingCol: 'haldi_attending',
    guestsCol: 'haldi_guest_count',
    start: '2026-08-24T08:00:00-04:00',
    durationMinutes: 240,
    dateLabel: 'Monday, 24 August 2026',
    timeLabel: '8:00 AM onwards',
    venue: 'At Home',
    address: '8002 Foxcroft Dr, Monroe, NC 28110',
  },
  {
    key: 'mehendi',
    label: 'Mehendi',
    attendingCol: 'mehendi_attending',
    guestsCol: 'mehendi_guest_count',
    start: '2026-08-24T18:00:00-04:00',
    durationMinutes: 240,
    dateLabel: 'Monday, 24 August 2026',
    timeLabel: '6:00 PM onwards',
    venue: 'At Home',
    address: '8002 Foxcroft Dr, Monroe, NC 28110',
  },
  {
    key: 'marriage',
    label: 'Wedding',
    attendingCol: 'attending',
    guestsCol: 'guest_count',
    // The calendar entry opens at 9:30 so guests are seated before the
    // Muhurtham itself, which is the 10:23 moment called out below.
    start: '2026-08-26T09:30:00-04:00',
    durationMinutes: 240,
    dateLabel: 'Wednesday, 26 August 2026',
    timeLabel: '9:30 AM onwards',
    note: 'Muhurtham at 10:23 AM',
    venue: 'Farm at Willow Creek Center',
    address: '15560 US-601, Midland, NC 28107',
  },
];

export function mapsUrl(event) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${event.venue}, ${event.address}`
  )}`;
}

export const EVENT_KEYS = EVENTS.map((e) => e.key);

export const DEFAULT_EVENT_KEYS = ['marriage'];

export function eventByKey(key) {
  return EVENTS.find((e) => e.key === key);
}

// Reads the ?events= query param that decides which ceremonies a given embed
// asks about:
//
//   (absent)                    -> marriage only
//   all                         -> haldi, mehendi, marriage
//   haldi,marriage              -> just those, always in EVENTS order
//
// Anything unrecognised falls back to marriage only, so a mistyped URL still
// shows a working form rather than an empty one.
export function parseEventKeys(param) {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) return DEFAULT_EVENT_KEYS;

  const value = String(raw).toLowerCase().trim();
  if (value === 'all') return EVENT_KEYS;

  const requested = value.split(',').map((s) => s.trim());
  const keys = EVENT_KEYS.filter((k) => requested.includes(k));
  return keys.length > 0 ? keys : DEFAULT_EVENT_KEYS;
}

export const ATTENDING_OPTIONS = [
  { value: 'yes', label: "Yes, I'll be there" },
  { value: 'no', label: "Sorry, can't make it" },
  { value: 'maybe', label: 'Not sure yet' },
];

export function isValidAttending(value) {
  return ATTENDING_OPTIONS.some((o) => o.value === value);
}
