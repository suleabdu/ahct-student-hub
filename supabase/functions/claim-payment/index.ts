// "I have paid, check now": flags the application as awaiting payment confirmation and pushes it to the Google Sheet.
import { admin, json, safe, userFrom } from "../_shared/lib.ts";
Deno.serve(safe(async (req) => {
  const user = await userFrom(req); if (!user) return json({ error: "Please sign in again." }, 401);
  const { applicationId } = await req.json();
  const db = admin();
  const { data: app } = await db.from("applications").select("*").eq("id", applicationId).eq("user_id", user.id).single();
  if (!app) return json({ error: "Application not found." }, 404);
  if (app.status !== "pending_payment") return json({ application: app });
  const recent = app.payment_claimed_at && app.payment_review === "pending" && Date.now() - +new Date(app.payment_claimed_at) < 30000;
  let out = app;
  if (!recent) {
    const { data } = await db.from("applications").update({ payment_claimed_at: new Date().toISOString(), payment_review: "pending" }).eq("id", app.id).select().single();
    out = data;
    try { await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sheet-sync`, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` } }); }
    catch (e) { console.error("sheet-sync kick failed (cron will retry):", e); }
  }
  return json({ application: out });
}));
