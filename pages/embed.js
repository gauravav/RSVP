import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY, normalizePhone } from '../lib/countries';
import { isBlankName } from '../lib/names';
import { ATTENDING_OPTIONS, eventByKey, mapsUrl, parseEventKeys } from '../lib/events';
import { turnstileSiteKey } from '../lib/turnstile';
import { downloadIcs } from '../lib/ics';

const BLANK_ANSWER = { attending: 'yes', guestCount: 1 };

// The whole embed is a fixed box so the host page can set an iframe height once
// and never see it jump. Content is paged rather than stacked to fit inside it.
const FRAME_WIDTH = 420;
const FRAME_HEIGHT = 560;

// Resolved on the server rather than from router.query, which is empty during
// the pages-router server render. Reading it client-side would paint the wrong
// step count first and correct it after hydration.
export function getServerSideProps({ query }) {
  return {
    props: {
      side: query.side === 'bride' || query.side === 'groom' ? query.side : 'unspecified',
      eventKeys: parseEventKeys(query.events),
      // Public by design; the matching secret stays server-side.
      turnstileSiteKey: turnstileSiteKey(),
    },
  };
}

export default function Embed({ side, eventKeys, turnstileSiteKey: siteKey }) {
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
  const [turnstileToken, setTurnstileToken] = useState('');
  const [website, setWebsite] = useState(''); // honeypot; real guests never see it
  const [stepIndex, setStepIndex] = useState(0);
  const turnstileRef = useRef(null);
  const turnstileWidget = useRef(null);

  // who you are -> one page per ceremony -> message, bot check and submit
  const steps = ['identity', ...eventKeys, 'final'];
  const currentStep = steps[stepIndex];
  const isFinalStep = currentStep === 'final';
  const totalSteps = steps.length;

  const phone = normalizePhone(countryIso, number);
  const identityComplete =
    Boolean(phone) && !isBlankName(firstName) && !isBlankName(lastName);

  function answerFor(key) {
    return answers[key] || BLANK_ANSWER;
  }

  function setAnswer(key, patch) {
    setAnswers((prev) => ({ ...prev, [key]: { ...answerFor(key), ...patch } }));
  }

  // Once name and number are filled in, check whether this guest already has an
  // RSVP and prefill their previous answers. Debounced so we aren't firing a
  // request on every keystroke.
  const lookupSeq = useRef(0);
  useEffect(() => {
    if (!identityComplete) {
      setExisting(false);
      return undefined;
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
  }, [identityComplete, countryIso, number, firstName, lastName]);

  // The widget is mounted only on the final step, so it's rendered by hand in
  // explicit mode rather than auto-rendered on page load. Rendering it by hand
  // also means it can be reset after a failed submit — a token is single-use,
  // and reusing one turns a retry into a rejection.
  const showTurnstile = siteKey && isFinalStep && status !== 'done';
  useEffect(() => {
    if (!showTurnstile) return undefined;

    let cancelled = false;
    function renderWidget() {
      if (cancelled || !window.turnstile || !turnstileRef.current) return;
      if (turnstileWidget.current !== null) return;
      turnstileWidget.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: setTurnstileToken,
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector('script[data-turnstile]');
      if (existingScript) {
        existingScript.addEventListener('load', renderWidget);
      } else {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = 'true';
        script.addEventListener('load', renderWidget);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      // Stepping back unmounts the widget's node. Without clearing the id here,
      // returning to this step would see a stale id, skip rendering, and leave
      // the guest with no token and a permanently disabled submit button.
      if (window.turnstile && turnstileWidget.current !== null) {
        // Throws if the widget is already gone, and an exception escaping a
        // cleanup function takes the unmount down with it.
        try {
          window.turnstile.remove(turnstileWidget.current);
        } catch {
          // Already removed; nothing to do.
        }
      }
      turnstileWidget.current = null;
      setTurnstileToken('');
    };
  }, [showTurnstile, siteKey]);

  function resetTurnstile() {
    setTurnstileToken('');
    if (window.turnstile && turnstileWidget.current !== null) {
      try {
        window.turnstile.reset(turnstileWidget.current);
      } catch {
        // Widget went away mid-flight; the guest can reload if it matters.
      }
    }
  }

  // Only the ceremonies this page asked about and the guest said yes to — no
  // point handing someone an invite to something they've declined.
  const attendingKeys = eventKeys.filter((k) => answerFor(k).attending === 'yes');

  const canAdvance = currentStep === 'identity' ? identityComplete : true;
  const canSubmit = status !== 'submitting' && (!siteKey || Boolean(turnstileToken));

  function goNext() {
    if (!canAdvance) return;
    setErrorMsg('');
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  }

  function goBack() {
    setErrorMsg('');
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Enter inside a text field submits the form. On any step but the last that
    // should move the guest forward, not send a half-filled RSVP.
    if (!isFinalStep) {
      goNext();
      return;
    }

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
          turnstileToken,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      setWasUpdate(Boolean(data.updated));
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
      // Tokens are single-use, so a retry with the same one would be rejected
      // even after the guest fixes whatever the error was.
      resetTurnstile();
    }
  }

  if (status === 'done') {
    return (
      <div className="rsvp-wrap" style={styles.wrap}>
        <GlobalStyle />
        <div style={styles.frame}>
          <div style={styles.doneBody}>
            <h2 style={styles.heading}>Thank you</h2>
            <p style={styles.sub}>
              {wasUpdate ? 'Your RSVP has been updated.' : 'Your RSVP has been recorded.'}
            </p>
            {attendingKeys.length > 0 && (
              <button
                type="button"
                style={styles.button}
                onClick={() => downloadIcs(attendingKeys)}
              >
                Add to calendar
              </button>
            )}
            <p style={styles.hint}>
              Need to change something? Come back to this form and enter the same
              name and phone number — your answers will load and you can resubmit.
            </p>
            <button
              style={styles.secondaryButton}
              onClick={() => {
                setStatus('idle');
                setStepIndex(0);
              }}
            >
              Edit my RSVP
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rsvp-wrap" style={styles.wrap}>
      <GlobalStyle />
      <form style={styles.frame} onSubmit={handleSubmit}>
        <div style={styles.header}>
          <h2 style={styles.heading}>RSVP</h2>
          <div style={styles.dots}>
            {steps.map((s, i) => (
              <span key={s} style={i === stepIndex ? styles.dotActive : styles.dot} />
            ))}
          </div>
        </div>

        {/* Fixed-height scroll region: the frame stays the same size whatever
            step is showing, so the host iframe never has to resize. */}
        <div style={styles.body}>
          {currentStep === 'identity' && (
            <>
              <div className="rsvp-name-row" style={styles.nameRow}>
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

              <label style={{ ...styles.label, marginTop: 12 }}>
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
                  Welcome back, {firstName.trim()} — we found your earlier RSVP.
                  Your answers are filled in; change anything you like.
                </p>
              )}
            </>
          )}

          {currentStep !== 'identity' && !isFinalStep && (
            <>
              <div style={styles.stepTitle}>{eventByKey(currentStep).label}</div>

              <div style={styles.eventDetails}>
                <div style={styles.eventWhen}>
                  {eventByKey(currentStep).dateLabel}
                </div>
                <div style={styles.eventWhen}>
                  {eventByKey(currentStep).timeLabel} <span style={styles.tz}>(EDT)</span>
                </div>
                <div style={styles.eventVenue}>{eventByKey(currentStep).venue}</div>
                <a
                  href={mapsUrl(eventByKey(currentStep))}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.eventAddress}
                >
                  {eventByKey(currentStep).address}
                </a>
              </div>

              <label style={styles.label}>
                Will you attend?
                <select
                  style={styles.input}
                  value={answerFor(currentStep).attending}
                  onChange={(e) => setAnswer(currentStep, { attending: e.target.value })}
                >
                  {ATTENDING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {answerFor(currentStep).attending === 'yes' && (
                <label style={{ ...styles.label, marginTop: 12 }}>
                  Number of guests (including you)
                  <select
                    style={styles.input}
                    value={answerFor(currentStep).guestCount}
                    onChange={(e) =>
                      setAnswer(currentStep, { guestCount: Number(e.target.value) })
                    }
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          {isFinalStep && (
            <>
              <label style={styles.label}>
                Message / dietary notes
                <textarea
                  style={{ ...styles.input, minHeight: 90 }}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>

              {/* Honeypot. Hidden from guests and from screen readers, skipped
                  by tabbing, and never autofilled — anything in it is a bot. */}
              <div style={styles.honeypot} aria-hidden="true">
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              {/* Offered before submitting, so a guest gets the invite whether
                  or not they make it through the rest of the form. */}
              <div style={styles.calendarBox}>
                <div style={styles.calendarTitle}>Add to your calendar</div>
                {attendingKeys.length > 0 ? (
                  <>
                    <p style={styles.calendarHint}>
                      {attendingKeys.map((k) => eventByKey(k).label).join(', ')}
                    </p>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => downloadIcs(attendingKeys)}
                    >
                      Download invite
                    </button>
                  </>
                ) : (
                  <p style={styles.calendarHint}>
                    Say yes to a ceremony and its invite will appear here.
                  </p>
                )}
              </div>

              {siteKey && <div ref={turnstileRef} style={styles.turnstile} />}
            </>
          )}
        </div>

        <div style={styles.footer}>
          {errorMsg && <p style={styles.error}>{errorMsg}</p>}

          <div style={styles.navRow}>
            {stepIndex > 0 ? (
              <button type="button" style={styles.secondaryButton} onClick={goBack}>
                Back
              </button>
            ) : (
              <span />
            )}

            {isFinalStep ? (
              <button style={styles.button} type="submit" disabled={!canSubmit}>
                {status === 'submitting'
                  ? 'Submitting…'
                  : existing
                  ? 'Update RSVP'
                  : 'Submit RSVP'}
              </button>
            ) : (
              <button
                type="button"
                style={styles.button}
                onClick={goNext}
                disabled={!canAdvance}
              >
                Next
              </button>
            )}
          </div>
        </div>
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
        opacity: 0.45;
        cursor: default;
      }
      /* Centre Cloudflare's widget, which renders as a fixed-width iframe. */
      .cf-turnstile iframe {
        margin: 0 auto;
        display: block;
      }

      /* Cloudflare's widget is a fixed 300px wide and can't be shrunk. On a
         320px phone the frame's own padding leaves less than that, so trim the
         padding rather than let the widget push a horizontal scrollbar. */
      @media (max-width: 380px) {
        .rsvp-wrap {
          padding: 8px !important;
        }
        /* Two 140px-ish name fields side by side get uncomfortably narrow. */
        .rsvp-name-row {
          flex-direction: column;
        }
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

const SERIF =
  "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', serif";

const styles = {
  wrap: {
    fontFamily: SERIF,
    color: COLORS.ink,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 16,
    boxSizing: 'border-box',
    background: `
      radial-gradient(ellipse at 50% 0%, rgba(226, 178, 84, 0.55), transparent 60%),
      radial-gradient(ellipse at 20% 90%, rgba(150, 102, 30, 0.35), transparent 55%),
      linear-gradient(165deg, #d3a03c 0%, #c28f30 45%, #a97a27 100%)
    `,
    minHeight: '100vh',
  },
  // Fixed in both directions. Steps swap inside it, so the box never resizes
  // and the host page's iframe height stays correct all the way through.
  frame: {
    width: '100%',
    maxWidth: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 10,
    borderBottom: `1px solid ${COLORS.goldSoft}`,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px 2px 8px',
  },
  doneBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 12,
  },
  footer: {
    paddingTop: 12,
    borderTop: `1px solid ${COLORS.goldSoft}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  navRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dots: { display: 'flex', gap: 6, flexShrink: 0 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'rgba(36, 26, 11, 0.25)',
  },
  dotActive: { width: 7, height: 7, borderRadius: '50%', background: COLORS.ink },
  heading: {
    margin: 0,
    fontSize: 26,
    fontWeight: 400,
    letterSpacing: '0.06em',
    color: COLORS.ink,
  },
  stepTitle: {
    margin: '0 0 14px',
    paddingBottom: 8,
    borderBottom: `1px solid ${COLORS.goldSoft}`,
    fontSize: 17,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    color: COLORS.ink,
  },
  sub: { margin: 0, color: COLORS.inkSoft, fontSize: 16 },
  hint: { margin: '10px 0 0', fontSize: 12, color: COLORS.inkSoft, fontStyle: 'italic' },
  foundNote: {
    margin: '12px 0 0',
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
  countrySelect: {
    fontFamily: SERIF,
    // 16px minimum on anything focusable: iOS Safari zooms the page in when a
    // guest taps a control with smaller text, and inside an iframe that zoom
    // is jarring and doesn't fully undo.
    fontSize: 16,
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
    fontSize: 16, // see countrySelect: below 16px iOS zooms on focus

    padding: '9px 11px',
    borderRadius: 6,
    border: `1px solid ${COLORS.goldSoft}`,
    background: COLORS.parchment,
    color: COLORS.ink,
    fontWeight: 400,
    boxSizing: 'border-box',
    width: '100%',
  },
  button: {
    fontFamily: SERIF,
    padding: '10px 22px',
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
    padding: '9px 18px',
    borderRadius: 6,
    border: `1px solid ${COLORS.ink}`,
    background: 'transparent',
    color: COLORS.ink,
    fontSize: 14,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  error: { color: '#7d1f12', fontSize: 13, margin: 0, fontWeight: 600 },
  // Off-screen rather than display:none — some bots skip hidden inputs, but
  // most fill anything still in the layout.
  honeypot: {
    position: 'absolute',
    left: '-9999px',
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
  turnstile: {
    marginTop: 14,
    minHeight: 65,
    display: 'flex',
    justifyContent: 'center',
  },
  eventDetails: {
    margin: '0 0 16px',
    padding: '10px 12px',
    borderRadius: 6,
    background: 'rgba(255, 248, 232, 0.45)',
    borderLeft: `3px solid ${COLORS.gold}`,
    fontSize: 14,
    lineHeight: 1.45,
  },
  eventWhen: { color: COLORS.ink },
  tz: { fontSize: 12, color: COLORS.inkSoft },
  eventVenue: { marginTop: 6, fontWeight: 600, color: COLORS.ink },
  eventAddress: { color: COLORS.gold, textDecoration: 'underline', fontSize: 13 },
  calendarBox: {
    marginTop: 16,
    padding: '12px',
    borderRadius: 6,
    border: `1px dashed ${COLORS.goldSoft}`,
    background: 'rgba(255, 248, 232, 0.30)',
  },
  calendarTitle: {
    fontSize: 13,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 6,
    color: COLORS.ink,
  },
  calendarHint: { margin: '0 0 10px', fontSize: 13, color: COLORS.inkSoft },
};
