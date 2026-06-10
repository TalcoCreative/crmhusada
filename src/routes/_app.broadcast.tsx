import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Send, Filter, Users as UsersIcon, Search } from "lucide-react";

export const Route = createFileRoute("/_app/broadcast")({
  head: () => ({ meta: [{ title: "Broadcast — Husada CRM" }] }),
  component: BroadcastPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ALL = "__ALL__";

type Contact = {
  id: string; full_name: string | null; whatsapp_number: string;
  stage_id: string | null; interested_product_id: string | null;
  assigned_agent_id: string | null;
};

function BroadcastPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string; color: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);

  const [productId, setProductId] = useState<string>(ALL);
  const [stageId, setStageId] = useState<string>(ALL);
  const [agentId, setAgentId] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }, { data: s }, { data: a }] = await Promise.all([
        supabase.from("contacts")
          .select("id, full_name, whatsapp_number, stage_id, interested_product_id, assigned_agent_id")
          .order("last_interaction_at", { ascending: false, nullsFirst: false })
          .limit(2000),
        supabase.from("products").select("id,name").eq("is_active", true).order("sort_order"),
        supabase.from("stages").select("id,name,color").order("order_index"),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
      ]);
      setContacts((c as Contact[]) || []);
      setProducts(p || []);
      setStages(s || []);
      setAgents(a || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (productId !== ALL && c.interested_product_id !== productId) return false;
      if (stageId !== ALL && c.stage_id !== stageId) return false;
      if (agentId !== ALL) {
        if (agentId === "__UNASSIGNED__" ? c.assigned_agent_id : c.assigned_agent_id !== agentId) return false;
      }
      if (q) {
        const hay = `${c.full_name || ""} ${c.whatsapp_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, productId, stageId, agentId, query]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() { setSelected(new Set(filtered.map((c) => c.id))); }
  function clearSel() { setSelected(new Set()); }

  async function send() {
    if (!message.trim() || selected.size === 0) { toast.error("Pilih kontak & isi pesan"); return; }
    if (!confirm(`Kirim broadcast ke ${selected.size} kontak?`)) return;
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    let ok = 0, fail = 0;
    for (const id of selected) {
      const c = contacts.find((x) => x.id === id);
      if (!c) { fail++; continue; }
      let { data: conv } = await supabase.from("conversations").select("id").eq("contact_id", id).eq("status", "OPEN").maybeSingle();
      if (!conv) {
        const { data: nc } = await supabase.from("conversations").insert({ contact_id: id, status: "OPEN" }).select("id").single();
        conv = nc;
      }
      if (!conv) { fail++; continue; }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fonnte-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ conversation_id: conv.id, content: message }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok) ok++; else fail++;
    }
    setSending(false);
    toast.success(`Terkirim: ${ok} · Gagal: ${fail}`);
    clearSel();
  }

  const activeFilters = [
    productId !== ALL && products.find((p) => p.id === productId)?.name,
    stageId !== ALL && stages.find((s) => s.id === stageId)?.name,
    agentId !== ALL && (agentId === "__UNASSIGNED__" ? "Belum di-assign" : agents.find((a) => a.id === agentId)?.full_name),
  ].filter(Boolean) as string[];

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Broadcast WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Kirim pesan terarah berdasarkan produk, stages, atau agent yang menangani.</p>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        {/* Filters + recipients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="size-5" /> Filter Penerima</CardTitle>
            <CardDescription>Pilih kategori — bisa dikombinasikan agar broadcast lebih relevan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FilterSelect label="Produk" value={productId} onChange={setProductId}
                options={[{ value: ALL, label: "Semua produk" }, ...products.map((p) => ({ value: p.id, label: p.name }))]} />
              <FilterSelect label="Stages" value={stageId} onChange={setStageId}
                options={[{ value: ALL, label: "Semua stages" }, ...stages.map((s) => ({ value: s.id, label: s.name }))]} />
              <FilterSelect label="Agent" value={agentId} onChange={setAgentId}
                options={[
                  { value: ALL, label: "Semua agent" },
                  { value: "__UNASSIGNED__", label: "Belum di-assign" },
                  ...agents.map((a) => ({ value: a.id, label: a.full_name || a.email })),
                ]} />
            </div>

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.map((f) => <Badge key={f} variant="secondary" className="text-[11px]">{f}</Badge>)}
                <button onClick={() => { setProductId(ALL); setStageId(ALL); setAgentId(ALL); }}
                  className="text-[11px] text-muted-foreground underline">Reset filter</button>
              </div>
            )}

            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama atau nomor..." className="pl-9" />
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <UsersIcon className="size-4" /> {filtered.length} kontak cocok · {selected.size} terpilih
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAllFiltered}>Pilih semua hasil</Button>
                <Button size="sm" variant="outline" onClick={clearSel}>Kosongkan</Button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-auto border rounded-md divide-y">
              {loading && <div className="p-6 text-center text-sm text-muted-foreground">Memuat...</div>}
              {!loading && filtered.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">Tidak ada kontak yang cocok dengan filter.</div>
              )}
              {filtered.slice(0, 500).map((c) => {
                const stage = stages.find((s) => s.id === c.stage_id);
                const prod = products.find((p) => p.id === c.interested_product_id);
                const ag = agents.find((a) => a.id === c.assigned_agent_id);
                return (
                  <label key={c.id} className="flex items-center gap-3 p-2.5 hover:bg-accent/50 cursor-pointer">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.full_name || c.whatsapp_number}</div>
                      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 items-center">
                        <span className="font-mono">{c.whatsapp_number}</span>
                        {stage && <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: stage.color, color: stage.color }}>{stage.name}</Badge>}
                        {prod && <Badge variant="secondary" className="text-[10px] py-0">{prod.name}</Badge>}
                        {ag && <span className="text-muted-foreground/70">· {ag.full_name || ag.email}</span>}
                      </div>
                    </div>
                  </label>
                );
              })}
              {filtered.length > 500 && (
                <div className="p-2 text-center text-[11px] text-muted-foreground">
                  Menampilkan 500 dari {filtered.length}. Pertajam filter untuk hasil lebih spesifik.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Composer */}
        <div className="space-y-4 lg:sticky lg:top-28 self-start">
          <Card>
            <CardHeader>
              <CardTitle>Pesan Broadcast</CardTitle>
              <CardDescription>Tulis pesan WhatsApp yang akan dikirim ke kontak terpilih.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Halo {{nama}}, kami dari Rumah Sakit Husada..." />
              <div className="text-[11px] text-muted-foreground">{message.length} karakter</div>
              <Button onClick={send} disabled={sending || !message.trim() || selected.size === 0} className="w-full">
                {sending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
                Kirim ke {selected.size} kontak
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-md border bg-background text-sm">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
