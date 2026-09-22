"""
gunicorn_config.py
==============================================================================
IMPORTANT: workers is deliberately 1. services/ids.py's Counters-based ID
generator and services/sheets.py's GLOBAL_LOCK only guard against races
WITHIN a single process. Running more than one worker here would let two
requests generate the same Student ID / Assignment ID / etc. at the same
moment. threads > 1 is safe (they share the same GLOBAL_LOCK); more
*processes* is not, unless you first swap that lock for a distributed one
(e.g. Redis) — see the caveat in services/ids.py's next_counter_value().

This is the same trade-off the original Apps Script project made with
LockService.getScriptLock() (also a single-process lock) and is more than
enough headroom for this project's expected traffic.
==============================================================================
"""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', 5000)}"
workers = 1
threads = 4
timeout = 120
