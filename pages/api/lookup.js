import { findRsvpByPhone } from '../../lib/db';
import { normalizePhone } from '../../lib/countries';

// Public endpoint: lets a returning guest pull up their own RSVP by phone
// number so the form can be prefilled and edited. Deliberately returns only
// the fields the form needs to repopulate itself — no id, no timestamps.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const { countryCode, number } = req.query;
  const phone = normalizePhone(countryCode, number);
  if (!phone) {
    return res.status(200).json({ found: false });
  }

  try {
    const row = await findRsvpByPhone(phone);
    if (!row) return res.status(200).json({ found: false });

    return res.status(200).json({
      found: true,
      rsvp: {
        name: row.name,
        attending: row.attending,
        guestCount: row.guest_count,
        message: row.message || '',
        side: row.side,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
}
