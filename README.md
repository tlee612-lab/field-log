# TLI Field Log

A mobile-first field logging app for licensed private investigators. Captures billable activity entries via voice dictation or manual form entry, processes them with AI, and syncs to Google Sheets via a Google Apps Script webhook.

---

## Quick Start (New User Setup)

Each investigator runs their own backend. Setup takes about 10 minutes.

### Step 1 — Create your Google Drive folder

1. Open [Google Drive](https://drive.google.com)
2. Create a new folder — name it something like **TLI Auto Log**
3. Open the folder and copy the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/THIS_PART_IS_YOUR_FOLDER_ID
   ```
   Save that ID — you'll need it in the next step.

---

### Step 2 — Deploy the Google Apps Script backend

1. Open [Google Apps Script](https://script.google.com)
2. Click **New project**
3. Delete the default code and paste the full contents of [`Code.JS`](Code.JS) from this repo
4. On line 6, replace the folder ID with your own:
   ```javascript
   const AUTO_LOG_FOLDER_ID = 'YOUR_FOLDER_ID_HERE';
   ```
5. Click **Save** (Ctrl+S), name the project something like **TLI Field Log**
6. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** — approve any permission prompts
8. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/LONG_ID/exec
   ```

---

### Step 3 — Configure the app

1. Open the app: **https://tlee612-lab.github.io/field-log/**
2. Tap the **⚙ Settings** button
3. Under **Cloud Sync**, paste your webhook URL and tap **Save**
4. Tap **Test** to confirm the connection — you should see ✓ Webhook connected
5. Under **AI Assist**, pick your AI provider and enter your API key:
   - **Anthropic (Claude)** — get key at [console.anthropic.com](https://console.anthropic.com)
   - **Google Gemini** — get key at [aistudio.google.com](https://aistudio.google.com)
   - **OpenAI (ChatGPT)** — get key at [platform.openai.com](https://platform.openai.com)
6. Tap **Save Changes**

---

### Step 4 — First entry test

1. Enter your name in the **Investigator** field at the top
2. Tap **Manual** and fill in a test entry
3. Tap **LOG ACTIVITY →**
4. Check your Google Drive folder — a subfolder for the case and a Google Sheet should appear automatically

If no sheet appears, go to Google Apps Script → **Executions** to see if there were any errors.

---

## ⚠️ Code.JS Updates

When a new version of `Code.JS` is released, **you must update it manually** in your Google Apps Script project. The frontend (`index.html`) updates automatically, but the backend requires manual deployment.

### To update your backend:

1. Go to [Google Apps Script](https://script.google.com) and open your **TLI Field Log** project
2. Download the latest `Code.JS` from [this repo](https://github.com/tlee612-lab/field-log/blob/main/Code.JS)
3. Delete all code in your Apps Script editor
4. Paste the new `Code.JS` code
5. On line 6, make sure your folder ID is still there:
   ```javascript
   const AUTO_LOG_FOLDER_ID = 'YOUR_FOLDER_ID';
   ```
6. Click **Save** (Ctrl+S)
7. Click **Deploy → Manage deployments**
8. Click the pencil icon on the existing deployment
9. Click **Redeploy** 
10. Approve any new permission prompts if prompted

The webhook URL stays the same — your settings don't change.

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
- Sync to Google Sheets via Google Apps Script webhook
- Per-entry or bulk sync
- Name mismatch protection — blocks entries where case number belongs to a different client

### Settings
- Supports Anthropic, Gemini, and OpenAI API keys
- Webhook URL configuration with lock/unlock
- Dev Mode — shows raw JSON parse output for debugging
- Refresh Cases — pulls case list from Google Drive folder structure

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

## Google Sheets Layout

Each case gets its own folder and spreadsheet in your Drive folder. Columns:

| Logged At | Case # | Client Last | Client First | Activity Type | Date | Time | Duration | Quantity | Mileage | From | To | Investigator | Notes |

---

## Tech Stack

- Vanilla HTML/CSS/JavaScript — no framework, no build step
- Google Apps Script — backend + Google Sheets integration
- Web Speech API — voice dictation
- Anthropic / Google Gemini / OpenAI — AI parsing
- localStorage — offline entry queue
- GitHub Pages — hosting

---

## Hosting Options

### Option A — Use the shared app (simplest)
Just open the live URL in your browser. All investigators use the same app but each has their own backend configured in Settings. Any updates pushed to the repo go live for everyone automatically.

```
https://tlee612-lab.github.io/field-log/
```

### Option B — Run your own independent copy

If you want full control over your own version (your own URL, your own updates, no dependency on the main repo):

1. Create a new repo on your GitHub account (e.g. `field-log`)
2. Copy `index.html` and `Code.JS` into it
3. Go to repo **Settings → Pages → Branch: main → Save**
4. Your app will be live at `https://YOUR-USERNAME.github.io/field-log/`
5. Follow the backend setup steps above using your own Drive folder

**To pull updates from the main repo later:**
- Download the latest `index.html` from [tlee612-lab/field-log](https://github.com/tlee612-lab/field-log)
- Replace your copy and push — your backend and settings are unaffected

---

## For Developers

To run locally:

```bash
git clone https://github.com/tlee612-lab/field-log.git
cd field-log
npx serve -p 3000 .
```

Then open `http://localhost:3000` in your browser.

The entire app is a single file: `index.html`. `Code.JS` is the Google Apps Script backend — it does not run locally, it must be deployed as a Web App via [script.google.com](https://script.google.com).

---

## Version

`2026.04.24-Stable`

Built by Banditt-Tek Software.
