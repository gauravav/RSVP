const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Read at request time rather than build time so the keys can be added or
// rotated in Vercel without a rebuild. The site key is public by design —
// it ships to the browser — but the secret must never leave the server.
export function turnstileSiteKey() {
  return process.env.TURNSTILE_SITE_KEY || '';
}

export function turnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

// Returns true when the submission should be allowed through.
//
// With no keys configured this deliberately allows everything: an RSVP form
// that silently rejects every guest because an env var is missing is a worse
// failure than some spam rows you can delete. Flip `return true` to `false`
// below if you'd rather it fail closed.
export async function verifyTurnstile(token, remoteIp) {
  if (!turnstileEnabled()) {
    console.warn('Turnstile keys not configured — skipping bot check.');
    return true;
  }
  if (!token) return false;

  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
    });
    if (remoteIp) body.append('remoteip', remoteIp);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json();
    if (!data.success) {
      console.warn('Turnstile rejected a submission:', data['error-codes']);
    }
    return Boolean(data.success);
  } catch (err) {
    // Cloudflare being unreachable shouldn't take the RSVP form down with it.
    console.error('Turnstile verification failed to run:', err.message);
    return true;
  }
}

// Vercel puts the real client IP here; req.socket sees the proxy.
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}
