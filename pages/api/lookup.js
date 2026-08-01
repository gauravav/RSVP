import { findRsvpByPhone } from '../../lib/db';
import { normalizePhone } from '../../lib/countries';
import { namesMatch, isBlankName } from '../../lib/names';

// Public endpoint: lets a returning guest pull up their own RSVP so the form
// can be prefilled and edited. Requires first name, last name AND the phone
// number to line up, so knowing a phone number alone reveals nothing.
//
// Every failure returns the same { found: false } — a wrong name and an unused
// number are indistinguishable, so this can't be used to test whether a given
// number is on the guest list.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const { countryCode, number, firstName, lastName } = req.query;

  const phone = normalizePhone(countryCode, number);
  if (!phone || isBlankName(firstName) || isBlankName(lastName)) {
    return res.status(200).json({ found: false });
  }

  try {
    const row = await findRsvpByPhone(phone);
    if (!row) return res.status(200).json({ found: false });

    const owns = namesMatch(
      { firstName: row.first_name, lastName: row.last_name },
      { firstName, lastName }
    );
    if (!owns) return res.status(200).json({ found: false });

    // Only what the form needs to repopulate itself — no id, no timestamps,
    // and no echo of the name or phone that was used to find it.
    return res.status(200).json({
      found: true,
      rsvp: {
        attending: row.attending,
        guestCount: row.guest_count,
        message: row.message || '',
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
}
