# BanditTek Field Tool

A mobile-first field logging app for licensed private investigators. Captures billable activity entries via voice dictation or manual form entry, processes them with AI, and syncs to a BanditTek server.

---

## Quick Start (New User Setup)

Each investigator points the app at their firm's BanditTek server. Setup takes about 2 minutes.

### Configure your BanditTek host

1. Open the app: **https://tlee612-lab.github.io/field-log/**
2. Tap the **⚙ Settings** button
3. Under **Cloud Sync**, paste your BanditTek host URL (e.g. `https://your-bandittek-host.com` — no trailing slash) and tap **Save**
4. Tap **Test** — you should see ✓ Connected to bandit-tek
5. Under **AI Assist**, pick your AI provider and enter your API key:
   - **Anthropic (Claude)** — get key at [console.anthropic.com](https://console.anthropic.com)
   - **Google Gemini** — get key at [aistudio.google.com](https://aistudio.google.com)
   - **OpenAI (ChatGPT)** — get key at [platform.openai.com](https://platform.openai.com)
6. Tap **Save Changes**

### First entry test

1. Enter your name in the **Investigator** field at the top
2. Tap **Refresh Cases** in Settings — your firm's cases populate the dropdown
3. Tap **Manual** and fill in a test entry against a real case
4. Tap **LOG ACTIVITY →**
5. Check BanditTek's Activities view for the case — the entry should appear there

If sync fails, the entry stays in **Recent Entries (Local)** until you tap the per-row sync button or **↑ Sync All**.

---

## Features

### AI Mode
- Dictate or type raw field notes — the AI parses them into structured billing entries
- Supports Claude (Anthropic), Gemini (Google), and ChatGPT (OpenAI)
- Automatically splits travel legs into Travel Time + Mileage pairs
- Calculates durations from clock times or stated travel time
- Pre-parse validation warns about missing case numbers, city names, or travel duration before calling the API
- Voice-to-text via Web Speech API with auto-restart on silence and iOS tap-to-continue fallback

### Manual Mode
- Form-based entry for single activities, Out of Pocket expenses, and court appearances
- Activity Type dropdown with full billing code list
- Auto-generates paired Mileage entry when Travel Time is logged

### Sync
- Entries stored locally in localStorage — survive offline use
- Sync to BanditTek's `/api/field-log/activities` endpoint via per-record REST POSTs
- Per-entry or bulk sync, grouped by case server-side
- Server-side idempotency (deterministic activity IDs) — re-syncing a successfully-synced entry is a safe no-op

### Settings
- Supports Anthropic, Gemini, and OpenAI API keys
- BT host URL configuration with lock/unlock
- Dev Mode — shows raw JSON parse output for debugging
- Refresh Cases — pulls the firm's case list from BT
- Create Case in BT — from a parsed PAE PDF, creates a new case on the server

---

## AI Notes Format

For best results include in your dictated notes:

- Case number (e.g. `25CR12345`)
- Client last name
- Your name (`This is Lee` or `Investigator Lee`)
- City names for travel (`Eagle Point to Medford`)
- Travel time or clock times (`travel time 30 mins` or `left at 9:00am, arrived 9:30am`)
- Miles driven (`14 miles`)
- What you did and how long (`interviewed witness 60 minutes`)

**Example:**
> This is Lee, case 25CR12475 Mark White. Eagle Point to Medford, 14 miles, travel time 30 minutes. Interviewed witness John Wilson for 60 minutes. Returned to office.

---

## Activity Types

**Investigator Services**
- Case Intake & File Audit
- Strategic Planning
- Case Consultation
- Discovery Analysis & Evidence Review
- Intelligence Gathering & OSINT
- Tactical Field Operations & Scene Documentation
- Witness Development & Interviews
- Investigative Reporting & Documentation
- Court Appearance & Testimony
- Travel Time

**Out of Pocket**
- Mileage
- Parking & Tolls
- CD/DVD/Discs
- USB/Flash Drive
- Circuit Court Copies
- Discovery Fees
- Process Service (Third-Party)
- Photocopies (B&W / Color)
- Photos (3x5, 4x6, Full Page)
- Postage & Shipping
- Records (Public/Gov, Medical/DMV)
- Scanning

---

## Tech Stack

- Vanilla HTML/CSS/JavaScript — no framework, no build step
- BanditTek server — backend + SQLite persistence (via per-record REST endpoints)
- Web Speech API — voice dictation
- Anthropic / Google Gemini / OpenAI — AI parsing
- localStorage — offline entry queue
- GitHub Pages — hosting

---

## Hosting Options

### Option A — Use the shared app (simplest)
Just open the live URL in your browser. All investigators use the same app but each is pointed at their firm's BanditTek host. Any updates pushed to the repo go live for everyone automatically.

```
https://tlee612-lab.github.io/field-log/
```

### Option B — Run your own independent copy

If you want full control over your own version (your own URL, your own updates, no dependency on the main repo):

1. Create a new repo on your GitHub account (e.g. `field-log`)
2. Copy `index.html` into it
3. Go to repo **Settings → Pages → Branch: main → Save**
4. Your app will be live at `https://YOUR-USERNAME.github.io/field-log/`
5. Point Settings → BT Host at your firm's BanditTek server URL

**To pull updates from the main repo later:**
- Download the latest `index.html` from [tlee612-lab/field-log](https://github.com/tlee612-lab/field-log)
- Replace your copy and push — your BT host configuration and settings are unaffected

---

## For Developers

To run locally:

```bash
git clone https://github.com/tlee612-lab/field-log.git
cd field-log
npx serve -p 3000 .
```

Then open `http://localhost:3000` in your browser. The entire app is a single file: `index.html`.

The pre-rewire Google Apps Script backend (`Code.JS`) is preserved at the `last-gas-version` tag for historical recovery; it is no longer part of `main`.

---

## Version

`2026.05.13-BT`

Built by Banditt-Tek Software.
