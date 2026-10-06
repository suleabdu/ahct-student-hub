// Monnify calls this. Verifies signature + amount, then sets application to 'paid'.
import { admin } from "../_shared/lib.ts";
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
Deno.serve(async (req) => {
  const raw = await req.text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("MONNIFY_SECRET_KEY")!), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  if (hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw))) !== req.headers.get("monnify-signature")) return new Response("bad signature", { status: 401 });
  const ev = JSON.parse(raw); if (ev.eventType !== "SUCCESSFUL_TRANSACTION") return new Response("ignored");
  const d = ev.eventData, ref = d.product?.reference, paid = Number(d.amountPaid), db = admin();
  const { data: app } = await db.from("applications").select("id,total_ngn,status").eq("pay_reference", ref).maybeSingle();
  if (!app) return new Response("unknown reference");
  await db.from("payments").upsert({ application_id: app.id, reference: d.transactionReference, expected_ngn: app.total_ngn, paid_ngn: paid, raw_event: ev }, { onConflict: "reference" });
  if (app.status === "pending_payment" && paid + 1 >= app.total_ngn) await db.from("applications").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", app.id);
  return new Response("ok"); // duplicate webhooks are harmless (unique reference)
});
