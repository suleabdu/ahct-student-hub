// Called by the Google Sheet (Apps Script) when staff change the "Payment Review" dropdown.
import { admin, json, safe } from "../_shared/lib.ts";
Deno.serve(safe(async (req) => {
  if (req.headers.get("x-sheet-secret") !== Deno.env.get("SHEET_WEBHOOK_SECRET")) return json({ error: "Unauthorized" }, 401);
  const { applicationId, staffId, kind, decision, by } = await req.json();
  console.log("sheet-review called:", applicationId, decision, by);
  if (applicationId === "TEST") return json({ message: "Connection and secret are OK." });
  if (!["pending", "approved", "rejected"].includes(decision)) return json({ error: "Use Pending, Approved or Rejected." }, 400);
  const db = admin();
  if (kind === "admin") { // staff approval from the "Admin Registrations" tab
    if (!["pending", "approved", "rejected"].includes(decision)) return json({ error: "Use Pending, Approved or Rejected." }, 400);
    const { data: st } = await db.from("staff").select("id,full_name").eq("id", staffId).maybeSingle();
    if (!st) return json({ error: "Staff record not found." }, 404);
    await db.from("staff").update({ status: decision }).eq("id", staffId);
    await db.from("audit_log").insert({ actor_name: by ?? "sheet", action: "staff_" + decision, target: st.full_name });
    return json({ message: `${st.full_name} is now ${decision}.` + (decision === "approved" ? " They can sign in to the dashboard." : "") });
  }
  const { data: app } = await db.from("applications").select("*").eq("id", applicationId).maybeSingle();
  if (!app) return json({ error: "Application not found." }, 404);
  if (app.status !== "pending_payment") return json({ error: `This application is already '${app.status}'. Payment review is closed.` }, 409);
  if (decision === "approved") {
    await db.from("payments").upsert({ application_id: app.id, reference: "MANUAL-" + app.pay_reference, expected_ngn: app.total_ngn, paid_ngn: app.total_ngn, raw_event: { source: "sheet", by } }, { onConflict: "reference" });
    await db.from("applications").update({ status: "paid", paid_at: new Date().toISOString(), payment_review: "approved" }).eq("id", app.id);
    return json({ message: "Approved. The applicant's form is now unlocked." });
  }
  await db.from("applications").update({ payment_review: decision }).eq("id", app.id);
  return json({ message: decision === "rejected" ? "Rejected. The applicant will be asked to check and resubmit." : "Set back to pending." });
}));
