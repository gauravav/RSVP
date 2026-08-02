import { EVENTS, eventByKey } from './events';

// Times go out as UTC with a trailing Z rather than a local time plus TZID.
// TZID needs an accompanying VTIMEZONE block to be strictly valid, and clients
// vary in how well they cope without one; UTC is unambiguous everywhere and
// still displays in each guest's own zone — which matters when some of them
// are eight and a half hours ahead.
function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
    date.getUTCHours()
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Commas, semicolons and backslashes are field separators in iCalendar and
// have to be escaped, or an address like "Monroe, NC" silently truncates.
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// iCalendar lines are limited to 75 octets; longer ones continue on the next
// line prefixed with a single space.
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

function veventFor(event, stamp) {
  const start = new Date(event.start);
  const end = new Date(start.getTime() + event.durationMinutes * 60000);
  const location = `${event.venue}, ${event.address}`;

  return [
    'BEGIN:VEVENT',
    // Stable per event, so re-downloading updates the existing entry in the
    // guest's calendar instead of adding a duplicate.
    `UID:${event.key}-2026@rsvp-self.vercel.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(event.label)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(`${event.timeLabel}\n${event.venue}\n${event.address}`)}`,
    'END:VEVENT',
  ];
}

// Builds a calendar containing the given events. Pass the keys the guest said
// yes to, so they aren't handed invites to ceremonies they declined.
export function buildIcs(eventKeys) {
  const stamp = toIcsUtc(new Date());
  const chosen = eventKeys.map(eventByKey).filter(Boolean);
  const events = chosen.length > 0 ? chosen : EVENTS;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RSVP//Wedding//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((e) => veventFor(e, stamp)),
    'END:VCALENDAR',
  ];

  // CRLF is required by the spec, and some clients reject files without it.
  return lines.map(fold).join('\r\n');
}

export function downloadIcs(eventKeys, filename = 'wedding-events.ics') {
  const blob = new Blob([buildIcs(eventKeys)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
