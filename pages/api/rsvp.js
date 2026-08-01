import { upsertRsvp, listRsvps } from '../../lib/db';
import { isValidAdminCookie, parseCookies } from '../../lib/auth';
import { normalizePhone } from '../../lib/countries';
import { isBlankName } from '../../lib/names';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { firstName, lastName, countryCode, number, attending, guestCount, message, side } =
        req.body || {};

      if (isBlankName(firstName) || isBlankName(lastName)) {
        return res.status(400).json({ error: 'First and last name are required.' });
      }
      if (!attending) {
        return res.status(400).json({ error: 'Attending status is required.' });
      }

      // Phone is what a returning guest is matched on, so it has to be valid.
      const phone = normalizePhone(countryCode, number);
      if (!phone) {
        return res.status(400).json({ error: 'Please enter a valid phone number.' });
      }

      const rawGuestCount = Number(guestCount) || 1;
      const parsedGuestCount = Math.min(10, Math.max(1, Math.round(rawGuestCount)));
      const allowedSides = ['bride', 'groom'];
      const parsedSide = allowedSides.includes(side) ? side : 'unspecified';

      const saved = await upsertRsvp({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phone,
        countryCode: String(countryCode),
        attending: String(attending),
        guestCount: parsedGuestCount,
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
