"""
services/ids.py
AHCT Student Hub — ID generation
==============================================================================
Implements "AH CAD Training Programs — ID Generation and Meaning" (the
document supplied alongside the site files) as the single source of truth
for every generated ID in this system. This supersedes the OLD Apps Script
project's Registration ID format (Utils.generateRegistrationId_, which
produced IDs like "AH/4-BIPF/001") — see
docs/ARCHITECTURE_AND_DECISIONS.md for the full comparison and why the new
document's scheme was adopted instead.

--------------------------------------------------------------------------
STUDENT ID  (the "Registration ID" / login identifier)
--------------------------------------------------------------------------
Format (document Section 1.1.1 / 1.1.2), 11 characters, no separators:

    AH  CT  YY  M   NNNN
    AH = Organisation initials (AH Consult Ltd)
    CT = "CAD Training" programme, abbreviated
    YY = 2-digit year of the INTAKE (not necessarily the calendar year of
         submission — e.g. someone registering in Nov 2026 for the "March
         2027 Intake" gets YY=27)
    M  = 1-character month-of-intake code (see MONTH_CODE below)
    NNNN = 4-digit, zero-padded, globally-incrementing student serial
           number (Counters sheet, counter name "StudentSerial")

    Example: AHCT2690001 (first student, September, 2026 intake)

DISCLOSED ASSUMPTION — the document breaks down its own 11-character rule
for month by showing only single-digit examples ("9" for September); two of
the three real intake modes (December, and any future 10/11/12 month) do
not fit in one digit. To keep to exactly 11 characters as specified, this
build uses a 1-character month code: digits '1'-'9' for January-September,
then 'O'/'N'/'D' for October/November/December. This is a default, exactly
like the open items the Development Plan document resolves itself in its
own Section 12 — flagged here, and in docs/ARCHITECTURE_AND_DECISIONS.md,
for AH Consult Ltd to confirm or override.

--------------------------------------------------------------------------
COURSE CODE
--------------------------------------------------------------------------
Format (document Sections 1.1.3 / 1.1.4): <course-prefix><category-digit>,
e.g. "RVT3" = Revit, Professional. Deterministic — looked up from
CONFIG.COURSE_CODE_PREFIX / CONFIG.CATEGORY_CODES, never generated per
registration. One student can hold several Course Codes (one per enrolled
course), consistent with the multi-course enrollment model already built
into the live Google Sheet schema.

--------------------------------------------------------------------------
TUTOR ID
--------------------------------------------------------------------------
Per document Section 1.1.5, the Tutor ID *is* the tutor's own email
address — there is no separate generated format. See services/auth.py.

--------------------------------------------------------------------------
OTHER IDS (Assignment / Submission / Lecture / Attendance / Exam)
--------------------------------------------------------------------------
Not specified by the document. Extended here, disclosed, in the same
relational spirit: "<CourseCode>-<kind><serial>" so every ID is still
traceable to its course at a glance, using the same Counters-backed serial
mechanism as the Student ID.
==============================================================================
"""

from .sheets import GLOBAL_LOCK

MONTH_CODE = {
    1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6",
    7: "7", 8: "8", 9: "9", 10: "O", 11: "N", 12: "D",
}


def next_counter_value(sheets_client, config, counter_name):
    """Atomically-ish (process-lock-guarded) increment-and-return for a
    named counter, backed by the Counters sheet. This is the Sheets-native
    stand-in for the original project's
    `lastRow = sheet.getLastRow(); serial = lastRow <= 1 ? 1 : lastRow`
    pattern, generalised to any ID kind instead of only Registrations.

    CAVEAT FOR PRODUCTION DEPLOYMENTS: the lock below is process-local. A
    single Render web service instance (the default / recommended setup
    for this project's traffic scale — see docs/SETUP_GUIDE.md) makes this
    safe. If you later scale to multiple instances/workers, replace
    GLOBAL_LOCK with a distributed lock (e.g. Redis) or move counters to a
    transactional store — the read-then-write below is not safe across
    processes without one.
    """
    with GLOBAL_LOCK:
        headers = config.HEADERS["COUNTERS"]
        sheet = sheets_client.get_or_create_sheet(config.SHEETS["COUNTERS"], headers)
        rows = sheets_client.get_all_rows_as_dicts(sheet, headers)

        row_index = -1
        current = 0
        for i, r in enumerate(rows):
            if r.get("CounterName") == counter_name:
                row_index = i + 2
                try:
                    current = int(r.get("NextValue") or 0)
                except ValueError:
                    current = 0
                break

        next_value = current + 1
        if row_index == -1:
            sheets_client.append_row(sheet, headers, {"CounterName": counter_name, "NextValue": next_value})
        else:
            sheets_client.set_cell(sheet, headers, row_index, "NextValue", next_value)

        return next_value


def parse_intake_year_month(intake_mode_label, fallback_year, fallback_month):
    """"July 2026 Intake" -> (2026, 7). Falls back to the values passed in
    if the label doesn't parse (defensive — the label always comes from the
    Settings sheet, which admin staff maintain by hand)."""
    import re

    months = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    }
    m = re.search(r"([A-Za-z]+)\s+(\d{4})", intake_mode_label or "")
    if not m:
        return fallback_year, fallback_month
    month_name, year_str = m.group(1).lower(), m.group(2)
    month = months.get(month_name, fallback_month)
    return int(year_str), month


def generate_student_id(sheets_client, config, intake_mode_label):
    """AHCT<YY><M><NNNN> — see module docstring."""
    from datetime import date

    today = date.today()
    year, month = parse_intake_year_month(intake_mode_label, today.year, today.month)
    yy = f"{year % 100:02d}"
    m_code = MONTH_CODE.get(month, "1")
    serial = next_counter_value(sheets_client, config, "StudentSerial")
    nnnn = f"{serial:04d}"
    return f"AHCT{yy}{m_code}{nnnn}"


def course_code(config, course, category):
    """Deterministic lookup — never a serial. Raises a clear error for an
    unrecognised course/category pair rather than silently returning ''."""
    prefix = config.COURSE_CODE_PREFIX.get(course)
    digit = config.CATEGORY_CODES.get(category)
    if not prefix or not digit:
        return ""
    return f"{prefix}{digit}"


def generate_assignment_id(sheets_client, config, course_code_value):
    serial = next_counter_value(sheets_client, config, "Assignment")
    prefix = course_code_value or "GEN"
    return f"{prefix}-A{serial:04d}"


def generate_submission_id(sheets_client, config, student_id):
    serial = next_counter_value(sheets_client, config, "Submission")
    return f"{student_id}-S{serial:04d}"


def generate_lecture_id(sheets_client, config, course_code_value):
    serial = next_counter_value(sheets_client, config, "Lecture")
    prefix = course_code_value or "GEN"
    return f"{prefix}-L{serial:04d}"


def generate_attendance_id(sheets_client, config, lecture_id):
    serial = next_counter_value(sheets_client, config, "Attendance")
    return f"{lecture_id}-AT{serial:04d}"


def generate_exam_id(sheets_client, config, course_code_value):
    serial = next_counter_value(sheets_client, config, "Exam")
    prefix = course_code_value or "GEN"
    return f"{prefix}-EX{serial:04d}"
