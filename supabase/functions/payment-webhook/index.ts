// Final step: validate form + passport, assign Student ID, mark 'submitted'.
import { admin, json, safe, userFrom } from "../_shared/lib.ts";
Deno.serve(safe(async (req) => {
  const user = await userFrom(req); if (!user) return json({ error: "Please sign in again." }, 401);
  const { applicationId, form, passportPath } = await req.json();
  const e: Record<string, string> = {};
  if (!form?.surname?.trim()) e.surname = "Enter your surname.";
  if (!form?.firstName?.trim()) e.firstName = "Enter your first name.";
  if (!/^(\+234|0)[789][01]\d{8}$/.test((form?.phone ?? "").replace(/\s/g, ""))) e.phone = "Enter a valid Nigerian phone number.";
  if (!form?.dob) e.dob = "Enter your date of birth.";
  if (!form?.gender) e.gender = "Select your gender.";
  if (!form?.address?.trim()) e.address = "Enter your address.";
  if (!form?.state) e.state = "Select your state.";
  if (!passportPath) e.passport = "Upload your passport photograph.";
  if (Object.keys(e).length) return json({ errors: e }, 422);
  const db = admin();
  const { data: app } = await db.from("applications").select("*").eq("id", applicationId).eq("user_id", user.id).single();
  if (!app) return json({ error: "Application not found." }, 404);
  if (app.status === "submitted") return json({ studentId: app.student_id }); // idempotent
  if (app.status !== "paid") return json({ error: "Payment has not been confirmed yet." }, 402);
  if (!passportPath.startsWith(`${user.id}/${app.id}/`)) return json({ error: "Invalid passport file." }, 400);
  const { data: id } = await db.rpc("next_student_id", { p_intake: app.intake_id });
  await db.from("applications").update({ status: "submitted", form_data: form, passport_path: passportPath, student_id: id, submitted_at: new Date().toISOString() }).eq("id", app.id);
  return json({ studentId: id });
}));
