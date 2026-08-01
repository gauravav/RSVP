import { tokenFor } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'Server is not configured with ADMIN_PASSWORD.' });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const token = tokenFor(adminPassword);
  res.setHeader(
    'Set-Cookie',
    `rsvp_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 12}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );

  return res.status(200).json({ ok: true });
}
