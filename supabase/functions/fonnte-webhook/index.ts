// Public webhook receiver for Fonnte incoming messages.
// Configure in Fonnte dashboard → Device → URL Webhook
// Payload (form-encoded or JSON) includes: device, sender, message, name, etc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function normalizePhone(p: string): string {
  let n = String(p || "").replace(/[^\d]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  if (!n.startsWith("62")) n = "62" + n;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response("Fonnte webhook ready", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    let payload: Record<string, any> = {};
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      payload = await req.json();
    } else {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) payload[k] = typeof v === "string" ? v : "";
    }

    console.log("[fonnte-webhook] payload:", JSON.stringify(payload));

    const sender = payload.sender || payload.from || payload.number;
    const message = payload.message || payload.text || payload.body || "";
    const name = payload.name || null;
    const fonnteMsgId = payload.id || payload.message_id || null;

    if (!sender) return json({ ok: false, error: "no sender" }, 400);
    // Skip messages from ourselves (fromMe)
    if (payload.fromMe === true || payload.fromMe === "true") return json({ ok: true, skip: "fromMe" });

    const phone = normalizePhone(sender);

    // Find or create contact
    let { data: contact } = await admin
      .from("contacts")
      .select("*")
      .eq("whatsapp_number", phone)
      .maybeSingle();

    if (!contact) {
      const { data: defaultStage } = await admin
        .from("stages")
        .select("id")
        .eq("is_default", true)
        .maybeSingle();
      const { data: newC } = await admin
        .from("contacts")
        .insert({
          whatsapp_number: phone,
          full_name: name,
          stage_id: defaultStage?.id || null,
          source: "whatsapp",
          last_interaction_at: new Date().toISOString(),
          total_messages: 0,
        })
        .select()
        .single();
      contact = newC!;
    }

    // Find or create OPEN conversation
    let { data: conv } = await admin
      .from("conversations")
      .select("*")
      .eq("contact_id", contact.id)
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await admin
        .from("conversations")
        .insert({ contact_id: contact.id, status: "OPEN" })
        .select()
        .single();
      conv = newConv!;
    }

    // Insert inbound message (dedupe via fonnte_message_id when present)
    const insert: any = {
      conversation_id: conv.id,
      direction: "INBOUND",
      type: "TEXT",
      content: message,
      status: "DELIVERED",
    };
    if (fonnteMsgId) insert.fonnte_message_id = `in_${fonnteMsgId}`;

    const { error: msgErr } = await admin.from("messages").insert(insert);
    if (msgErr && !msgErr.message.includes("duplicate")) {
      console.error("msg insert err", msgErr);
    }

    await admin.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: message.slice(0, 100),
      unread_count: (conv.unread_count || 0) + 1,
    }).eq("id", conv.id);

    await admin.from("contacts").update({
      last_interaction_at: new Date().toISOString(),
      total_messages: (contact.total_messages || 0) + 1,
    }).eq("id", contact.id);

    // Chatbot onboarding
    const { data: cbEnabled } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "chatbot_enabled")
      .maybeSingle();

    if (cbEnabled?.value === "true" && contact.chatbot_state !== "done") {
      await runChatbot(admin, contact, message);
    }

    return json({ ok: true, contact_id: contact.id, conversation_id: conv.id });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }

  function json(d: any, s = 200) {
    return new Response(JSON.stringify(d), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runChatbot(admin: any, contact: any, message: string) {
  const state = contact.chatbot_state;
  const data = contact.chatbot_data || {};
  let reply = "";
  let nextState = state;
  const updates: any = {};

  if (!state) {
    const { data: products } = await admin.from("products").select("name").eq("is_active", true);
    const list = (products || []).map((p: any, i: number) => `${i + 1}. ${p.name}`).join("\n");
    reply = `Halo! 👋 Selamat datang di Husada Care.\n\nProduk/layanan kami:\n${list}\n\nApa yang ingin Anda tanyakan atau keluhkan?`;
    nextState = "ask_product";
  } else if (state === "ask_product") {
    data.complaint = message;
    reply = `Terima kasih. Boleh tahu nama lengkap Anda?`;
    nextState = "ask_name";
  } else if (state === "ask_name") {
    const lower = message.toLowerCase().trim();
    if (!["halo", "hai", "hi", "ya", "iya"].includes(lower)) {
      updates.full_name = message.trim();
    }
    reply = `Senang berkenalan! 😊 Domisili Anda di mana?`;
    nextState = "ask_domicile";
  } else if (state === "ask_domicile") {
    updates.domicile = message.trim();
    updates.chief_complaint = data.complaint || null;
    reply = `Terima kasih atas info-nya. Tim Husada Care akan segera menghubungi Anda. 🙏`;
    nextState = "done";
  }

  updates.chatbot_state = nextState;
  updates.chatbot_data = data;
  await admin.from("contacts").update(updates).eq("id", contact.id);

  // Send reply via Fonnte
  if (reply) {
    const { data: settings } = await admin
      .from("system_settings")
      .select("key,value")
      .eq("key", "fonnte_api_key")
      .maybeSingle();
    const api_key = settings?.value;
    if (api_key) {
      const fd = new FormData();
      fd.append("target", contact.whatsapp_number);
      fd.append("message", reply);
      try {
        const fres = await fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: { Authorization: api_key },
          body: fd,
        });
        const fdata = await fres.json().catch(() => ({}));
        const fonnteId = Array.isArray(fdata.id) ? String(fdata.id[0]) : (fdata.id ? String(fdata.id) : null);

        const { data: conv } = await admin
          .from("conversations")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("status", "OPEN")
          .order("created_at", { ascending: false })
          .maybeSingle();
        if (conv) {
          await admin.from("messages").insert({
            conversation_id: conv.id,
            direction: "OUTBOUND",
            type: "TEXT",
            content: reply,
            status: "SENT",
            fonnte_message_id: fonnteId,
          });
          await admin.from("conversations").update({
            last_message_at: new Date().toISOString(),
            last_message_preview: reply.slice(0, 100),
          }).eq("id", conv.id);
        }
      } catch (e) {
        console.error("chatbot send fail", e);
      }
    }
  }
}
