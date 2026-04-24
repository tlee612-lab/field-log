# TLI Field Log

A mobile-first field logging app for licensed private investigators. Captures billable activity entries via voice dictation or manual form entry, processes them with AI, and syncs to Google Sheets via a Google Apps Script webhook.

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

## Setup

### 1. Deploy the Google Apps Script backend

- Open [Google Apps Script](https://script.google.com)
- Create a new project and paste the contents of `Code.gs`
- Set `AUTO_LOG_FOLDER_ID` to your Google Drive folder ID
- Deploy as a Web App (Execute as: Me, Who has access: Anyone)
- Copy the deployment URL

### 2. Configure the app

- Open the app in a browser (or on mobile via GitHub Pages)
- Go to Settings → Cloud Sync
- Paste your webhook URL and tap Save
- Go to Settings → AI Assist
- Select your AI provider and enter your API key
- Tap Save Changes

### 3. First use

- Tap **AI Mode** to use voice/text dictation
- Tap **Manual** for form-based entry
- Fill in Investigator name — it persists across sessions
- After processing notes, review entries in the log
- Tap **↑ Sync All** to push entries to Google Sheets

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
- Google Apps Script — backend + Google Sheets integration
- Web Speech API — voice dictation
- Anthropic / Google Gemini / OpenAI — AI parsing
- localStorage — offline entry queue
- GitHub Pages — hosting

---

## Version

`2026.04.24-Stable`

Built by Banditt-Tek Software.
