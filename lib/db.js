import { sql } from '@vercel/postgres';

// Creates the rsvps table if it doesn't exist yet. Safe to call repeatedly.
export async function ensureTable() {
  await sql`
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
  await sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'unspecified';`;
}

export async function insertRsvp({ name, email, phone, attending, guestCount, message, side }) {
  await ensureTable();
  const result = await sql`
    INSERT INTO rsvps (name, email, phone, attending, guest_count, message, side)
    VALUES (${name}, ${email}, ${phone}, ${attending}, ${guestCount}, ${message}, ${side})
    RETURNING id, created_at;
  `;
  return result.rows[0];
}

export async function listRsvps() {
  await ensureTable();
  const result = await sql`
    SELECT id, name, email, phone, attending, guest_count, message, side, created_at
    FROM rsvps
    ORDER BY created_at DESC;
  `;
  return result.rows;
}
