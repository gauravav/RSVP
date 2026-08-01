import { insertRsvp, listRsvps } from '../../lib/db';
import { isValidAdminCookie, parseCookies } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { name, email, phone, attending, guestCount, message, side } = req.body || {};

      if (!name || !attending) {
        return res.status(400).json({ error: 'Name and attending status are required.' });
      }

      const parsedGuestCount = Number(guestCount) || 1;
      const allowedSides = ['bride', 'groom'];
      const parsedSide = allowedSides.includes(side) ? side : 'unspecified';

      const saved = await insertRsvp({
        name: String(name).trim(),
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        attending: String(attending),
        guestCount: parsedGuestCount,
        message: message ? String(message).trim() : null,
        side: parsedSide,
      });

      return res.status(200).json({ ok: true, id: saved.id });
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
