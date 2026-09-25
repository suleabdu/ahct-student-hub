# Setup Guide — AH Student Hub (Python + Flask + Render + GitHub + Netlify)

This walks through everything from zero to a live site: Google Cloud
credentials, the Google Sheet "database," running the backend and
frontend locally, pushing to GitHub, and deploying the backend to Render
and the frontend to Netlify.

Follow the steps in order — later steps depend on values you generate in
earlier ones. Where you see `you@example.com`, `ahconsult`, etc., that's a
placeholder — use your own.

**A note on how this app authenticates to Google:** it does **not** use a
service account. A service account has no personal Drive storage of its
own, so files it "owns" can't be uploaded into a regular Gmail account's
Drive — the usual fix (Shared Drives) needs paid Google Workspace, not a
personal Gmail account. Instead, Steps 2–3 below authorize this app to act
as **your own Google account** — the same one that owns the spreadsheet —
via a stored OAuth refresh token. Every file it uploads ends up owned by
that real account, using its normal 15 GB quota, exactly like the
original Apps Script project running under "Execute as: Me." See
`docs/ARCHITECTURE_AND_DECISIONS.md`, Section 4, for the full rationale.

---

## Before you start

You'll need, all free to create:
- A Google account (for Google Sheets/Drive and the Cloud Console) — this
  will be the account the app authenticates as, so use the one that
  should own the spreadsheet and every uploaded file
- A [GitHub](https://github.com) account
- A [Render](https://render.com) account
- A [Netlify](https://netlify.com) account
- Python 3.11+ installed locally, to run Step 3 and to test before you deploy

---

## Step 1 — Create the Google Sheet ("the database")

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet, **using the Google account you intend to authorize
   in Step 3**. Name it something like **"AH Student Hub Database"**.
2. Look at its URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.
   Copy that long ID — this is your `SPREADSHEET_ID`. Save it somewhere;
   you'll need it in Step 5.
3. That's it — don't create any tabs or headers by hand. The backend
   creates every sheet tab and header row itself the first time it's
   needed (`SheetsClient.get_or_create_sheet`, see
   `backend/app/services/sheets.py`).

   *(If the spreadsheet is already owned by a different Google account
   than the one you'll authorize in Step 3 — e.g. a colleague created it
   — just share it with the account you'll authorize, as **Editor**,
   before Step 3.)*

## Step 2 — Google Cloud: enable APIs & create an OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/),
   signed in as the same account from Step 1.
2. Create a new project (top-left project dropdown → **New Project**) —
   name it e.g. `ahct-student-hub`.
3. With that project selected, go to **APIs & Services → Library** and
   enable both:
   - **Google Sheets API**
   - **Google Drive API**
4. Go to **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Fill in the required fields (app name — e.g. "AH Student Hub" —
     support email, developer contact email)
   - Under **Test users**, add the Gmail address from Step 1
   - Leave it in **Testing** status — you do not need to publish it, and
     shouldn't
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**:
   - Application type: **Desktop app**
   - Name it anything, e.g. "AH Student Hub Setup"
   - Click **Create**, then **Download JSON**
   - Rename the downloaded file to `client_secret.json` and place it in
     this project's `setup/` folder (it's already git-ignored — never
     commit it)

## Step 3 — Generate your refresh token (run once, locally)

On your own computer, with Python installed:

```bash
cd setup
pip install -r requirements.txt
python get_refresh_token.py
```

A browser window opens — sign in with the Gmail account from Step 1 and
click **Allow** on both permission screens (Sheets and Drive; Google may
show an "unverified app" warning first since the consent screen is still
in Testing status — click **Advanced → Go to AH Student Hub (unsafe)** to
proceed; this is expected and safe since it's your own app and your own
account). The script then prints three values:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

Copy these somewhere safe — you'll paste them into `.env` (Step 5) and
into Render (Step 9). `client_secret.json` and this script are never
deployed anywhere; they're only for this one-time local step.

## Step 4 — Get the code onto your computer and into GitHub

1. Unzip the project you were given.
2. Create a new, empty repository on GitHub (e.g. `ahct-student-hub`) —
   don't initialise it with a README.
3. From inside the unzipped project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — AH Student Hub Python migration"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/ahct-student-hub.git
   git push -u origin main
   ```

## Step 5 — Configure and run the backend locally

1. ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env
   ```
2. Open `.env` and fill in:
   - `SECRET_KEY` / `JWT_SECRET` — any long random strings (e.g. run
     `python3 -c "import secrets; print(secrets.token_hex(32))"` twice).
   - `SPREADSHEET_ID` — from Step 1.2.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` —
     the three lines `get_refresh_token.py` printed in Step 3.
   - Leave `EMAIL_ENABLED=false` for now if you haven't set up email yet
     (Step 10) — registration and login will still work, just without
     sending mail.
3. Run it:
   ```bash
   python wsgi.py
   ```
4. Visit `http://localhost:5000/api/health` in your browser. You should
   see `{"status": "ok", "sheetsConnected": true, ...}`. If
   `sheetsConnected` is `false`, re-check Steps 2 and 3 — the error
   message tells you what's missing.

## Step 6 — Configure and run the frontend locally

1. Open `frontend/js/config.js` and confirm `API_BASE_URL` is
   `http://localhost:5000` (the default).
2. Serve the frontend folder with any static file server, e.g.:
   ```bash
   cd frontend
   python3 -m http.server 8888
   ```
3. Visit `http://localhost:8888` — you should see the new landing page.
   Click **Apply Now** (or go straight to
   `http://localhost:8888/apply.html`) to see the registration portal,
   with intake cards loading from your backend.
4. Test the full flow: submit an application (Stage 1–3), then log in at
   `http://localhost:8888/student-login.html` with the Student ID you
   were given and the default password (`123456` unless you changed
   `DEFAULT_PASSWORD`).

## Step 7 — Create your first Admin account

There's no signup form for Admin — by design, matching the original
project (admin accounts are added directly to the spreadsheet, the same
trust boundary the original used for Tutors/Administrators). To create
one:

1. Open your Google Sheet. A tab called **Administrators** will exist
   once the backend has run at least once (it self-creates on first use —
   trigger it by opening `staff-login.html` and attempting any admin
   login once, or just add the tab yourself).
2. Add a row with just the **Email** column filled in (leave Password /
   PasswordSalt blank) — e.g. `admin@ahconsult.com`.
3. Log in at `staff-login.html`, Admin tab, with that email and the
   default password (`123456`). You'll be asked to set a real password on
   first login, same as every other role.

## Step 8 — Add your first Tutor

Two ways, either works:
- **Through the app** (easiest): log in as Admin → **Tutors** tab → Add
  Tutor (email, course, category).
- **Directly in the sheet**: open the **Tutors** tab, add a row with
  `TutorID` and `Email` both set to the tutor's email, `Course`, and
  `Category` filled in.

Either way, the tutor logs in at `staff-login.html` (Tutor tab) with that
email and the default password, then sets their own name/password/photo
on first login.

## Step 9 — Deploy the backend to Render

1. Go to [Render](https://dashboard.render.com) → **New → Web Service**
   → connect your GitHub repo.
2. Render should detect `backend/render.yaml` automatically (it sets
   **Root Directory** to `backend`, the build/start commands, and the
   health check path for you). If it doesn't auto-detect, set manually:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --config gunicorn_config.py wsgi:app`
3. Under **Environment**, add every variable from your local `.env`
   (Step 5.2) — Render doesn't read your local `.env` file, only what you
   enter in its dashboard. At minimum: `SECRET_KEY`, `JWT_SECRET`,
   `SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REFRESH_TOKEN`, `ADMIN_EMAIL`.
   Set `FRONTEND_URL` to your Netlify URL once you have it (Step 11) —
   you can come back and edit this.
   Set `CORS_ORIGINS` to your Netlify URL too, once you have it (leaving
   it as `*` works but is not recommended once you're live).
4. Deploy. Once live, visit `https://YOUR-SERVICE.onrender.com/api/health`
   to confirm it's up — same check as Step 5.4.

**Note on Render's free tier:** free web services spin down after
inactivity and take ~30–60 seconds to wake on the next request. The
frontend's loading states (spinner → "this is taking longer than
expected" → retry) already handle this gracefully, but if it's a problem
for your users, upgrade to a paid instance type.

## Step 10 — Set up outbound email

The app sends confirmation, password-reset, and (optionally) chat-
notification emails via SMTP. Using Gmail:

1. On the Google account you want emails to come from, turn on
   [2-Step Verification](https://myaccount.google.com/security) if it
   isn't already on.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
   create an app password for "Mail," and copy the 16-character code.
3. Back in Render's environment variables (or your local `.env`):
   - `EMAIL_ENABLED=true`
   - `SMTP_USERNAME` = that Gmail address
   - `SMTP_PASSWORD` = the 16-character app password (not your normal
     Gmail password)
   - `MAIL_FROM_ADDRESS` = same Gmail address
   - `ADMIN_EMAIL` = where you want a copy of every registration/chat
     notification sent
4. Redeploy (Render redeploys automatically when you save environment
   variable changes) and test by submitting a registration.

Any other SMTP provider works too — just set `SMTP_HOST`/`SMTP_PORT`
accordingly. This can be the same Google account as Steps 1–3, or a
different one — email sending is independent of the Sheets/Drive OAuth
setup.

## Step 11 — Deploy the frontend to Netlify

1. First, point the frontend at your live backend: edit
   `frontend/js/config.js`, set `API_BASE_URL` to your Render URL from
   Step 9.4 (no trailing slash), commit, and push to GitHub.
2. Go to [Netlify](https://app.netlify.com) → **Add new site → Import an
   existing project** → connect the same GitHub repo.
3. Set:
   - **Base directory**: `frontend`
   - **Build command**: *(leave blank — there's nothing to build, it's
     plain static files)*
   - **Publish directory**: `frontend` (or `.` if Netlify already scoped
     you into the `frontend` folder via Base directory)
4. Deploy. Netlify gives you a URL like
   `https://your-site-name.netlify.app`.
5. Go back to Render (Step 9.3) and set `FRONTEND_URL` and `CORS_ORIGINS`
   to this Netlify URL, then redeploy the backend so emailed links and
   CORS both point at the right place.
6. Optional: under Netlify's **Domain settings**, add a custom domain.

## Step 12 — Test the live site end to end

1. Visit your Netlify URL — you should land on the new home page. Click
   **Apply Now** and submit a test registration.
2. Check that the confirmation email arrives (Step 10).
3. Log in as that student, confirm the forced password-change screen
   appears, set a new password, and land on the (not-yet-admitted)
   profile view.
4. As Admin (Step 7), open the Admin Dashboard, find that registration,
   and change its Admission Status to **Admitted**. Reload the student
   portal — the full dashboard (cards, assignments) should now appear.
5. Still in the Admin Dashboard, expand that registration's course row
   and use the new **Tutor** dropdown to assign it to the Tutor from
   Step 8 — a student's course only shows up on a tutor's roster once
   explicitly assigned this way (Section 14 of the architecture doc).
6. As that Tutor, confirm the student now shows up on your roster,
   create an assignment, and confirm it appears in the student's
   Assignments view.
7. Try **Grade Student** (Tutor Portal) and confirm the Total/Exam Status
   calculate correctly and the Leaderboard updates
   (`services/analytics_service.py`).
8. Confirm a file upload (e.g. the passport photo during registration)
   actually lands in the Google Drive of the account from Step 1 — open
   Drive in that account and look for the `AHCT_Passports` folder.
9. On your phone (or a narrow browser window), open the Student, Tutor,
   and Admin dashboards and confirm the hamburger menu in the header
   opens a slide-in sidebar you can navigate with — the sidebar should
   never simply be missing with no way to switch views.
10. In the Admin Dashboard's **Intake Modes** tab, edit an intake's
    dates (or add a new one) and confirm it updates immediately on the
    public Apply form.

## Optional: live payments with Monnify

By default, the Payment stage shows a **static** bank account (same
behaviour the original project had). To switch to live Monnify reserved
accounts:

1. Get API credentials from your [Monnify](https://monnify.com) dashboard.
2. Set, in Render's environment: `MONNIFY_ENABLED=true`,
   `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE`, and
   `MONNIFY_BASE_URL` (use the sandbox URL until you're ready to go
   live, then switch to the production one).
3. Redeploy. `services/payment_service.py` handles the rest.

## Ongoing notes

- **If the refresh token stops working** (e.g. you revoked access at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
  or rotated the OAuth client secret), re-run
  `setup/get_refresh_token.py` and update `GOOGLE_REFRESH_TOKEN`
  wherever it's set (local `.env` and/or Render).
- **Publishing the OAuth consent screen:** leaving it in "Testing" status
  (Step 2.4) is fine indefinitely for this use case — only the account(s)
  listed as test users can authorize it, which is exactly what you want
  here (nobody else should be generating a refresh token for this app).
- **Rotating credentials:** if `client_secret.json`'s secret is ever
  exposed, delete that OAuth client in Cloud Console, create a new one
  (Step 2.5), and re-run Step 3.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/health` shows `sheetsConnected: false` | `SPREADSHEET_ID` wrong, or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN` missing or mismatched — re-run `setup/get_refresh_token.py` (Step 3) and double-check all three were copied in full |
| `get_refresh_token.py` says it couldn't find `client_secret.json` | It must be saved inside the `setup/` folder, named exactly `client_secret.json` (Step 2.5) |
| Google shows "Access blocked: this app's request is invalid" or similar during Step 3 | The OAuth consent screen (Step 2.4) is missing a required field, or the Sheets/Drive APIs (Step 2.3) aren't enabled yet |
| `get_refresh_token.py` runs but doesn't print a `GOOGLE_REFRESH_TOKEN` line | This Google account already authorized this app before, so Google didn't reissue a refresh token. Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions), remove this app's access, and run the script again |
| Frontend shows "Could not load the application form" | `API_BASE_URL` in `frontend/js/config.js` doesn't match your backend's real URL, or `CORS_ORIGINS` on the backend doesn't include your frontend's origin |
| Registration email never arrives | `EMAIL_ENABLED=false`, or Gmail app password wrong/missing 2-Step Verification (Step 10) |
| "This is taking longer than expected" on first login after deploy | Normal on Render's free tier waking from sleep — wait ~30–60s and click Try Again |
| Two people register at the exact same instant and something looks racy | See `docs/ARCHITECTURE_AND_DECISIONS.md`, Section 9 — make sure Render is running exactly 1 worker (the default `gunicorn_config.py` setting) |
| Registration stuck at "Submitting Application & Generating Receipt..." forever, no row appears in Registrations | This was a real deadlock bug, fixed in this build — see `docs/ARCHITECTURE_AND_DECISIONS.md`, Section 13. If you still see this after deploying the fixed code, confirm `services/sheets.py`'s `GLOBAL_LOCK` is a `threading.RLock()` (not `Lock()`) and `gunicorn_config.py` sets `worker_class = "gthread"` |
| A tutor logs in and sees "No Students Assigned Yet" even though students registered for their course | Expected — tutor rosters are no longer automatic (Section 14). An admin must explicitly assign each student's course to that tutor from the Admin Dashboard's registrations table (the "Tutor" dropdown in each expanded course row) |
