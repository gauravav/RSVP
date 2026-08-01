import { upsertRsvp, listRsvps } from '../../lib/db';
import { isValidAdminCookie, parseCookies } from '../../lib/auth';
import { normalizePhone } from '../../lib/countries';
import { isBlankName } from '../../lib/names';
import { EVENT_KEYS, isValidAttending } from '../../lib/events';
import { verifyTurnstile, clientIp } from '../../lib/turnstile';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { firstName, lastName, countryCode, number, responses, message, side, turnstileToken, website } =
        req.body || {};

      // Honeypot: a field hidden from real guests that automated form-fillers
      // populate anyway. Costs nothing and needs no configuration. Answer 200
      // so a bot can't tell it was caught and retry differently.
      if (website) {
        console.warn('Honeypot triggered, discarding submission.');
        return res.status(200).json({ ok: true, id: null, updated: false });
      }

      const human = await verifyTurnstile(turnstileToken, clientIp(req));
      if (!human) {
        return res
          .status(403)
          .json({ error: "Couldn't verify you're human. Please reload the page and try again." });
      }

      if (isBlankName(firstName) || isBlankName(lastName)) {
        return res.status(400).json({ error: 'First and last name are required.' });
      }

      // Phone is what a returning guest is matched on, so it has to be valid.
      const phone = normalizePhone(countryCode, number);
      if (!phone) {
        return res.status(400).json({ error: 'Please enter a valid phone number.' });
      }

      // Keep only events we recognise, so an edited request can't write to a
      // column the form never offered.
      const cleanResponses = {};
      for (const key of EVENT_KEYS) {
        const given = responses && responses[key];
        if (!given) continue;
        if (!isValidAttending(given.attending)) {
          return res.status(400).json({ error: `Please choose an answer for each event.` });
        }
        const raw = Number(given.guestCount) || 1;
        cleanResponses[key] = {
          attending: given.attending,
          // Guest count only means anything for an event they're attending.
          guestCount: given.attending === 'yes' ? Math.min(10, Math.max(1, Math.round(raw))) : null,
        };
      }

      if (Object.keys(cleanResponses).length === 0) {
        return res.status(400).json({ error: 'Please answer at least one event.' });
      }

      const allowedSides = ['bride', 'groom'];
      const parsedSide = allowedSides.includes(side) ? side : 'unspecified';

      const saved = await upsertRsvp({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phone,
        countryCode: String(countryCode),
        responses: cleanResponses,
        message: message ? String(message).trim() : null,
        side: parsedSide,
      });

      // Someone else already holds this number — almost always a typo, so say
      // so rather than overwriting their response.
      if (saved.conflict) {
        return res.status(409).json({
          error:
            'This phone number is already registered under a different name. Please check the number, or use a different one.',
        });
      }

      return res.status(200).json({ ok: true, id: saved.id, updated: saved.updated });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong saving your RSVP.' });
    }
  }

  if (req.method === 'GET') {
    // Admin-only: list all RSVPs
    const cookies = parseCookies(req.headers.cookie);
    if (!isValidAdminCookie(cookies.rsvp_admin)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const rows = await listRsvps();
      return res.status(200).json({ rsvps: rows });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to load RSVPs.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
