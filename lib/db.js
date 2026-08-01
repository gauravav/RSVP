import { createPool } from '@vercel/postgres';

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
    SELECT id, name, phone, country_code, attending, guest_count, message, side, created_at, updated_at
    FROM rsvps
    WHERE phone = ${phone}
    LIMIT 1;
  `;
  return result.rows[0] || null;
}

// Creates the RSVP, or overwrites the existing one for this phone number so a
// guest can come back and revise their answer instead of adding a second row.
export async function upsertRsvp({ name, phone, countryCode, attending, guestCount, message, side }) {
  await ensureTable();

  const existing = await findRsvpByPhone(phone);

  if (existing) {
    const result = await pool().sql`
      UPDATE rsvps
      SET name = ${name},
          country_code = ${countryCode},
          attending = ${attending},
          guest_count = ${guestCount},
          message = ${message},
          side = ${side},
          updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING id, created_at;
    `;
    return { ...result.rows[0], updated: true };
  }

  const result = await pool().sql`
    INSERT INTO rsvps (name, phone, country_code, attending, guest_count, message, side)
    VALUES (${name}, ${phone}, ${countryCode}, ${attending}, ${guestCount}, ${message}, ${side})
    RETURNING id, created_at;
  `;
  return { ...result.rows[0], updated: false };
}

export async function listRsvps() {
  await ensureTable();
  const result = await pool().sql`
    SELECT id, name, phone, country_code, attending, guest_count, message, side, created_at, updated_at
    FROM rsvps
    ORDER BY created_at DESC;
  `;
  return result.rows;
}
