// The ceremonies a guest can RSVP to. Order here is the order they appear in
// the form, the admin table and the CSV.
//
// Marriage reuses the original `attending` / `guest_count` columns rather than
// getting its own pair. Those columns predate multi-event support and already
// hold every response collected so far, so pointing marriage at them keeps that
// data meaningful instead of stranding it beside an empty marriage_attending.
export const EVENTS = [
  { key: 'haldi', label: 'Haldi', attendingCol: 'haldi_attending', guestsCol: 'haldi_guest_count' },
  { key: 'mehendi', label: 'Mehendi', attendingCol: 'mehendi_attending', guestsCol: 'mehendi_guest_count' },
  { key: 'marriage', label: 'Marriage', attendingCol: 'attending', guestsCol: 'guest_count' },
];

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
