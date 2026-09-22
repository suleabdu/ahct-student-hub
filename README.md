# AH Student Hub — Python Edition

A complete migration of the **AHCT_SMS** Google Apps Script project (CAD
Training Programs student management system) to a standalone Python
stack: **Flask** backend (deploy to **Render**), static **HTML/CSS/JS**
frontend (deploy to **Netlify**), source on **GitHub**, with **Google
Sheets** as the database and **Google Drive** for file storage — the same
"database" the original project used, accessed a different way.

The backend authenticates to Sheets/Drive as **your own Google account**
(the one that owns the spreadsheet) via a stored OAuth refresh token —
**not** a service account, which has no personal Drive storage of its own
and can't upload files into a regular Gmail account. See
`docs/ARCHITECTURE_AND_DECISIONS.md`, Section 12, for why.

## Start here

**New to this project? Read [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)
first** — it's a complete, ordered walkthrough from an empty Google
account to a live site: Google Cloud credentials, the spreadsheet,
running things locally, GitHub, Render, and Netlify.

**Then read [`docs/ARCHITECTURE_AND_DECISIONS.md`](docs/ARCHITECTURE_AND_DECISIONS.md)**
— it documents every place this rewrite made a judgment call, fixed a
bug, resolved a conflict between the supplied source files, or completed
a phase the original project hadn't built yet. A few of these are worth
AH Consult Ltd's explicit sign-off, not just silent acceptance — they're
flagged clearly.

## Project layout

```
backend/                  Flask API (deploy to Render)
  app/
    config.py             Sheet names, header schemas, business constants
    services/
      sheets.py            Google Sheets/Drive client (the "database" layer)
      ids.py                Student ID / Course Code / etc. generation
      security.py           Password hashing, JWT sessions, audit logging
      email_service.py      Outbound SMTP email (confirmation, reset links)
      data_service.py       Cross-sheet joins shared by multiple blueprints
      settings_service.py   Intake scheduling + the dynamic Part 1 form
      analytics_service.py  Leaderboard recalculation
      payment_service.py    Optional live Monnify integration
    blueprints/
      auth.py               Login, password setup/reset, sessions
      registration.py       Public application portal (Stages 1-4)
      student.py             Student Portal
      tutor.py                Tutor Portal (assignments, grading, lectures, exams, results)
      admin.py                 Admin Dashboard
  requirements.txt, Procfile, render.yaml, gunicorn_config.py, .env.example

frontend/                 Static site (deploy to Netlify)
  index.html               Public registration portal (4 stages + receipt)
  student-login.html / staff-login.html
  setup-password.html / forgot-password.html / reset-password.html
  portal.html               Student Portal
  tutor.html                 Tutor Portal
  admin-dashboard.html        Admin Dashboard
  js/                        One file per page/concern — api.js is the fetch()
                              wrapper every page uses instead of google.script.run
  css/styles.css             Shared visual identity (ported from Styles.html)

setup/
  get_refresh_token.py      Run ONCE, locally, to authorize your Google account
  requirements.txt

docs/
  SETUP_GUIDE.md            Full deployment walkthrough — start here
  ARCHITECTURE_AND_DECISIONS.md   Every judgment call, flagged and explained
```

## The short version of what changed

- **Student ID format** now follows the supplied "ID Generation and
  Meaning" document (`AHCT2690001`) instead of the live code's old
  `AH/4-BIPF/001` format.
- **Tutor ID is now the tutor's email address**, per that same document.
- **Google authentication uses an OAuth refresh token for a real Google
  account, not a service account** — see above and Section 12 of the
  architecture doc.
- Two phases the original `.gs` files hadn't built yet — the **Lecture
  System** and **Examination System** — are now real, plus a proper
  **Grade Student / Results** flow and automatic **Leaderboard**
  recalculation.
- Everything else — the registration flow, admissions, assignments,
  submissions, dashboards, and the visual design — was ported as
  faithfully as possible; the app should look and behave like the
  original wherever the specification didn't call for a change.

Full detail, including a few open items worth AH Consult Ltd's sign-off,
is in [`docs/ARCHITECTURE_AND_DECISIONS.md`](docs/ARCHITECTURE_AND_DECISIONS.md).
