// Outbox -> Google Sheets (one-way mirror).
// Normal run:  POST/GET  /functions/v1/sheet-sync
// Self-test:   GET       /functions/v1/sheet-sync?check=<SHEET_WEBHOOK_SECRET>   (step-by-step checklist with fixes)
import { admin, cors, json } from "../_shared/lib.ts";
const T = (ms = 15000) => AbortSignal.timeout(ms);
const HEAD = ["ApplicationID","StudentID","Name","Phone","Intake","Courses","Total","Status","Created","Paid","Submitted","PaymentClaimed","Payment Review"];
const b64u = (s: ArrayBuffer | string) => btoa(typeof s === "string" ? s : String.fromCharCode(...new Uint8Array(s))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const API = "https://sheets.googleapis.com/v4/spreadsheets";
function parseSA() { try { return JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!); } catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Re-set it with the complete contents of the downloaded key file."); } }
async function token() {
  const sa = parseSA(), now = Math.floor(Date.now() / 1000), head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = String(sa.private_key).replace(/\\n/g, "").replace(/-----[^-]+-----|\s/g, "");
  const k = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(`${head}.${body}`)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", signal: T(), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${body}.${sig}` });
  const j = await r.json(); if (!j.access_token) throw new Error("Google rejected the service account key: " + (j.error_description ?? j.error ?? r.status));
  return j.access_token as string;
}
async function meta(H: any, SID: string) {
  const r = await fetch(`${API}/${SID}?fields=properties.title,sheets.properties.title`, { headers: H, signal: T() }); const j = await r.json();
  if (!r.ok) { const sa = parseSA(); const m = j.error?.message ?? ""; throw new Error(r.status === 404 ? "SHEET_ID is wrong: Google cannot find that spreadsheet. Use the long id from the sheet's address (between /d/ and /edit)."
    : /not been used|disabled/i.test(m) ? "The Google Sheets API is not enabled. In Google Cloud Console enable 'Google Sheets API' for the service account's project."
    : `Google refused access (${r.status}). Share the Google Sheet with ${sa.client_email} as Editor. ${m}`); }
  return j;
}
async function ensureTab(H: any, SID: string, TAB: string) { // create the tab + headers if missing
  const m = await meta(H, SID); if ((m.sheets ?? []).some((s: any) => s.properties.title === TAB)) return false;
  const r = await fetch(`${API}/${SID}:batchUpdate`, { method: "POST", headers: H, signal: T(), body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }) });
  if (!r.ok) throw new Error("Could not create the '" + TAB + "' tab: " + (await r.text()).slice(0, 200));
  await fetch(`${API}/${SID}/values/${encodeURIComponent(TAB)}!A1:M1?valueInputOption=RAW`, { method: "PUT", headers: H, signal: T(), body: JSON.stringify({ values: [HEAD] }) });
  return true;
}
async function diagnose(db: any) {
  const steps: any[] = [], add = (step: string, ok: boolean, detail = "") => steps.push({ step, ok, detail });
  const SID = Deno.env.get("SHEET_ID"), TAB = Deno.env.get("SHEET_TAB") ?? "Applications";
  add("Secret SHEET_ID is set", !!SID); add("Secret GOOGLE_SERVICE_ACCOUNT_JSON is set", !!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (SID && Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")) {
    try { const sa = parseSA(); add("Service account key parses", true, "client_email: " + sa.client_email + "  <- the Google Sheet must be shared with this address as Editor");
      const H = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }; add("Google accepts the key", true);
      const m = await meta(H, SID); add("Spreadsheet reachable", true, "title: " + m.properties?.title);
      add(`Tab '${TAB}' exists`, (m.sheets ?? []).some((s: any) => s.properties.title === TAB), (m.sheets ?? []).map((s: any) => s.properties.title).join(", ") + " (it is created automatically on the next sync if missing)");
    } catch (e) { add("Google step failed", false, e instanceof Error ? e.message : String(e)); }
  }
  const p = await db.from("sheet_outbox").select("id,application_id,attempts,last_error,created_at").eq("done", false).order("id", { ascending: false }).limit(5);
  add("Jobs waiting in sheet_outbox", true, String(p.data?.length ?? 0) + " (latest 5 shown below)");
  return { all_ok: steps.every((s) => s.ok), steps, pending_jobs: p.data };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin(), url = new URL(req.url);
  if (url.searchParams.get("check")) { return url.searchParams.get("check") === Deno.env.get("SHEET_WEBHOOK_SECRET") ? json(await diagnose(db)) : json({ error: "Unauthorized" }, 401); }
  let jobs: any[] = [];
  try {
    const r = await db.from("sheet_outbox").select("*").eq("done", false).lt("attempts", 5).order("id").limit(25); jobs = r.data ?? [];
    if (!jobs.length) return json({ synced: 0, note: "nothing pending" });
    const SID = Deno.env.get("SHEET_ID"), TAB = Deno.env.get("SHEET_TAB") ?? "Applications";
    if (!SID) throw new Error("Missing secret SHEET_ID"); if (!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")) throw new Error("Missing secret GOOGLE_SERVICE_ACCOUNT_JSON");
    const H = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, base = `${API}/${SID}/values/${encodeURIComponent(TAB)}`;
    await ensureTab(H, SID, TAB);
    const readIds = async () => { const res = await fetch(`${base}!A:A`, { headers: H, signal: T() }); const j = await res.json();
      if (!res.ok) throw new Error(`Sheets read failed (${res.status}): ${j.error?.message ?? ""}`); return (j.values ?? []).map((v: string[]) => v[0]); };
    let ids: string[] = await readIds(), ok = 0, failed = 0;
    for (const j of jobs) {
      try {
        const { data: a } = await db.from("applications").select("*, intakes(label), application_courses(course_code), profiles(full_name,phone)").eq("id", j.application_id).single();
        const f = a.form_data ?? {};
        const row = [a.id, a.student_id ?? "", f.surname ? `${f.surname} ${f.firstName}`.trim() : a.profiles?.full_name ?? "", f.phone ?? a.profiles?.phone ?? "", a.intakes?.label,
          (a.package_code ? "[FULL PACKAGE] " : "") + a.application_courses.map((c: any) => c.course_code).join(", "), a.total_ngn, a.status, a.created_at, a.paid_at ?? "", a.submitted_at ?? "", a.payment_claimed_at ?? "", cap(a.payment_review)];
        let i = ids.indexOf(a.id); if (i < 0) { ids = await readIds(); i = ids.indexOf(a.id); } // re-read just before appending: no duplicate rows
        const u = i >= 0 ? `${base}!A${i + 1}?valueInputOption=USER_ENTERED` : `${base}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const res = await fetch(u, { method: i >= 0 ? "PUT" : "POST", headers: H, signal: T(), body: JSON.stringify({ values: [row] }) });
        if (!res.ok) throw new Error(`Sheets write failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
        if (i < 0) ids.push(a.id);
        await db.from("sheet_outbox").update({ done: true, last_error: null }).eq("id", j.id); ok++;
      } catch (err) { failed++; await db.from("sheet_outbox").update({ attempts: j.attempts + 1, last_error: String(err).slice(0, 500) }).eq("id", j.id); }
    }
    return json({ synced: ok, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e); console.error("SHEET-SYNC ERROR:", msg);
    if (jobs.length) await db.from("sheet_outbox").update({ last_error: msg.slice(0, 500) }).in("id", jobs.map((j) => j.id));
    return json({ error: msg }, 500);
  }
});
