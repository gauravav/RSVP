import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY, normalizePhone } from '../lib/countries';
import { isBlankName } from '../lib/names';
import { EVENTS, ATTENDING_OPTIONS, eventByKey, parseEventKeys } from '../lib/events';

const BLANK_ANSWER = { attending: 'yes', guestCount: 1 };

// Resolved on the server rather than from router.query, which is empty during
// the pages-router server render. Reading it client-side would paint the
// marriage-only form first and then grow to three ceremonies after hydration —
// a visible jump inside an iframe whose height the host page has already fixed.
export function getServerSideProps({ query }) {
  return {
    props: {
      side: query.side === 'bride' || query.side === 'groom' ? query.side : 'unspecified',
      eventKeys: parseEventKeys(query.events),
    },
  };
}

export default function Embed({ side, eventKeys }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY);
  const [number, setNumber] = useState('');
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [existing, setExisting] = useState(false); // did we find a prior RSVP?
  const [lookingUp, setLookingUp] = useState(false);
  const [wasUpdate, setWasUpdate] = useState(false);

  function answerFor(key) {
    return answers[key] || BLANK_ANSWER;
  }

  function setAnswer(key, patch) {
    setAnswers((prev) => ({ ...prev, [key]: { ...answerFor(key), ...patch } }));
  }

  const phone = normalizePhone(countryIso, number);
  const canLookUp = Boolean(phone) && !isBlankName(firstName) && !isBlankName(lastName);

  // Once name and number are both filled in, check whether this guest already
  // has an RSVP and prefill their previous answers. Debounced so we aren't
  // firing a request on every keystroke.
  const lookupSeq = useRef(0);
  useEffect(() => {
    if (!canLookUp) {
      setExisting(false);
      return;
    }
    const seq = ++lookupSeq.current;
    setLookingUp(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          countryCode: countryIso,
          number,
          firstName,
          lastName,
        });
        const res = await fetch(`/api/lookup?${params}`);
        const data = await res.json();
        // A slower earlier request must not overwrite a newer one's result.
        if (seq !== lookupSeq.current) return;
        if (data.found) {
          // Keep every event we get back, including ones this page doesn't
          // show, so resubmitting here doesn't wipe the guest's other answers.
          const restored = {};
          for (const [key, value] of Object.entries(data.rsvp.responses || {})) {
            if (!value || !value.attending) continue;
            restored[key] = {
              attending: value.attending,
              guestCount: value.guestCount || 1,
            };
          }
          setAnswers(restored);
          setMessage(data.rsvp.message || '');
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
  }, [canLookUp, countryIso, number, firstName, lastName]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone) {
      setStatus('error');
      setErrorMsg('Please enter a valid phone number.');
      return;
    }
    setStatus('submitting');
    setErrorMsg('');

    // Send this page's events, plus any others already on file so they survive
    // the update untouched.
    const responses = {};
    for (const [key, value] of Object.entries(answers)) {
      if (value && value.attending) responses[key] = value;
    }
    for (const key of eventKeys) {
      responses[key] = answerFor(key);
    }

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          countryCode: countryIso,
          number,
          responses,
          message,
          side,
        }),
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
        <GlobalStyle />
        <div style={styles.card}>
          <h2 style={styles.heading}>Thank you!</h2>
          <p style={styles.sub}>
            {wasUpdate
              ? 'Your RSVP has been updated.'
              : 'Your RSVP has been recorded.'}
          </p>
          <p style={styles.hint}>
            Need to change something? Come back to this form and enter the same
            name and phone number — your answers will load and you can resubmit.
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
      <GlobalStyle />
      <form style={styles.card} onSubmit={handleSubmit}>
        {side !== 'unspecified' && (
          <span style={styles.badge}>{side === 'bride' ? "Bride's Side" : "Groom's Side"}</span>
        )}
        <h2 style={styles.heading}>RSVP</h2>

        <div style={styles.nameRow}>
          <label style={{ ...styles.label, flex: 1, minWidth: 0 }}>
            First name *
            <input
              style={styles.input}
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </label>
          <label style={{ ...styles.label, flex: 1, minWidth: 0 }}>
            Last name *
            <input
              style={styles.input}
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
        </div>

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
            Welcome back, {firstName.trim()} — we found your earlier RSVP and
            filled it in below. Make any changes and submit again to update it.
          </p>
        )}

        {eventKeys.map((key) => {
          const event = eventByKey(key);
          const answer = answerFor(key);
          const multi = eventKeys.length > 1;
          return (
            <fieldset key={key} style={multi ? styles.eventBlock : styles.eventBlockPlain}>
              {multi && <legend style={styles.eventLegend}>{event.label}</legend>}

              <label style={styles.label}>
                {multi ? 'Will you attend?' : 'Will you attend? *'}
                <select
                  style={styles.input}
                  value={answer.attending}
                  onChange={(e) => setAnswer(key, { attending: e.target.value })}
                >
                  {ATTENDING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {answer.attending === 'yes' && (
                <label style={{ ...styles.label, marginTop: 10 }}>
                  Number of guests (including you)
                  <select
                    style={styles.input}
                    value={answer.guestCount}
                    onChange={(e) => setAnswer(key, { guestCount: Number(e.target.value) })}
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
          );
        })}

        <label style={styles.label}>
          Message / dietary notes
          <textarea
            style={{ ...styles.input, minHeight: 70 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
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

// The iframe's own document needs zeroed margins and full height, or the
// browser's default 8px body margin shows as a pale border around the warm
// background and gives the embed away as an iframe.
function GlobalStyle() {
  return (
    <style jsx global>{`
      html,
      body,
      #__next {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: #c28f30;
      }
      /* The dropdown arrow and caret default to blue-grey; warm them up. */
      select,
      input,
      textarea {
        accent-color: #8a6420;
      }
      input::placeholder,
      textarea::placeholder {
        color: rgba(74, 54, 23, 0.55);
      }
      input:focus,
      select:focus,
      textarea:focus {
        outline: 2px solid rgba(36, 26, 11, 0.55);
        outline-offset: 1px;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
    `}</style>
  );
}

// Palette lifted from the invitation: aged ochre/amber ground, near-black
// ink, and warm gold accents, with a parchment tone for the input fields so
// they sit on the background instead of punching white holes in it.
const COLORS = {
  ink: '#241a0b',
  inkSoft: '#4a3617',
  parchment: 'rgba(255, 248, 232, 0.88)',
  gold: '#8a6420',
  goldSoft: 'rgba(138, 100, 32, 0.45)',
  cream: '#f7ecd5',
};

const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', serif";

const styles = {
  wrap: {
    fontFamily: SERIF,
    color: COLORS.ink,
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 16px',
    // Layered warm tones approximate the invitation's aged-wood wash without
    // needing an image asset.
    background: `
      radial-gradient(ellipse at 50% 0%, rgba(226, 178, 84, 0.55), transparent 60%),
      radial-gradient(ellipse at 20% 90%, rgba(150, 102, 30, 0.35), transparent 55%),
      linear-gradient(165deg, #d3a03c 0%, #c28f30 45%, #a97a27 100%)
    `,
    minHeight: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  heading: {
    margin: 0,
    fontSize: 30,
    fontWeight: 400,
    letterSpacing: '0.06em',
    color: COLORS.ink,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: 400,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '3px 12px',
    borderRadius: 999,
    background: 'rgba(36, 26, 11, 0.10)',
    border: `1px solid ${COLORS.goldSoft}`,
    color: COLORS.ink,
  },
  sub: { margin: 0, color: COLORS.inkSoft, fontSize: 16 },
  hint: { margin: 0, fontSize: 12, color: COLORS.inkSoft, fontStyle: 'italic' },
  foundNote: {
    margin: 0,
    fontSize: 13,
    padding: '9px 12px',
    borderRadius: 6,
    background: COLORS.parchment,
    borderLeft: `3px solid ${COLORS.gold}`,
    color: COLORS.ink,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: '0.04em',
    gap: 4,
    color: COLORS.ink,
  },
  nameRow: { display: 'flex', gap: 8 },
  phoneRow: { display: 'flex', gap: 8 },
  // Only drawn when more than one ceremony is on the page — a single event
  // doesn't need a box around it.
  eventBlock: {
    margin: 0,
    padding: '12px 14px 14px',
    border: `1px solid ${COLORS.goldSoft}`,
    borderRadius: 6,
    background: 'rgba(255, 248, 232, 0.30)',
  },
  eventBlockPlain: { margin: 0, padding: 0, border: 'none' },
  eventLegend: {
    padding: '0 6px',
    fontSize: 15,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    color: COLORS.ink,
  },
  countrySelect: {
    fontFamily: SERIF,
    fontSize: 15,
    padding: '9px 6px',
    borderRadius: 6,
    border: `1px solid ${COLORS.goldSoft}`,
    background: COLORS.parchment,
    color: COLORS.ink,
    flex: '0 0 auto',
    maxWidth: 130,
  },
  input: {
    fontFamily: SERIF,
    fontSize: 15,
    padding: '9px 11px',
    borderRadius: 6,
    border: `1px solid ${COLORS.goldSoft}`,
    background: COLORS.parchment,
    color: COLORS.ink,
    fontWeight: 400,
  },
  button: {
    fontFamily: SERIF,
    marginTop: 10,
    padding: '11px 16px',
    borderRadius: 6,
    border: 'none',
    background: COLORS.ink,
    color: COLORS.cream,
    fontSize: 15,
    letterSpacing: '0.08em',
    cursor: 'pointer',
  },
  secondaryButton: {
    fontFamily: SERIF,
    marginTop: 4,
    alignSelf: 'flex-start',
    padding: '9px 15px',
    borderRadius: 6,
    border: `1px solid ${COLORS.ink}`,
    background: 'transparent',
    color: COLORS.ink,
    fontSize: 14,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  error: { color: '#7d1f12', fontSize: 13, margin: 0, fontWeight: 600 },
};
