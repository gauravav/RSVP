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
  // In case the table already existed from before the "side" column existed.
  await pool().sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'unspecified';`;
}

export async function insertRsvp({ name, email, phone, attending, guestCount, message, side }) {
  await ensureTable();
  const result = await pool().sql`
    INSERT INTO rsvps (name, email, phone, attending, guest_count, message, side)
    VALUES (${name}, ${email}, ${phone}, ${attending}, ${guestCount}, ${message}, ${side})
    RETURNING id, created_at;
  `;
  return result.rows[0];
}

export async function listRsvps() {
  await ensureTable();
  const result = await pool().sql`
    SELECT id, name, email, phone, attending, guest_count, message, side, created_at
    FROM rsvps
    ORDER BY created_at DESC;
  `;
  return result.rows;
}
