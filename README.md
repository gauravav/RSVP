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

## 5. Embed the form in your invitation page

Use two different URLs — one per side — by adding a `?side=` query param.
Everything else about the form is identical; only the stored `side` value
(and a small badge on the form) changes.

**Bride's side:**
```html
<iframe
  src="https://rsvp-app-yourname.vercel.app/embed?side=bride"
  style="width: 100%; max-width: 480px; height: 620px; border: none;"
  title="RSVP - Bride's Side"
></iframe>
```

**Groom's side:**
```html
<iframe
  src="https://rsvp-app-yourname.vercel.app/embed?side=groom"
  style="width: 100%; max-width: 480px; height: 620px; border: none;"
  title="RSVP - Groom's Side"
></iframe>
```

Adjust `height` once you see how tall the form renders (guests field toggling
on/off shifts it slightly). If your invitation page is on a platform that
strips `<iframe>` tags (some website builders do), let me know which one and
I'll figure out a workaround (usually a raw HTML/embed block does the trick).

## 6. View responses

Go to `https://rsvp-app-yourname.vercel.app/admin`, enter your `ADMIN_PASSWORD`,
and you'll see every RSVP with a live guest-count total and a CSV export
button. Use the "Bride's Side" / "Groom's Side" filter pills at the top to
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
