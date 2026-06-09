// Test Fonnte API key validity by calling /validate
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { api_key } = await req.json();
    if (!api_key) {
      return new Response(JSON.stringify({ ok: false, error: "api_key required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Fonnte: GET https://api.fonnte.com/validate with header Authorization: <token>
    const res = await fetch("https://api.fonnte.com/validate", {
      method: "GET",
      headers: { Authorization: api_key },
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return new Response(JSON.stringify({ ok: res.ok && data?.status !== false, status: res.status, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
