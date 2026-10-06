/* =============================================================================
   js/config.js
   AH Student Hub — frontend configuration

   Set API_BASE_URL to your deployed Render backend's URL (no trailing
   slash), e.g. "https://ahct-student-hub-api.onrender.com". Left as
   "http://localhost:5000" for local development against `python wsgi.py`.
   See docs/SETUP_GUIDE.md, Step 6.
   ============================================================================= */

const API_BASE_URL = "https://ahct-student-hub.onrender.com";

// Fill these two values (Supabase > Project Settings > API). The anon key is safe to expose.
window.APPLY_CONFIG = {
  SUPABASE_URL: "https://xwieiqrnlvcjajdeinqc.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3aWVpcXJubHZjamFqZGVpbnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNjE1MzksImV4cCI6MjEwNjgzNzUzOX0.dCdmn69bi0oznIOmEWgXQrz_-HHNT2MYGxY8n8ydukI",
};
