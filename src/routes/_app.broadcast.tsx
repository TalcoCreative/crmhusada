import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

export const Route = createFileRoute("/_app/broadcast")({
  head: () => ({ meta: [{ title: "Broadcast — Husada CRM" }] }),
  component: BroadcastPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function BroadcastPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.from("contacts").select("id, full_name, whatsapp_number").order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setContacts(data || []));
  }, []);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!message.trim() || selected.size === 0) { toast.error("Pilih kontak & isi pesan"); return; }
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    let ok = 0, fail = 0;
    for (const id of selected) {
      const c = contacts.find((x) => x.id === id);
      if (!c) continue;
      // Ensure conversation exists
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
      const j = await res.json();
      if (j.ok) ok++; else fail++;
    }
    setSending(false);
    toast.success(`Berhasil: ${ok}, Gagal: ${fail}`);
    setSelected(new Set());
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Broadcast</h1>
        <p className="text-sm text-muted-foreground">Kirim pesan ke banyak kontak via Fonnte.</p>
      </header>
      <Card>
        <CardHeader><CardTitle>Pesan</CardTitle><CardDescription>Tulis pesan yang akan dikirim.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Halo, …" />
          <Button onClick={send} disabled={sending}>
            {sending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
            Kirim ke {selected.size} kontak
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Pilih Kontak</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(contacts.map((c) => c.id)))}>Pilih semua</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Kosongkan</Button>
          </div>
          <div className="max-h-96 overflow-auto space-y-1">
            {contacts.map((c) => (
              <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-accent rounded cursor-pointer">
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{c.full_name || c.whatsapp_number}</div>
                  <div className="text-xs text-muted-foreground">{c.whatsapp_number}</div>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
