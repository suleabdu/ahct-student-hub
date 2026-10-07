// Staff self-registration. Only people who know the staff access code can register, and every account starts as 'pending'
// until someone approves it in the Google Sheet ("Admin Registrations" tab).
import { admin, json, safe } from "../_shared/lib.ts";
Deno.serve(safe(async (req) => {
  const { fullName, email, phone, position, password, inviteCode } = await req.json();
  const code = Deno.env.get("ADMIN_INVITE_CODE");
  if (!code) return json({ error: "Staff registration is not enabled yet." }, 503);
  if (String(inviteCode ?? "") !== code) { await new Promise((r) => setTimeout(r, 1000)); return json({ error: "That staff access code is not valid. Please ask AH Consult management for the current code." }, 403); }
  const name = String(fullName ?? "").trim(), mail = String(email ?? "").trim().toLowerCase();
  if (name.length < 3) return json({ error: "Enter your full name." }, 422);
  if (!/^\S+@\S+\.\S+$/.test(mail)) return json({ error: "Enter a valid email address." }, 422);
  if (String(password ?? "").length < 10) return json({ error: "Use a password of at least 10 characters." }, 422);
  const db = admin();
  const { data: created, error } = await db.auth.admin.createUser({ email: mail, password, email_confirm: true, user_metadata: { full_name: name, phone } });
  if (error) return json({ error: /already|registered/i.test(error.message) ? "This email is already registered. Use a different email or sign in." : "Could not create the account.", detail: error.message }, 400);
  const { error: e2 } = await db.from("staff").insert({ id: created.user.id, full_name: name, email: mail, phone: phone ?? null, position: position ?? null, status: "pending" });
  if (e2) { await db.auth.admin.deleteUser(created.user.id); console.error("staff insert failed", e2); return json({ error: "Could not save your registration. Please try again.", detail: e2.message }, 500); }
  const kick = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sheet-sync`, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` } }).catch(() => {});
  // @ts-ignore EdgeRuntime exists on Supabase Edge Functions
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(kick);
  return json({ ok: true });
}));
