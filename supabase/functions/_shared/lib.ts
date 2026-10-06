import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey"
};
export const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
export async function userFrom(req: Request) {
  const c = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data } = await c.auth.getUser(); return data.user;
}

// Wrap every browser-facing function: handles CORS preflight and turns crashes into JSON errors
// (an uncaught crash would otherwise return a 500 with NO CORS headers, which the browser reports as a network error).
export const safe = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try { return await fn(req); }
  catch (e) { console.error("FUNCTION ERROR:", e); return json({ error: "Something went wrong on our side. Please try again.", detail: e instanceof Error ? e.message : String(e) }, 500); }
};