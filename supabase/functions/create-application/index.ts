// "Apply now": locks price server-side, creates application + Monnify reserved account.
import { admin, cors, json, userFrom } from "../_shared/lib.ts";
const MB = Deno.env.get("MONNIFY_BASE_URL") ?? "https://sandbox.monnify.com";
async function monnifyToken() {
  const r = await fetch(`${MB}/api/v1/auth/login`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${Deno.env.get("MONNIFY_API_KEY")}:${Deno.env.get("MONNIFY_SECRET_KEY")}`) } });
  return (await r.json()).responseBody.accessToken as string;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await userFrom(req); if (!user) return json({ error: "Please sign in again." }, 401);
  const { intakeId, courseCodes, key } = await req.json();
  if (!intakeId || !Array.isArray(courseCodes) || !courseCodes.length) return json({ error: "Choose an intake and at least one course." }, 400);
  const db = admin();
  const { data: ex } = await db.from("applications").select("*").eq("user_id", user.id).eq("intake_id", intakeId).not("status", "in", "(expired,rejected)").maybeSingle();
  if (ex) return json({ application: ex }); // idempotent: resume instead of duplicating
  const { data: intake } = await db.from("intakes").select("*").eq("id", intakeId).single();
  const now = Date.now();
  if (!intake?.is_active || (intake.opens_at && now < +new Date(intake.opens_at)) || (intake.closes_at && now > +new Date(intake.closes_at))) return json({ error: "This intake is closed." }, 400);
  const { data: courses } = await db.from("courses").select("*").in("code", courseCodes).eq("is_active", true);
  if (!courses || courses.length !== courseCodes.length) return json({ error: "A selected course is unavailable." }, 400);
  const total = courses.reduce((s, c) => s + c.fee_ngn, 0);
  const ref = "AHCT-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  const { data: prof } = await db.from("profiles").select("full_name").eq("id", user.id).single();
  const m = await fetch(`${MB}/api/v2/bank-transfer/reserved-accounts`, { method: "POST",
    headers: { Authorization: "Bearer " + await monnifyToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ accountReference: ref, accountName: "AH Consult - " + (prof?.full_name ?? "Applicant"), currencyCode: "NGN",
      contractCode: Deno.env.get("MONNIFY_CONTRACT_CODE"), customerEmail: user.email, customerName: prof?.full_name ?? user.email, getAllAvailableBanks: false, preferredBanks: ["035"] }) });
  const acct = (await m.json()).responseBody?.accounts?.[0];
  if (!acct) return json({ error: "Payment account could not be created. Try again in a minute." }, 502);
  const { data: app, error } = await db.from("applications").insert({ user_id: user.id, intake_id: intakeId, total_ngn: total, idempotency_key: key ?? null,
    pay_reference: ref, pay_bank: acct.bankName, pay_account: acct.accountNumber }).select().single();
  if (error) return json({ error: "Could not start application." }, 500);
  await db.from("application_courses").insert(courses.map((c) => ({ application_id: app.id, course_code: c.code, fee_ngn: c.fee_ngn })));
  return json({ application: app });
});
