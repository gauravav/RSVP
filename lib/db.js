import { createPool } from '@vercel/postgres';
import { namesMatch } from './names';

// Vercel's Postgres store sets POSTGRES_URL, but the Neon-backed marketplace
// integration sets DATABASE_URL instead. Accept either so the app works no
// matter which way the database was attached.
// Built on first use rather than at import time, so a misconfigured env var
// surfaces as a handled error inside the request instead of crashing the route.
let cachedPool;
function pool() {
  if (!cachedPool) {
    cachedPool = createPool({
      connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    });
  }
  return cachedPool;
}

// Creates the rsvps table if it doesn't exist yet. Safe to call repeatedly.
export async function ensureTable() {
  await pool().sql`
    CREATE TABLE IF NOT EXISTS rsvps (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      attending TEXT NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 1,
      message TEXT,
      side TEXT NOT NULL DEFAULT 'unspecified',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  // Columns added after the table first shipped.
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'unspecified';`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS country_code TEXT;`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS first_name TEXT;`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS last_name TEXT;`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS haldi_attending TEXT;`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS haldi_guest_count INTEGER;`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS mehendi_attending TEXT;`;
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS mehendi_guest_count INTEGER;`;

  // A guest filling in a form that doesn't ask about the marriage leaves that
  // answer genuinely unknown, which the original NOT NULL can't express.
  await pool().sql`ALTER TABLE rsvps ALTER COLUMN attending DROP NOT NULL;`;
  await pool().sql`ALTER TABLE rsvps ALTER COLUMN guest_count DROP NOT NULL;`;

  // Split the pre-existing single "name" into first/last for rows that predate
  // the split: everything before the first space is the first name, the rest is
  // the last name. Guarded on first_name IS NULL so this is a no-op after the
  // first run rather than rewriting rows on every request.
  await pool().sql`
    UPDATE rsvps
    SET first_name = split_part(trim(name), ' ', 1),
        last_name = CASE
          WHEN position(' ' in trim(name)) > 0
          THEN trim(substring(trim(name) from position(' ' in trim(name)) + 1))
          ELSE ''
        END
    WHERE first_name IS NULL;
  `;

  // Phone is the key guests are looked up by, so it should be unique. This is
  // best-effort: if rows predating the constraint already share a number the
  // index can't be built, and we'd rather serve the form than hard-fail. The
  // upsert below doesn't depend on the index existing.
  try {
    await pool().sql`
      CREATE UNIQUE INDEX IF NOT EXISTS rsvps_phone_key
      ON rsvps (phone) WHERE phone IS NOT NULL;
    `;
  } catch (err) {
    console.warn('Could not create unique phone index:', err.message);
  }
}

export async function findRsvpByPhone(phone) {
  await ensureTable();
  const result = await pool().sql`
    SELECT id, name, first_name, last_name, phone, country_code,
           attending, guest_count,
           haldi_attending, haldi_guest_count,
           mehendi_attending, mehendi_guest_count,
           message, side, created_at, updated_at
    FROM rsvps
    WHERE phone = ${phone}
    LIMIT 1;
  `;
  return result.rows[0] || null;
}

// Creates the RSVP, or updates the existing one for this phone number so a
// guest can come back and revise their answer instead of adding a second row.
//
// Updating requires the name to match the stored record. Without that, a guest
// who mistypes a digit would silently overwrite whoever owns the number they
// landed on, and the original response would be gone with no trace.
// `responses` holds only the events the form actually asked about, keyed by
// event key: { marriage: { attending, guestCount } }. Events absent from it
// keep whatever the guest answered previously — someone who RSVPs to all three
// ceremonies and later resubmits from the marriage-only page must not have
// their haldi and mehendi answers silently blanked.
export async function upsertRsvp({
  firstName,
  lastName,
  phone,
  countryCode,
  responses,
  message,
  side,
}) {
  await ensureTable();

  const fullName = `${firstName} ${lastName}`.trim();
  const existing = await findRsvpByPhone(phone);

  function answerFor(key, attendingCol, guestsCol) {
    const given = responses[key];
    if (given) return [given.attending, given.guestCount];
    // Not asked on this page: carry forward, or leave unknown on a new record.
    return existing ? [existing[attendingCol], existing[guestsCol]] : [null, null];
  }

  const [marriageAttending, marriageGuests] = answerFor('marriage', 'attending', 'guest_count');
  const [haldiAttending, haldiGuests] = answerFor('haldi', 'haldi_attending', 'haldi_guest_count');
  const [mehendiAttending, mehendiGuests] = answerFor('mehendi', 'mehendi_attending', 'mehendi_guest_count');

  if (existing) {
    const owns = namesMatch(
      { firstName: existing.first_name, lastName: existing.last_name },
      { firstName, lastName }
    );
    if (!owns) return { conflict: true };

    const result = await pool().sql`
      UPDATE rsvps
      SET name = ${fullName},
          first_name = ${firstName},
          last_name = ${lastName},
          country_code = ${countryCode},
          attending = ${marriageAttending},
          guest_count = ${marriageGuests},
          haldi_attending = ${haldiAttending},
          haldi_guest_count = ${haldiGuests},
          mehendi_attending = ${mehendiAttending},
          mehendi_guest_count = ${mehendiGuests},
          message = ${message},
          side = ${side},
          updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING id, created_at;
    `;
    return { ...result.rows[0], updated: true };
  }

  const result = await pool().sql`
    INSERT INTO rsvps (
      name, first_name, last_name, phone, country_code,
      attending, guest_count,
      haldi_attending, haldi_guest_count,
      mehendi_attending, mehendi_guest_count,
      message, side
    )
    VALUES (
      ${fullName}, ${firstName}, ${lastName}, ${phone}, ${countryCode},
      ${marriageAttending}, ${marriageGuests},
      ${haldiAttending}, ${haldiGuests},
      ${mehendiAttending}, ${mehendiGuests},
      ${message}, ${side}
    )
    RETURNING id, created_at;
  `;
  return { ...result.rows[0], updated: false };
}

export async function listRsvps() {
  await ensureTable();
  const result = await pool().sql`
    SELECT id, name, first_name, last_name, phone, country_code,
           attending, guest_count,
           haldi_attending, haldi_guest_count,
           mehendi_attending, mehendi_guest_count,
           message, side, created_at, updated_at
    FROM rsvps
    ORDER BY created_at DESC;
  `;
  return result.rows;
}
