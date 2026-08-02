# RSVP App

A tiny RSVP form + admin dashboard, meant to be deployed to Vercel with zero
domain purchase required — you'll get a free `your-project.vercel.app` URL.

## What's inside

- `pages/embed.js` — the RSVP form. This is the page you `<iframe>` into your
  invitation page.
- `pages/admin.js` — password-protected page listing every RSVP, with a CSV
  export button.
- `pages/api/rsvp.js` — POST to save an RSVP, GET (admin-only) to list them.
- `pages/api/admin-login.js` — checks your admin password and sets a cookie.
- `lib/db.js` — Postgres queries (auto-creates the `rsvps` table on first use).

## 1. Push this to GitHub

```bash
cd rsvp-app
git init
git add .
git commit -m "Initial RSVP app"
gh repo create rsvp-app --private --source=. --push
# (or create a repo on github.com and `git remote add origin ...` + push)
```

## 2. Deploy to Vercel

1. Go to https://vercel.com, sign in with GitHub (free tier is plenty).
2. Click **Add New → Project**, select the `rsvp-app` repo, click **Deploy**.
   Vercel auto-detects Next.js — no config needed.
3. You'll get a URL like `https://rsvp-app-yourname.vercel.app`.

## 3. Add a free Postgres database

1. In your Vercel project, go to the **Storage** tab.
2. Click **Create Database → Postgres** (this is Neon-backed, free tier).
3. Vercel automatically adds the `POSTGRES_URL` etc. env vars to your project
   — no manual copying needed. Redeploy once it's connected (Vercel usually
   prompts you to).

## 4. Set your admin password

1. In the Vercel project, go to **Settings → Environment Variables**.
2. Add `ADMIN_PASSWORD` = something only you know.
3. Redeploy (Settings changes require a redeploy to take effect).

## 4b. Turn on bot protection (Cloudflare Turnstile)

Free, and works on any domain — the site does not need to be on Cloudflare.

1. Go to https://dash.cloudflare.com → **Turnstile** → **Add widget**.
2. Add your Vercel hostname (e.g. `rsvp-self.vercel.app`) under Domains.
   Widget mode **Managed** is the right default.
3. Copy the **Site Key** and **Secret Key**.
4. In Vercel → Settings → Environment Variables, add:
   - `TURNSTILE_SITE_KEY` = the site key
   - `TURNSTILE_SECRET_KEY` = the secret key
5. Redeploy.

Both keys are read at request time, so rotating them later needs a redeploy
but not a code change.

**With no keys set the bot check is skipped and the form still works.** That is
deliberate — an RSVP form that rejects every guest because an env var is missing
is worse than a few spam rows you can delete. The trade-off is that a typo in the
variable name silently disables the check, so confirm a widget actually appears
on `/embed` once you have set them. To fail closed instead, change the
`return true` in `turnstileEnabled()`'s branch in `lib/turnstile.js` to `false`.

A hidden honeypot field runs regardless of configuration and needs no setup.

## 5. Embed the form in your invitation page

Two things vary by URL:

- `?side=bride` / `?side=groom` — which side the response is filed under.
- `?events=all` — ask about Haldi, Mehendi **and** Marriage. Leave it off and
  the form asks about the Marriage only.

That gives you four embeds. Bride's side needs two of them, one per page:

**Bride's side — marriage only:**
```html
<iframe
  src="https://rsvp-self.vercel.app/embed?side=bride"
  style="width: 100%; max-width: 460px; height: 600px; border: none;"
  title="RSVP"
></iframe>
```

**Bride's side — all three ceremonies:**
```html
<iframe
  src="https://rsvp-self.vercel.app/embed?side=bride&events=all"
  style="width: 100%; max-width: 460px; height: 600px; border: none;"
  title="RSVP"
></iframe>
```

**Groom's side:** same two URLs with `side=groom`.

**Both embeds are the same fixed size**, whichever ceremonies they ask about.
The form is paged — who you are, then one page per ceremony, then message and
submit — so the box never grows and the iframe height never needs revisiting.
Change `FRAME_WIDTH` / `FRAME_HEIGHT` at the top of `pages/embed.js` if you want
a different size, and update the iframe to match.

A guest is identified by first name + last name + phone. Entering a combination
that already responded loads their previous answers so they can edit and
resubmit; that updates the same record rather than adding a second one.

Answers are kept per ceremony, and a page only writes the ceremonies it asks
about. Someone who RSVPs to all three and later resubmits from the marriage-only
page keeps their haldi and mehendi answers intact.

## Event details and calendar invites

Dates, times, venues and addresses live in `EVENTS` in `lib/events.js` — one
place, used by the form, the calendar invite and the map links.

Each ceremony's step shows its date, time and venue, with the address linking
out to Google Maps. On the last step, before submitting, guests can download an
`.ics` invite covering the ceremonies they said yes to. It's offered again on
the thank-you screen.

Times are stored with an explicit `-04:00` offset. **North Carolina is on EDT in
late August, not EST** — writing them as EST would put every invite an hour
early. The `.ics` emits UTC, so it displays correctly in each guest's own
timezone.

Each event has a stable `UID`, so a guest who downloads the invite twice gets
the entry updated rather than duplicated. Change a date or time in
`lib/events.js` and anyone who re-downloads picks up the change — but calendars
already added won't update on their own, so announce changes separately.

Events default to a 4-hour duration (`durationMinutes`), since the times you
gave are "onwards" rather than a fixed window.

## 6. View responses

Go to `https://rsvp-self.vercel.app/admin`, enter your `ADMIN_PASSWORD`, and
you'll see every RSVP with a per-ceremony guest count and a CSV export button. Use the "Bride's Side" / "Groom's Side" filter pills at the top to
narrow the table and stats to just one side — the export also respects
whichever filter is currently selected.

## Local development (optional)

```bash
npm install
# create .env.local with POSTGRES_URL (from Vercel Storage tab → .env.local tab)
# and ADMIN_PASSWORD
npm run dev
```

## Customizing the form fields

Edit `pages/embed.js` (the form UI) and `lib/db.js` (the `rsvps` table +
insert query) together if you want to add/remove fields — e.g. dietary
restriction checkboxes, meal choice, plus-one names, etc.
