# Architecture & Decisions

This document exists so nothing that changed in this rewrite is a silent
surprise. Read it before you go live — a few of these are judgment calls
AH Consult Ltd should confirm, not just accept.

## 1. What this project is

A migration of the AHCT_SMS Google Apps Script project (source files
supplied as `AH_SiteFiles.rar`) to a standalone Python stack:

- **`backend/`** — a Flask JSON API (deploy to **Render**), using Google
  Sheets as the database (via `gspread`) and Google Drive for file
  storage (via the Drive API) — i.e. the same "database" as the original,
  read and written a different way. Authenticates as a real Google
  account via a stored OAuth refresh token, **not** a service account —
  see Section 12.
- **`frontend/`** — static HTML/CSS/JS (deploy to **Netlify**), ported
  page-for-page from the original's Apps Script `HtmlService` pages, with
  every `google.script.run` call replaced by a `fetch()` call to the
  Flask API.
- **GitHub** — hosts both; Render and Netlify each deploy straight from
  the repo (see `docs/SETUP_GUIDE.md`).

The two source documents supplied alongside the site files —
`AH_Student_Hub_Development_Plan.docx` and
`AH_CAD_Training_Programs_ID_Generation_and_Meaning.docx` — were read in
full and used as the specification for what to build, including the
phases the original `.gs` files had not yet implemented (Section 3 below).

## 2. The Student ID format changed — read this first

The **live code** in `Code.gs`/`utilities.gs` generated Registration IDs
like `AH/4-BIPF/001` (total courses, category initials, serial).

The **ID Generation document** supplied alongside the site files
specifies a completely different format: `AHCT2690001` — `AH` + `CT` +
2-digit intake year + 1-character intake month + 4-digit serial.

This rewrite implements **the ID Generation document's format**, since it
was supplied as the explicit, authoritative specification for "how the ID
generation should work." Every new registration gets an `AHCT...` ID —
see `backend/app/services/ids.py` for the full implementation and the
month-code table.

**Open item AH Consult Ltd should confirm:** the document's own examples
only show a single digit for month ("9" for September), but two of the
three real intake modes (December, and any future Oct/Nov) don't fit in
one digit while keeping the ID at exactly 11 characters. This build uses
`1`-`9` for January–September and `O`/`N`/`D` for October/November/
December, disclosed in `ids.py`'s docstring. If AH Consult Ltd would
rather use two digits for month (and a 12-character ID), that's a small
change to `MONTH_CODE` and the header comment — flagging it rather than
silently picking one.

**Course Code** (`RVT3`, `GRD1`, etc.) is unaffected by this and follows
the ID document's course-prefix + category-digit table exactly
(`CONFIG.COURSE_CODE_PREFIX` / `CONFIG.CATEGORY_CODES`).

**Tutor ID** is now the tutor's own email address (ID document,
Section 1.1.5) — see Section 4 below.

## 3. Phases completed beyond the supplied `.gs` files

The Development Plan's phased build-out (Section 10) was checked against
what actually exists in the supplied `.gs`/`.html` files. What was
missing has been built into this rewrite:

| Phase | What it is | Status in supplied project | Status here |
|---|---|---|---|
| 1–5 | Public Application Portal | Built | Ported |
| 6 | Assignments | Built | Ported |
| 7 | Submissions & grading | Built | Ported |
| **8** | **Lecture System** | **Not built** (Tutor.html's "Start New Lecture" was a "Coming soon" stub) | **Built** — `POST /api/tutor/lectures`, `/lectures/create`; real UI in `tutor.html` |
| **9** | **Examination System** | **Not built** (Tutor.html's "Set Up Exams" was a stub) | **Built** — `POST /api/tutor/exams`, `/exams/create`; real UI |
| **10** | **Results / Grade Student** | **Partially built** — `tutorPublishResult` existed in `Code.gs` but didn't match the CA + Exams(Objectives) + Exams(Practical) model or Section 8.1's pass/fail bands | **Rebuilt** to match the spec exactly — `POST /api/tutor/results/save`; new "Grade Student" tab in `tutor.html` |
| **11** | **Leaderboard recalculation** | **Not built** (`AnalyticsService.gs` was named in the file architecture but never written) | **Built** — `backend/app/services/analytics_service.py`, triggered automatically after every result save |
| — | Admin Dashboard | Built (not in the original spec, added by a later phase) | Ported, plus a Tutor-management convenience layer (Section 6 below) |

`Stage4_Submit.html` / `Stage4_SubmitScript.html` in the supplied files
were **not** included anywhere by `Index.html` (only Stage1–3 +
`RegistrationReceipt.html` were) — dead/superseded files from an earlier
version of the flow. They were not ported; Stage 3's payment script
already contains the final-submission logic that superseded them.

## 4. Tutor ID = email (not Tutor Code)

Per the ID Generation document, a tutor's ID *is* their email address —
there's no separate generated format for it. This rewrite makes email the
tutor's login identifier and primary key in the `Tutors` sheet
(`TUTORS` header schema in `config.py`). `TutorCode` (the
`RVT3`-style code) is kept as a *separate* column — it's still what
appears on assignments/results/lectures for reporting, but it is no
longer what a tutor types in to log in. `staff-login.html`'s Tutor tab
now asks for an email, same as the Admin tab.

## 5. Consolidated Results schema

The supplied project had **two different, inconsistent** shapes for
results in circulation: `Code.gs`'s live `tutorPublishResult` (RegId,
Course, Category, CAScore, ExamScore, TotalScore, Grade, Remarks,
PublishedDate) and `Config.gs`'s declared `HEADERS.RESULTS` (Student Full
Name, CourseCode, CA, Exams (Objectives), Exams (Practical), Total, Exam
Status, ...). Since there's no live data to migrate, this rewrite
standardises on the **second, spec-matching schema** everywhere (Section
8.1's CA + Objectives + Practical banding) — see `CONFIG.HEADERS["RESULTS"]`.

## 6. Deliberate extensions beyond the original design

- **Admin Tutor management** (`admin-dashboard.html`'s "Tutors" tab,
  `POST /api/admin/tutors`, `/tutors/create`). The original design had
  admin staff add Tutors/Administrators/Settings rows **by hand, directly
  in the spreadsheet** — a documented, deliberate choice ("the sheet
  itself is the interface"). That still works completely unchanged here.
  This is an additional, optional convenience layered on top, not a
  replacement — see `backend/app/blueprints/admin.py`'s module docstring.
- **Intake-mode scheduling endpoints** (`POST /api/admin/intakes`,
  `/intakes/update`) — same relationship to the `Settings` sheet as
  above.
- **Optional live payments (Monnify)** — `services/payment_service.py`
  implements the integration the original only sketched in a comment.
  Off by default (`MONNIFY_ENABLED=false`); the static account behaviour
  the original had is the default until three environment variables are
  set (`docs/SETUP_GUIDE.md`).

## 7. Simplifications made possible by static hosting

The original ran every page inside Apps Script's sandboxed `HtmlService`
iframe, which does **not** reliably allow script-triggered top-level
navigation — hence its extensive "NAVIGATION NOTE" comments, visible
"Continue" links the person had to click, and passing session tokens
through URL query parameters (`?token=...`) rather than relying on
`sessionStorage` alone.

A static page on Netlify is **not** sandboxed in an iframe, so this
rewrite navigates directly (`window.location.href`) after a short,
visible success state, and keeps session tokens in `sessionStorage` only
— simpler, and the token never appears in browser history except on the
one genuine case that still needs a URL (the emailed password-reset
link, `reset-password.html?token=...`).

## 8. Sessions: JWT instead of CacheService

Apps Script used `CacheService` (a managed key-value store) for session
tokens. This rewrite uses **signed, stateless JWTs** instead (`PyJWT`,
`services/security.py`) — no server-side session store needed, which also
means sessions keep working across multiple Render instances if you ever
scale up, unlike the ID-counter lock below.

## 9. The one thing that does *not* horizontally scale yet

`services/ids.py`'s `next_counter_value()` (used for every generated ID —
Student ID, Assignment ID, etc.) and `services/sheets.py`'s `GLOBAL_LOCK`
are **process-local locks** — the direct Python equivalent of Apps
Script's `LockService.getScriptLock()`, which was also single-process.
`gunicorn_config.py` is deliberately pinned to **`workers = 1`** (multiple
*threads* are fine) so two requests can never generate the same ID at the
same moment. This is more than enough for this project's expected
traffic. If you ever need more than one server process, swap the lock for
a distributed one (e.g. Redis) first — see the caveat comment right above
`next_counter_value()`.

## 10. Small bug fix ported forward

The original `Styles.html`'s print CSS hid `#page-0`–`#page-3` and showed
`#page-4` as the printable receipt — but `Index.html` only ever had four
stage divs (`#page-0`…`#page-3`; the receipt *is* `#page-3`), so printing
silently produced a blank page. Fixed in `frontend/css/styles.css` to
show `#page-3`.

## 11. Naming: "Animation" → "Lumion"

The original course dropdown listed "Animation / Lumion" (`value=
"Animation"`). The ID Generation document names this course **"Lumion"**
(code prefix `LSF`). This rewrite renames the option to "Lumion"
everywhere (dropdown, `CONFIG.COURSES`, `CONFIG.COURSE_CODE_PREFIX`) to
match the authoritative document. Category fees and the rest of the
course list are unaffected.

## 12. Google auth: OAuth refresh token, not a service account

Earlier drafts of this rewrite authenticated to Sheets/Drive as a
**service account**. That was changed to an **OAuth refresh token for a
real Google account** — the one that owns the spreadsheet — because a
service account has **no personal Drive storage of its own**. Uploading a
file "owned" by a service account into a regular Gmail account's Drive
fails immediately; the standard fix (Shared Drives) is a paid Google
Workspace feature, not available on a personal Gmail account, which is
what AH Consult Ltd is using.

Authenticating as the real account instead means every uploaded file
(passport photos, payment receipts, submissions, lecture materials) is
owned by that account, counts against its normal 15 GB free quota, and is
manageable (moved, shared, deleted) the same way as any other file in that
Drive — exactly matching how the original Apps Script project behaved
under "Execute as: Me."

**What changed, mechanically:**
- `backend/app/services/sheets.py`'s `_load_credentials()` now builds a
  `google.oauth2.credentials.Credentials` object from a client ID, client
  secret, and refresh token (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
  `GOOGLE_REFRESH_TOKEN`), instead of a service-account JSON key.
  `token=None` is passed deliberately — `google-auth` transparently
  exchanges the refresh token for a short-lived access token on first use
  and again whenever it expires; no access token is ever stored.
- A new **`setup/`** folder holds `get_refresh_token.py` — a script run
  **once, locally, by a human** (never deployed) that runs the interactive
  OAuth consent flow and prints the three values above. This mirrors
  exactly how a service-account JSON key used to be generated once and
  then pasted into environment variables — just via a different Google
  Cloud credential type. See `docs/SETUP_GUIDE.md`, Steps 2-4.
- No separate "share the spreadsheet with a robot email" step exists
  anymore (the old Step 3) — the authenticated account already owns the
  spreadsheet, or was explicitly given Editor access to it, per Step 1.

**Trade-off worth knowing:** a refresh token is tied to one specific human
Google account rather than a purpose-built robot identity. If that
person's Google account is ever deleted or has its account-wide API
access revoked, every deployment using that token loses Sheets/Drive
access until a new token is generated (Step 3) from a working account.
For a single small-organization deployment like this one, that trade-off
is worth the alternative of paid Workspace/Shared Drives it avoids.

## 13. Critical fix: registrations silently hanging forever ("Submitting...")

**Symptom reported:** new registrations got stuck at "Submitting
Application & Generating Receipt..." indefinitely. The passport photo
DID appear in the `AHCT_Passports` Drive folder, `SystemLogs` showed
activity, but no row was ever written to `Registrations`.

**Root cause: a genuine deadlock**, not a Sheets/Drive permissions
problem. `blueprints/registration.py`'s critical section acquired
`GLOBAL_LOCK` (`services/sheets.py`) and, while still holding it, called
`services/ids.py`'s `generate_student_id()`, which itself calls
`next_counter_value()` — which *also* acquires `GLOBAL_LOCK`. It was a
plain `threading.Lock()`, which is **not reentrant**: a thread trying to
acquire a lock it already holds blocks forever, on itself. That exactly
matches the reported symptom — the passport/receipt uploads (which
happen *before* the lock) succeeded and appeared in Drive; any log lines
written before the lock (e.g. a `TUTOR_CODE_NOT_FOUND` warning during
course validation) appeared in `SystemLogs`; then the request thread
hung permanently trying to re-enter a lock it was already inside, so the
`Registrations` row was never written and the HTTP response never came
back — leaving the frontend spinning forever.

**Fix:** `GLOBAL_LOCK` is now a `threading.RLock()` instead of a plain
`threading.Lock()`. `RLock` allows the *same thread* to acquire it
multiple times (with matching releases) while still only ever letting
one thread through at a time overall — which is all the atomicity this
code actually needs. This was verified directly: an isolated
reproduction of the exact nested-acquisition pattern deadlocks
permanently with the old `Lock()` and completes immediately with the new
`RLock()`.

**A related, secondary fix:** `gunicorn_config.py` set `threads = 4` but
never set `worker_class = "gthread"`. Gunicorn's default "sync" worker
class **silently ignores `threads` entirely** and handles exactly one
request at a time, full stop — meaning the service could only ever
process one request across the *entire application* at once (including
Render's own health-check pings). `worker_class = "gthread"` is now set
explicitly so `threads = 4` actually takes effect.

## 14. Explicit, admin-controlled Tutor Assignment

Previously, a tutor's "roster" was computed implicitly: any student
enrolled in the same Course + Category a tutor was registered for showed
up on that tutor's dashboard automatically, with no admin action
required. Per request ("Assign Tutors professionally instead of system
automation"), this is now explicit:

- The `Courses` sheet gained an **"Assigned Tutor"** column (a tutor's
  email — blank by default; the pre-existing "Tutor Code" column is
  unchanged and stays purely informational, auto-filled at registration
  as a suggested convention label).
- `POST /api/admin/registrations/assign-tutor` (regId, course,
  tutorEmail) is the one place that sets it — from the Admin Dashboard's
  registrations table, each enrolled course now has a live "Tutor"
  dropdown (scoped to tutors actually registered for that course +
  category) right in the expanded row.
- `services/data_service.py`'s `build_tutor_bundle` (and every other
  tutor-roster/ownership check — the dashboard's "assigned" flag, the
  Grade Student ownership check) now reads
  `get_registration_ids_assigned_to_tutor(tutor_email)` instead of the
  old course/category convention match
  (`get_registration_ids_for_course`, which still exists and is used
  only for the registration-time "suggested" Tutor Code and the
  student's own "classmates" count — a different, legitimate use).
- Registration itself no longer auto-populates "Assigned Tutor" — a
  student's course rows start unassigned and stay that way until an
  admin explicitly assigns them.

Admin also gained an **Intake Modes** tab (add new intakes; edit any
intake's opening/closing dates) — wired to `/api/admin/intakes` and
`/intakes/update`, which already existed in the backend from the first
build but had no frontend UI.

## 15. New landing page; registration form renamed to apply.html

Per request, a proper marketing landing/home page now exists at
`frontend/index.html`, adapted from AH Consult Ltd's live homepage
(`ahconsultcadprograms.netlify.app`, supplied as `Index.html`) — same
photos (all 10 real graduation-gallery images, verified byte-for-byte
against the supplied file's Google Drive IDs), same copy, same dark-mode
toggle, same embedded Google Map, same Montserrat/Open Sans +
brandOrange/brandBlack design system, kept deliberately separate from
the app's own orange/Roboto `css/styles.css` theme since it's the public
marketing site the app's pages link out from, not one of the app's own
portal pages.

What actually needed to be a Public Application Portal page — Stage 1-4
of the registration flow — **moved from `index.html` to `apply.html`**
so `index.html` could become the new landing page. Every internal link
that used to point at the old `index.html` (student-login.html's "Start
an application," code comments) was updated to `apply.html`.

**Every KoBoToolbox link/reference from the source homepage was
removed**, replaced with links into this app: "Apply Now" (nav, hero,
mobile menu, Admission Gateway) goes to `apply.html`; new "Student
Login" / "Staff Login" links were added throughout (nav, mobile menu,
hero, and as three direct cards replacing the Admission Gateway's old
KoBoToolbox button) so all three entry points are reachable straight
from Home, as requested.

**Two disclosed content decisions**, since the source material didn't
map cleanly onto this app:
- The source Programs section advertised 6 software packages: AutoCAD,
  ArchiCAD, SketchUP, Revit, Lumion, **VRAY**. This app's actual
  registrable course catalog (`CONFIG.COURSES`) is a *different* 6: the
  same five, plus **Graphic Design**, minus VRAY. Rather than silently
  drop one list or the other, the landing page shows all 7: the five
  shared courses' tier links pre-select that course/category on
  `apply.html` (via `?course=...&category=...`, read by a small addition
  to `apply.html`'s bootstrap script); a Graphic Design card was added
  (a real course the source homepage didn't advertise); VRAY was kept
  for continuity but its tier links fall back to a plain `apply.html`
  since there's no matching course to pre-select.
- The source Records section had exactly ONE real example filled in
  (an AutoCAD Beginner card, two named students) with a code comment,
  "Add other cards similarly," implying more were intended but not
  supplied. Rather than invent additional student names or scores, the
  landing page keeps only that one genuine example and reframes the
  section's copy as a sample rather than a full record book. Send real
  examples and more can be added the same way.

## 16. Mobile navigation on the three dashboards

The Student/Tutor/Admin dashboard sidebars were `hidden md:flex` — on
any phone-width screen the sidebar simply disappeared, with **no**
replacement, leaving no way to switch views at all. `js/components.js`'s
`renderSidebar`/`renderHeader` now implement a real slide-in drawer:
a hamburger button in the header (visible only below the `md:` breakpoint)
opens the sidebar as an overlay with a tap-to-close backdrop; selecting a
nav item or tapping outside closes it again; at `md:` and above it's
exactly the same always-visible fixed sidebar as before. `portal.html`,
`tutor.html`, and `admin-dashboard.html` were updated to match (a new
backdrop element, and the sidebar's initial classes updated so there's
no flash of the wrong state before `components.js` runs).

Two data tables that are wider than a phone screen — the Admin
Dashboard's registrations table and the Tutor Portal's roster table —
were also missing horizontal scroll containment (`overflow-x: auto`),
which would otherwise push the whole page sideways on a narrow screen
instead of scrolling just the table; both are fixed.

