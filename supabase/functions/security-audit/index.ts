import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  if (!supabaseUrl || !anonKey || !serviceRole) return json({ error: "Supabase env missing." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.id) return json({ error: "Unauthorized" }, 401);

  let clientKeyPresent = false;
  try {
    const b = await req.json();
    clientKeyPresent = Boolean(b && typeof b === "object" && (b as Record<string, unknown>).clientKeyPresent === true);
  } catch {
    /* empty body allowed */
  }

  const { data: snapshot, error: snapErr } = await userClient.rpc("security_audit_snapshot");
  if (snapErr) return json({ error: snapErr.message }, 500);

  const { count: active_devices_for_user } = await userClient
    .from("devices")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: encBucket } = await admin
    .schema("storage")
    .from("buckets")
    .select("id, public")
    .eq("id", "encrypted-attachments")
    .maybeSingle();

  return json({
    snapshot,
    deployment_surface: "supabase_edge",
    active_devices_for_user: active_devices_for_user ?? 0,
    encrypted_attachments_bucket: encBucket ? { id: encBucket.id, public: encBucket.public } : null,
    client_key_present: clientKeyPresent,
    mistralSecretConfigured: Boolean(Deno.env.get("MISTRAL_API_KEY")?.trim()),
    publicEnvKeysCount: 0,
    publicEnvKeysSample: [] as string[],
  });
});
