// Save Fonnte settings (admin only). Used so api_key writes are gated by role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PUBLISHABLE = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return j({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, PUBLISHABLE, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u.user) return j({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: u.user.id });
  if (!isAdmin) return j({ error: "Forbidden" }, 403);

  const { api_key, device } = await req.json();
  if (typeof api_key === "string") {
    await admin.from("system_settings").upsert({ key: "fonnte_api_key", value: api_key, updated_by: u.user.id });
  }
  if (typeof device === "string") {
    await admin.from("system_settings").upsert({ key: "fonnte_device", value: device, updated_by: u.user.id });
  }
  return j({ ok: true });

  function j(d: any, s = 200) {
    return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
