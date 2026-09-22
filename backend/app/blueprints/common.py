"""
blueprints/common.py
AHCT Student Hub — Health check
==============================================================================
Used by Render's health check, and a handy first thing to hit after
deploying to confirm the service is up and can reach Google Sheets.
==============================================================================
"""

from flask import Blueprint, jsonify

from .. import extensions as ext

common_bp = Blueprint("common", __name__, url_prefix="/api")


@common_bp.get("/health")
def health():
    sheets_ok = True
    sheets_error = None
    try:
        ext.sheets_client.spreadsheet()
    except Exception as e:
        sheets_ok = False
        sheets_error = str(e)

    return jsonify(status="ok" if sheets_ok else "degraded", sheetsConnected=sheets_ok, sheetsError=sheets_error)
