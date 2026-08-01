import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Embed() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    attending: 'yes',
    guestCount: 1,
    message: '',
  });
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [errorMsg, setErrorMsg] = useState('');

  // side comes from the URL: /embed?side=bride or /embed?side=groom
  const rawSide = typeof router.query.side === 'string' ? router.query.side.toLowerCase() : '';
  const side = rawSide === 'bride' || rawSide === 'groom' ? rawSide : 'unspecified';

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, side }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  }

  if (status === 'done') {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h2 style={styles.heading}>Thank you! 🎉</h2>
          <p style={styles.sub}>Your RSVP has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={handleSubmit}>
        {side !== 'unspecified' && (
          <span style={styles.badge}>{side === 'bride' ? "Bride's Side" : "Groom's Side"}</span>
        )}
        <h2 style={styles.heading}>RSVP</h2>

        <label style={styles.label}>
          Name *
          <input
            style={styles.input}
            required
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </label>

        <label style={styles.label}>
          Email
          <input
            type="email"
            style={styles.input}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </label>

        <label style={styles.label}>
          Phone
          <input
            style={styles.input}
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
          />
        </label>

        <label style={styles.label}>
          Will you attend? *
          <select
            style={styles.input}
            value={form.attending}
            onChange={(e) => update('attending', e.target.value)}
          >
            <option value="yes">Yes, I'll be there</option>
            <option value="no">Sorry, can't make it</option>
            <option value="maybe">Not sure yet</option>
          </select>
        </label>

        {form.attending === 'yes' && (
          <label style={styles.label}>
            Number of guests (including you)
            <input
              type="number"
              min="1"
              max="10"
              style={styles.input}
              value={form.guestCount}
              onChange={(e) => update('guestCount', e.target.value)}
            />
          </label>
        )}

        <label style={styles.label}>
          Message / dietary notes
          <textarea
            style={{ ...styles.input, minHeight: 70 }}
            value={form.message}
            onChange={(e) => update('message', e.target.value)}
          />
        </label>

        {status === 'error' && <p style={styles.error}>{errorMsg}</p>}

        <button style={styles.button} type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Submitting…' : 'Submit RSVP'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    justifyContent: 'center',
    padding: '16px',
    background: 'transparent',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  heading: { margin: 0, fontSize: 22 },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 999,
    background: '#f1e9ff',
    color: '#6b3fa0',
  },
  sub: { margin: 0, color: '#555' },
  label: { display: 'flex', flexDirection: 'column', fontSize: 14, fontWeight: 600, gap: 4 },
  input: {
    fontSize: 15,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #ccc',
    fontWeight: 400,
  },
  button: {
    marginTop: 8,
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#111',
    color: '#fff',
    fontSize: 15,
    cursor: 'pointer',
  },
  error: { color: '#c0392b', fontSize: 13, margin: 0 },
};
