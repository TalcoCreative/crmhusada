// Send WhatsApp message via Fonnte and store as OUTBOUND message
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

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, PUBLISHABLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const { conversation_id, content, target, is_test } = body as {
      conversation_id?: string; content: string; target?: string; is_test?: boolean;
    };

    if (!content) return json({ error: "content required" }, 400);

    // Read Fonnte settings
    const { data: settings } = await admin
      .from("system_settings")
      .select("key,value")
      .in("key", ["fonnte_api_key", "fonnte_device"]);
    const api_key = settings?.find((s) => s.key === "fonnte_api_key")?.value;
    if (!api_key) return json({ error: "Fonnte API key not configured. Setup in Settings → Fonnte." }, 400);

    let toNumber = target;
    let convId = conversation_id;

    if (!is_test) {
      if (!convId) return json({ error: "conversation_id required" }, 400);
      const { data: conv } = await admin
        .from("conversations")
        .select("id, contact:contacts(whatsapp_number)")
        .eq("id", convId)
        .single();
      if (!conv) return json({ error: "Conversation not found" }, 404);
      // @ts-ignore
      toNumber = conv.contact?.whatsapp_number;
    }

    if (!toNumber) return json({ error: "target number required" }, 400);

    // Send via Fonnte
    const fd = new FormData();
    fd.append("target", toNumber);
    fd.append("message", content);
    const fres = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: api_key },
      body: fd,
    });
    const fdata = await fres.json().catch(() => ({}));

    if (!fres.ok || fdata.status === false) {
      return json({ ok: false, fonnte: fdata, status: fres.status }, 502);
    }

    if (is_test) return json({ ok: true, fonnte: fdata });

    // Persist outbound message + compute response_seconds vs last inbound
    const fonnteId = Array.isArray(fdata.id) ? String(fdata.id[0]) : (fdata.id ? String(fdata.id) : null);

    const { data: lastIn } = await admin
      .from("messages")
      .select("sent_at")
      .eq("conversation_id", convId)
      .eq("direction", "INBOUND")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const respSec = lastIn?.sent_at
      ? Math.max(0, Math.floor((Date.now() - new Date(lastIn.sent_at).getTime()) / 1000))
      : null;

    const { data: msg, error: insErr } = await admin
      .from("messages")
      .insert({
        conversation_id: convId, direction: "OUTBOUND", type: "TEXT",
        content, sent_by_id: user.id, fonnte_message_id: fonnteId,
        status: "SENT", response_seconds: respSec,
      })
      .select()
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    const { data: conv2 } = await admin.from("conversations").select("first_response_at").eq("id", convId).maybeSingle();
    const convPatch: any = {
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 100),
      last_replied_by_id: user.id,
    };
    if (!conv2?.first_response_at) convPatch.first_response_at = new Date().toISOString();
    await admin.from("conversations").update(convPatch).eq("id", convId);

    return json({ ok: true, message: msg, fonnte: fdata });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(d: any, s = 200) {
    return new Response(JSON.stringify(d), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
