// Outbox -> Google Sheets (one-way mirror). Hardened: timeouts on every call, clear errors saved to sheet_outbox.last_error.
import { admin, cors, json } from "../_shared/lib.ts";
const T = (ms = 15000) => AbortSignal.timeout(ms);
const b64u = (s: ArrayBuffer | string) => btoa(typeof s === "string" ? s : String.fromCharCode(...new Uint8Array(s))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
async function token() {
  let sa: any; try { sa = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!); } catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON"); }
  const now = Math.floor(Date.now() / 1000), head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = String(sa.private_key).replace(/\\n/g, "").replace(/-----[^-]+-----|\s/g, "");
  const k = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(`${head}.${body}`)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", signal: T(), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${body}.${sig}` });
  const j = await r.json(); if (!j.access_token) throw new Error("Google auth failed: " + (j.error_description ?? j.error ?? r.status));
  return j.access_token as string;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin(); let jobs: any[] = [];
  try {
    const r = await db.from("sheet_outbox").select("*").eq("done", false).lt("attempts", 5).order("id").limit(25); jobs = r.data ?? [];
    if (!jobs.length) return json({ synced: 0, note: "nothing pending" });
    const SID = Deno.env.get("SHEET_ID"), TAB = Deno.env.get("SHEET_TAB") ?? "Applications";
    if (!SID) throw new Error("Missing secret SHEET_ID"); if (!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")) throw new Error("Missing secret GOOGLE_SERVICE_ACCOUNT_JSON");
    const H = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, base = `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(TAB)}`;
    const readIds = async () => { const res = await fetch(`${base}!A:A`, { headers: H, signal: T() }); const j = await res.json();
      if (!res.ok) throw new Error(`Sheets read failed (${res.status}): ${j.error?.message ?? ""} - check the tab is named "${TAB}", the Sheets API is enabled and the sheet is shared with the service account`);
      return (j.values ?? []).map((v: string[]) => v[0]); };
    let ids: string[] = await readIds(), ok = 0, failed = 0;
    for (const j of jobs) {
      try {
        const { data: a } = await db.from("applications").select("*, intakes(label), application_courses(course_code), profiles(full_name,phone)").eq("id", j.application_id).single();
        const f = a.form_data ?? {};
        const row = [a.id, a.student_id ?? "", f.surname ? `${f.surname} ${f.firstName}`.trim() : a.profiles?.full_name ?? "", f.phone ?? a.profiles?.phone ?? "", a.intakes?.label,
          (a.package_code ? "[FULL PACKAGE] " : "") + a.application_courses.map((c: any) => c.course_code).join(", "), a.total_ngn, a.status, a.created_at, a.paid_at ?? "", a.submitted_at ?? "", a.payment_claimed_at ?? "", cap(a.payment_review)];
        let i = ids.indexOf(a.id); if (i < 0) { ids = await readIds(); i = ids.indexOf(a.id); } // re-read just before appending to avoid duplicate rows
        const url = i >= 0 ? `${base}!A${i + 1}?valueInputOption=USER_ENTERED` : `${base}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const res = await fetch(url, { method: i >= 0 ? "PUT" : "POST", headers: H, signal: T(), body: JSON.stringify({ values: [row] }) });
        if (!res.ok) throw new Error(`Sheets write failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
        if (i < 0) ids.push(a.id);
        await db.from("sheet_outbox").update({ done: true, last_error: null }).eq("id", j.id); ok++;
      } catch (err) { failed++; await db.from("sheet_outbox").update({ attempts: j.attempts + 1, last_error: String(err).slice(0, 500) }).eq("id", j.id); }
    }
    return json({ synced: ok, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e); console.error("SHEET-SYNC ERROR:", msg);
    if (jobs.length) await db.from("sheet_outbox").update({ last_error: msg.slice(0, 500) }).in("id", jobs.map((j) => j.id)); // config problems do not burn retry attempts
    return json({ error: msg }, 500);
  }
});
