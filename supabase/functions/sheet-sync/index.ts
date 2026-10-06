// Outbox -> Google Sheets (one-way mirror). Tab "Applications"; column A holds the application id.
import { admin } from "../_shared/lib.ts";
const b64u = (s: ArrayBuffer | string) => btoa(typeof s === "string" ? s : String.fromCharCode(...new Uint8Array(s))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token() {
  const sa = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!), now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----|\s/g, "");
  const k = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(`${head}.${body}`)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${body}.${sig}` });
  return (await r.json()).access_token as string;
}
Deno.serve(async () => {
  const db = admin(), SID = Deno.env.get("SHEET_ID")!;
  const { data: jobs } = await db.from("sheet_outbox").select("*").eq("done", false).lt("attempts", 5).order("id").limit(25);
  if (!jobs?.length) return new Response("nothing");
  const H = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" };
  const col = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/Applications!A:A`, { headers: H })).json();
  const ids: string[] = (col.values ?? []).map((v: string[]) => v[0]);
  for (const j of jobs) {
    try {
      const { data: a } = await db.from("applications").select("*, intakes(label), application_courses(course_code), profiles(full_name,phone)").eq("id", j.application_id).single();
      const f = a.form_data ?? {};
      const row = [a.id, a.student_id ?? "", f.surname ? `${f.surname} ${f.firstName}`.trim() : a.profiles?.full_name ?? "", f.phone ?? a.profiles?.phone ?? "",
        a.intakes?.label, a.application_courses.map((c: any) => c.course_code).join(", "), a.total_ngn, a.status, a.created_at, a.paid_at ?? "", a.submitted_at ?? ""];
      const i = ids.indexOf(a.id);
      const url = i >= 0 ? `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/Applications!A${i + 1}?valueInputOption=USER_ENTERED`
        : `https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/Applications!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const r = await fetch(url, { method: i >= 0 ? "PUT" : "POST", headers: H, body: JSON.stringify({ values: [row] }) });
      if (!r.ok) throw new Error(await r.text());
      if (i < 0) ids.push(a.id);
      await db.from("sheet_outbox").update({ done: true }).eq("id", j.id);
    } catch (err) { await db.from("sheet_outbox").update({ attempts: j.attempts + 1, last_error: String(err).slice(0, 500) }).eq("id", j.id); }
  }
  return new Response("synced");
});
