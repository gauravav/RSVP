import crypto from 'crypto';

// We never store the raw password in the cookie. Instead we store a keyed
// hash of it (HMAC using the same password as the key), so the cookie value
// only validates against the current ADMIN_PASSWORD env var.
export function tokenFor(password) {
  return crypto.createHmac('sha256', password).update('rsvp-admin').digest('hex');
}

export function isValidAdminCookie(cookieValue) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !cookieValue) return false;
  const expected = tokenFor(password);
  // constant-time compare
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}
