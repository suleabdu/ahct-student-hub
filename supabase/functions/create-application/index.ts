// "Proceed to payment": locks the price server-side (per-course or Full Package), creates the application and a payment account.
import { admin, json, safe, userFrom } from "../_shared/lib.ts";
const MB = Deno.env.get("MONNIFY_BASE_URL") ?? "https://sandbox.monnify.com";
async function monnifyToken() {
  const r = await fetch(`${MB}/api/v1/auth/login`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${Deno.env.get("MONNIFY_API_KEY")}:${Deno.env.get("MONNIFY_SECRET_KEY")}`) } });
  const j = await r.json();
  if (!j.requestSuccessful || !j.responseBody?.accessToken) throw new Error("Monnify login failed: " + (j.responseMessage ?? r.status) + " (check MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_BASE_URL)");
  return j.responseBody.accessToken as string;
}
Deno.serve(safe(async (req) => {
  const user = await userFrom(req); if (!user) return json({ error: "Please sign in again." }, 401);
  const { intakeId, courseCodes, packageCode } = await req.json();
  if (!intakeId || !Array.isArray(courseCodes) || !courseCodes.length) return json({ error: "Choose an intake and at least one course." }, 400);
  const db = admin();
  const { data: ex } = await db.from("applications").select("*").eq("user_id", user.id).eq("intake_id", intakeId).not("status", "in", "(expired,rejected)").maybeSingle();
  if (ex) return json({ application: ex }); // resume instead of duplicating
  const { data: intake } = await db.from("intakes").select("*").eq("id", intakeId).single();
  const now = Date.now();
  if (!intake?.is_active || (intake.opens_at && now < +new Date(intake.opens_at)) || (intake.closes_at && now > +new Date(intake.closes_at))) return json({ error: "This intake is closed." }, 400);
  const { data: courses } = await db.from("courses").select("*").in("code", courseCodes).eq("is_active", true);
  if (!courses || courses.length !== courseCodes.length) return json({ error: "A selected course is unavailable." }, 400);
  let total = courses.reduce((s, c) => s + c.fee_ngn, 0), pkg: any = null;
  if (packageCode) {
    const { data: p } = await db.from("packages").select("*").eq("code", packageCode).eq("is_active", true).maybeSingle();
    if (!p) return json({ error: "This package is unavailable." }, 400);
    if (p.max_courses && courseCodes.length > p.max_courses) return json({ error: `The package allows up to ${p.max_courses} courses.` }, 400);
    pkg = p; total = p.fee_ngn;
  }
  const ref = "AHCT-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  let bank = "", account = "";
  if ((Deno.env.get("PAY_MODE") ?? "monnify") === "manual") { // fallback: one static account, confirmed by staff
    bank = `${Deno.env.get("BANK_NAME") ?? ""} - ${Deno.env.get("BANK_ACCOUNT_NAME") ?? ""}`; account = Deno.env.get("BANK_ACCOUNT_NUMBER") ?? "";
  } else {
    const { data: prof } = await db.from("profiles").select("full_name").eq("id", user.id).single();
    const m = await fetch(`${MB}/api/v2/bank-transfer/reserved-accounts`, { method: "POST",
      headers: { Authorization: "Bearer " + await monnifyToken(), "Content-Type": "application/json" },
      body: JSON.stringify({ accountReference: ref, accountName: "AH Consult - " + (prof?.full_name ?? "Applicant"), currencyCode: "NGN",
        contractCode: Deno.env.get("MONNIFY_CONTRACT_CODE"), customerEmail: user.email, customerName: prof?.full_name ?? user.email, getAllAvailableBanks: false, preferredBanks: ["035"] }) });
    const mj = await m.json(); const acct = mj.responseBody?.accounts?.[0];
    if (!acct) { console.error("MONNIFY RESERVED ACCOUNT FAILED:", JSON.stringify(mj)); return json({ error: "Payment account could not be created. Please try again shortly.", detail: mj.responseMessage }, 502); }
    bank = acct.bankName; account = acct.accountNumber;
  }
  const { data: app, error } = await db.from("applications").insert({ user_id: user.id, intake_id: intakeId, total_ngn: total, package_code: pkg?.code ?? null,
    pay_reference: ref, pay_bank: bank, pay_account: account }).select().single();
  if (error) { console.error("INSERT APPLICATION FAILED:", JSON.stringify(error)); return json({ error: "Could not start your application. Please try again.", detail: error.message }, 500); }
  await db.from("application_courses").insert(courses.map((c) => ({ application_id: app.id, course_code: c.code, fee_ngn: pkg ? 0 : c.fee_ngn })));
  return json({ application: app });
}));
