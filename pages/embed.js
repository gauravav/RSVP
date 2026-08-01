import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { COUNTRIES, DEFAULT_COUNTRY, normalizePhone } from '../lib/countries';

const EMPTY_FORM = {
  name: '',
  attending: 'yes',
  guestCount: 1,
  message: '',
};

export default function Embed() {
  const router = useRouter();
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY);
  const [number, setNumber] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [existing, setExisting] = useState(false); // did we find a prior RSVP?
  const [lookingUp, setLookingUp] = useState(false);
  const [wasUpdate, setWasUpdate] = useState(false);

  // side comes from the URL: /embed?side=bride or /embed?side=groom
  const rawSide = typeof router.query.side === 'string' ? router.query.side.toLowerCase() : '';
  const side = rawSide === 'bride' || rawSide === 'groom' ? rawSide : 'unspecified';

  const phone = normalizePhone(countryIso, number);

  // Look the guest up once they've typed a plausible number, and prefill the
  // rest of the form with whatever they submitted last time. Debounced so we
  // aren't firing a request on every keystroke.
  const lookupSeq = useRef(0);
  useEffect(() => {
    if (!phone) {
      setExisting(false);
      return;
    }
    const seq = ++lookupSeq.current;
    setLookingUp(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/lookup?countryCode=${encodeURIComponent(countryIso)}&number=${encodeURIComponent(number)}`
        );
        const data = await res.json();
        // A slower earlier request must not overwrite a newer one's result.
        if (seq !== lookupSeq.current) return;
        if (data.found) {
          setForm({
            name: data.rsvp.name || '',
            attending: data.rsvp.attending || 'yes',
            guestCount: data.rsvp.guestCount || 1,
            message: data.rsvp.message || '',
          });
          setExisting(true);
        } else {
          setExisting(false);
        }
      } catch {
        // A failed lookup just means no prefill; the form still works.
      } finally {
        if (seq === lookupSeq.current) setLookingUp(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [phone, countryIso, number]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone) {
      setStatus('error');
      setErrorMsg('Please enter a valid phone number.');
      return;
    }
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, countryCode: countryIso, number, side }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      setWasUpdate(Boolean(data.updated));
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
          <p style={styles.sub}>
            {wasUpdate
              ? 'Your RSVP has been updated.'
              : 'Your RSVP has been recorded.'}
          </p>
          <p style={styles.hint}>
            Need to change something? Come back to this form and enter the same
            phone number — your answers will load and you can resubmit.
          </p>
          <button style={styles.secondaryButton} onClick={() => setStatus('idle')}>
            Edit my RSVP
          </button>
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
          Phone *
          <div style={styles.phoneRow}>
            <select
              style={styles.countrySelect}
              value={countryIso}
              onChange={(e) => setCountryIso(e.target.value)}
              aria-label="Country code"
            >
              {COUNTRIES.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {c.flag} {c.dial}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="tel"
              placeholder="Phone number"
              style={{ ...styles.input, flex: 1, minWidth: 0 }}
              required
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
        </label>

        {lookingUp && <p style={styles.hint}>Checking for an existing RSVP…</p>}

        {existing && !lookingUp && (
          <p style={styles.foundNote}>
            We found your earlier RSVP and filled it in below. Make any changes
            and submit again to update it.
          </p>
        )}

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
            <select
              style={styles.input}
              value={form.guestCount}
              onChange={(e) => update('guestCount', e.target.value)}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
          {status === 'submitting'
            ? 'Submitting…'
            : existing
            ? 'Update RSVP'
            : 'Submit RSVP'}
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
  hint: { margin: 0, fontSize: 12, color: '#777' },
  foundNote: {
    margin: 0,
    fontSize: 13,
    padding: '8px 10px',
    borderRadius: 8,
    background: '#eef7ee',
    color: '#2c6e2f',
  },
  label: { display: 'flex', flexDirection: 'column', fontSize: 14, fontWeight: 600, gap: 4 },
  phoneRow: { display: 'flex', gap: 8 },
  countrySelect: {
    fontSize: 15,
    padding: '8px 6px',
    borderRadius: 8,
    border: '1px solid #ccc',
    fontWeight: 400,
    flex: '0 0 auto',
    maxWidth: 130,
  },
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
  secondaryButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #ccc',
    background: '#fff',
    fontSize: 14,
    cursor: 'pointer',
  },
  error: { color: '#c0392b', fontSize: 13, margin: 0 },
};
