import { buildIcs } from '../../lib/ics';
import { EVENT_KEYS } from '../../lib/events';

// Serves the invite from a real URL rather than a blob built in the page.
//
// The form runs inside a cross-origin iframe, and browsers routinely block
// downloads triggered from one. iOS Safari in particular only hands an .ics
// to the Calendar app when it arrives as a normal navigation with the right
// Content-Type — a blob URL tends to open as plain text or do nothing at all.
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const raw = Array.isArray(req.query.events) ? req.query.events[0] : req.query.events;
  const requested = String(raw || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim());

  // Unknown keys are dropped; an empty result falls back to every ceremony.
  const keys = EVENT_KEYS.filter((k) => requested.includes(k));

  const ics = buildIcs(keys);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wedding-events.ics"');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send(ics);
}
