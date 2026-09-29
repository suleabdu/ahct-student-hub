"""
app/__init__.py
AHCT Student Hub — Flask application factory
==============================================================================
Python equivalent of Code.gs's doGet()/include() bootstrapping, minus the
page-routing (that's now the frontend's job, served separately from
Netlify) — this app is a pure JSON API.
==============================================================================
"""

import logging

from flask import Flask, jsonify
from flask_cors import CORS

from .config import CONFIG
from . import extensions as ext


def create_app(config=CONFIG):
    app = Flask(__name__)
    app.config.from_object(config)

    logging.basicConfig(level=logging.INFO)

    # Services are created once at startup (one authenticated Sheets/Drive
    # client shared by every request) rather than per-request.
    ext.init_services(config)

    # Trailing slashes are a common copy-paste mistake (pasting straight
    # from a browser's address bar, which often shows one) and cause a
    # silent, total CORS mismatch — https://example.com/ never matches a
    # request whose Origin header is https://example.com (browsers never
    # send a trailing slash in Origin) — so every request would be
    # blocked with the browser's opaque "Failed to fetch", with nothing
    # in this app's own logs to explain why. Stripped defensively here.
    origins = "*" if config.CORS_ORIGINS.strip() == "*" else [o.strip().rstrip("/") for o in config.CORS_ORIGINS.split(",")]
    CORS(app, resources={r"/api/*": {"origins": origins}})

    from .blueprints.common import common_bp
    from .blueprints.auth import auth_bp
    from .blueprints.registration import registration_bp
    from .blueprints.student import student_bp
    from .blueprints.tutor import tutor_bp
    from .blueprints.admin import admin_bp

    app.register_blueprint(common_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(registration_bp)
    app.register_blueprint(student_bp)
    app.register_blueprint(tutor_bp)
    app.register_blueprint(admin_bp)

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(success=False, error="Not found."), 404

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception("Unhandled server error")
        return jsonify(success=False, error="An unexpected server error occurred."), 500

    @app.get("/")
    def index():
        return jsonify(service="AH Student Hub API", status="running")

    return app
