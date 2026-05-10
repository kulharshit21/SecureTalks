import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = (Deno.env.get("CLEANUP_EXPIRED_SECRET") ?? "").trim();

  if (!supabaseUrl || !anonKey || !serviceRole) return json({ error: "Supabase env missing." }, 500);

  const headerSecret = (req.headers.get("x-cleanup-secret") ?? "").trim();
  const cronOk = cronSecret.length > 0 && headerSecret === cronSecret;

  const authHeader = req.headers.get("Authorization") ?? "";
  let userOk = false;
  if (!cronOk && authHeader.length > 0) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    userOk = Boolean(user?.id);
  }

  if (!cronOk && !userOk) return json({ error: "Forbidden" }, 403);

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("cleanup_expired_messages");
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    rows_soft_deleted: typeof data === "number" ? data : null,
  });
});
