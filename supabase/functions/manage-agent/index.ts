// Admin-only: create or delete agent users (auto-confirmed, no email verification)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const j = (d: any, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PUBLISHABLE = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return j({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, PUBLISHABLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) return j({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: u.user.id });
    if (!isAdmin) return j({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const full_name = String(body.full_name || "").trim();
      const position = String(body.position || "").trim();
      const role = String(body.role || "agent");
      if (!email || !password || password.length < 6) return j({ error: "Email & password (min 6) wajib" }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name },
      });
      if (cErr || !created.user) return j({ error: cErr?.message || "Gagal membuat user" }, 400);

      const uid = created.user.id;
      await admin.from("profiles").upsert({ id: uid, email, full_name, position }, { onConflict: "id" });

      // Handle role: replace default 'agent' role if a different one was requested
      if (role && role !== "agent") {
        await admin.from("user_roles").delete().eq("user_id", uid);
        await admin.from("user_roles").insert({ user_id: uid, role });
      }

      await admin.from("activity_logs").insert({
        user_id: u.user.id, action: "create_agent", entity_type: "profile", entity_id: uid,
        metadata: { email, full_name, position, role },
      });
      return j({ ok: true, id: uid });
    }

    if (action === "delete") {
      const target = String(body.user_id || "");
      if (!target) return j({ error: "user_id wajib" }, 400);
      if (target === u.user.id) return j({ error: "Tidak bisa hapus akun sendiri" }, 400);
      const { data: prof } = await admin.from("profiles").select("email,full_name").eq("id", target).maybeSingle();
      const { error: dErr } = await admin.auth.admin.deleteUser(target);
      if (dErr) return j({ error: dErr.message }, 400);
      await admin.from("activity_logs").insert({
        user_id: u.user.id, action: "delete_agent", entity_type: "profile", entity_id: target,
        metadata: { email: prof?.email, full_name: prof?.full_name },
      });
      return j({ ok: true });
    }

    if (action === "update") {
      const target = String(body.user_id || "");
      if (!target) return j({ error: "user_id wajib" }, 400);
      const patch: Record<string, any> = {};
      if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
      if (typeof body.position === "string") patch.position = body.position.trim();
      if (Object.keys(patch).length) await admin.from("profiles").update(patch).eq("id", target);
      if (typeof body.role === "string" && body.role) {
        await admin.from("user_roles").delete().eq("user_id", target);
        await admin.from("user_roles").insert({ user_id: target, role: body.role });
      }
      return j({ ok: true });
    }

    return j({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("manage-agent fatal", e);
    return j({ error: String(e) }, 500);
  }
});
