import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Search, Download, Upload, FileDown, MessageSquare, History, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

type Stage = { id: string; name: string; color: string; is_default?: boolean };
type Product = { id: string; name: string };
type Profile = { id: string; full_name: string | null; email: string };
type Contact = {
  id: string; whatsapp_number: string; full_name: string | null;
  domicile: string | null; stage_id: string | null; created_at: string;
  interested_product_id: string | null; estimated_revenue: number | null;
  source: string | null; notes: string | null; document_url: string | null;
  chief_complaint: string | null; assigned_agent_id?: string | null;
  stages?: { name: string; color: string };
};

export function LeadsView({ mineOnly }: { mineOnly: boolean }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [openNew, setOpenNew] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [form, setForm] = useState({ whatsapp_number: "", full_name: "", domicile: "", notes: "" });

  async function load() {
    const [c, s, p, pr] = await Promise.all([
      supabase.from("contacts").select("*, stages(name, color), conversations(assigned_agent_id)").order("created_at", { ascending: false }),
      supabase.from("stages").select("*").order("order_index"),
      supabase.from("products").select("id, name").order("sort_order"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    let list = ((c.data as any) || []).map((row: any) => ({
      ...row,
      assigned_agent_id: row.conversations?.[0]?.assigned_agent_id || null,
    }));
    if (mineOnly && user) list = list.filter((r: any) => r.assigned_agent_id === user.id);
    setContacts(list);
    setStages((s.data as any) || []);
    setProducts((p.data as any) || []);
    setAgents((pr.data as any) || []);
  }
  useEffect(() => { load(); }, [mineOnly, user?.id]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchQ = !q || c.full_name?.toLowerCase().includes(q) || c.whatsapp_number.includes(q);
    const matchS = stageFilter === "all" || c.stage_id === stageFilter;
    return matchQ && matchS;
  });

  const totalRevenue = filtered.reduce((s, c) => s + (Number(c.estimated_revenue) || 0), 0);

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    let phone = form.whatsapp_number.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    if (!phone.startsWith("62")) phone = "62" + phone;
    const defaultStage = stages.find((s) => s.is_default || s.name === "Lead Masuk")?.id;
    const { error } = await supabase.from("contacts").insert({
      whatsapp_number: phone, full_name: form.full_name || null,
      domicile: form.domicile || null, notes: form.notes || null,
      stage_id: defaultStage || null, chatbot_state: "done",
    });
    if (error) toast.error(error.message);
    else { toast.success("Lead ditambahkan"); setOpenNew(false); setForm({ whatsapp_number: "", full_name: "", domicile: "", notes: "" }); load(); }
  }

  function exportCsv() {
    const rows = [["No WhatsApp", "Nama", "Domisili", "Stage", "Produk", "Estimated Revenue", "Source", "Notes", "Document URL", "Dibuat"]];
    filtered.forEach((c) => rows.push([
      c.whatsapp_number, c.full_name || "", c.domicile || "",
      c.stages?.name || "", products.find(p => p.id === c.interested_product_id)?.name || "",
      String(c.estimated_revenue || 0), c.source || "", c.notes || "",
      c.document_url || "", new Date(c.created_at).toLocaleString("id-ID"),
    ]));
    download(rows, `leads-${Date.now()}.csv`);
  }

  function downloadTemplate() {
    const rows = [
      ["whatsapp_number", "full_name", "domicile", "stage", "product", "estimated_revenue", "source", "notes", "document_url"],
      ["628123456789", "Budi Santoso", "Jakarta", "Lead Masuk", "Medical Check Up", "5000000", "Instagram Ads", "Tertarik MCU lengkap", "https://drive.google.com/..."],
    ];
    download(rows, "template-import-leads.csv");
  }

  function download(rows: string[][], filename: string) {
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return toast.error("File kosong");
    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const idx = (k: string) => headers.indexOf(k);
    const rows = lines.slice(1).map(parseCsvLine);
    let success = 0, failed = 0;
    for (const row of rows) {
      let phone = (row[idx("whatsapp_number")] || "").replace(/\D/g, "");
      if (!phone) { failed++; continue; }
      if (phone.startsWith("0")) phone = "62" + phone.slice(1);
      if (!phone.startsWith("62")) phone = "62" + phone;
      const stageName = row[idx("stage")] || "Lead Masuk";
      const stageId = stages.find((s) => s.name === stageName)?.id || stages.find((s) => s.is_default)?.id;
      const productName = row[idx("product")] || "";
      const productId = products.find((p) => p.name === productName)?.id || null;
      const { error } = await supabase.from("contacts").upsert({
        whatsapp_number: phone,
        full_name: row[idx("full_name")] || null,
        domicile: row[idx("domicile")] || null,
        stage_id: stageId || null,
        interested_product_id: productId,
        estimated_revenue: Number(row[idx("estimated_revenue")] || 0) || 0,
        source: row[idx("source")] || null,
        notes: row[idx("notes")] || null,
        document_url: row[idx("document_url")] || null,
        chief_complaint: null,
        chatbot_state: "done",
      } as any, { onConflict: "whatsapp_number" });
      if (error) failed++; else success++;
    }
    toast.success(`Import selesai: ${success} berhasil, ${failed} gagal`);
    load();
  }

  function parseCsvLine(line: string): string[] {
    const out: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{mineOnly ? "My Leads" : "Leads"}</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} kontak · Total estimasi revenue: Rp {totalRevenue.toLocaleString("id-ID")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown className="size-4 mr-1.5" /> Template
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            <Button variant="outline" size="sm" asChild><span><Upload className="size-4 mr-1.5" /> Import</span></Button>
          </label>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4 mr-1.5" /> Export</Button>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1.5" /> Lead Baru</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tambah Lead</DialogTitle></DialogHeader>
              <form onSubmit={createLead} className="space-y-3">
                <div className="space-y-1.5"><Label>No WhatsApp (628xxx)</Label><Input required value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Nama Lengkap</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Domisili</Label><Input value={form.domicile} onChange={(e) => setForm({ ...form, domicile: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Catatan</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button type="submit" className="w-full">Simpan</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="p-3 flex flex-wrap gap-2 glow-soft">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau nomor..." className="pl-8" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Filter stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua stage</SelectItem>
            {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden glow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Nama</th>
                <th className="text-left p-3 font-medium">No WhatsApp</th>
                <th className="text-left p-3 font-medium">Produk</th>
                <th className="text-left p-3 font-medium">Stage</th>
                <th className="text-right p-3 font-medium">Est. Revenue</th>
                <th className="text-left p-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setSelected(c)} className="border-t hover:bg-accent/40 cursor-pointer">
                  <td className="p-3 font-medium">{c.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.whatsapp_number}</td>
                  <td className="p-3">{products.find(p => p.id === c.interested_product_id)?.name || "—"}</td>
                  <td className="p-3">
                    {c.stages && <Badge style={{ background: c.stages.color, color: "white" }}>{c.stages.name}</Badge>}
                  </td>
                  <td className="p-3 text-right">Rp {Number(c.estimated_revenue || 0).toLocaleString("id-ID")}</td>
                  <td className="p-3 text-xs text-muted-foreground">{c.source || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Belum ada lead.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <LeadDetailDialog
        contact={selected}
        stages={stages}
        products={products}
        agents={agents}
        onClose={() => setSelected(null)}
        onSaved={() => { load(); setSelected(null); }}
      />
    </div>
  );
}

function LeadDetailDialog({ contact, stages, products, agents, onClose, onSaved }: {
  contact: Contact | null; stages: Stage[]; products: Product[]; agents: Profile[];
  onClose: () => void; onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [profMap, setProfMap] = useState<Record<string, any>>({});
  const [opening, setOpening] = useState(false);

  useEffect(() => { setForm(contact ? { ...contact } : null); }, [contact]);

  useEffect(() => {
    if (!contact) return;
    (async () => {
      // Find conversation IDs for this contact, then load logs scoped to contact or its convs
      const { data: convs } = await supabase.from("conversations").select("id").eq("contact_id", contact.id);
      const ids = [contact.id, ...((convs || []).map((c: any) => c.id))];
      const [{ data: lg }, { data: profs }] = await Promise.all([
        supabase.from("activity_logs")
          .select("*")
          .in("entity_id", ids)
          .in("action", ["change_stage", "assign_agent", "reply_message", "delete_chat"])
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      setLogs(lg || []);
      const pm: Record<string, any> = {};
      (profs || []).forEach((p: any) => { pm[p.id] = p; });
      setProfMap(pm);
    })();
  }, [contact?.id]);

  if (!contact || !form) return null;

  async function save() {
    const { error } = await supabase.from("contacts").update({
      full_name: form.full_name,
      whatsapp_number: form.whatsapp_number,
      domicile: form.domicile,
      stage_id: form.stage_id,
      interested_product_id: form.interested_product_id || null,
      estimated_revenue: Number(form.estimated_revenue) || 0,
      source: form.source,
      notes: form.notes,
      document_url: form.document_url,
      chief_complaint: form.chief_complaint,
    }).eq("id", contact!.id);
    if (error) return toast.error(error.message);
    toast.success("Lead diperbarui");
    onSaved();
  }

  async function openChat() {
    if (!contact) return;
    setOpening(true);
    // Find existing conversation or create one
    let convId: string | null = null;
    const { data: existing } = await supabase.from("conversations")
      .select("id").eq("contact_id", contact.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing?.id) convId = existing.id;
    else {
      const { data: created, error } = await supabase.from("conversations")
        .insert({ contact_id: contact.id, status: "OPEN" }).select("id").single();
      if (error || !created) { setOpening(false); return toast.error(error?.message || "Gagal membuka chat"); }
      convId = created.id;
    }
    setOpening(false);
    onClose();
    navigate({ to: "/inbox", search: { c: convId! } });
  }

  function agentName(id: string | null | undefined) {
    if (!id) return "—";
    const p = profMap[id]; return p?.full_name || p?.email?.split("@")[0] || "Agent";
  }

  function actionLabel(l: any) {
    const m = l.metadata || {};
    const who = agentName(l.user_id);
    if (l.action === "change_stage") return <>Stage diubah oleh <b>{who}</b>: <span className="text-muted-foreground">{m.from_stage || "—"}</span> <ArrowRight className="inline size-3" /> <b>{m.to_stage || "—"}</b></>;
    if (l.action === "assign_agent") return <>Ditugaskan oleh <b>{who}</b>: <span className="text-muted-foreground">{m.from_name || "—"}</span> <ArrowRight className="inline size-3" /> <b>{m.to_name || "—"}</b></>;
    if (l.action === "reply_message") return <>Balasan dari <b>{who}</b></>;
    if (l.action === "delete_chat") return <>Chat dihapus oleh <b>{who}</b></>;
    return l.action;
  }

  return (
    <Dialog open={!!contact} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Detail Lead</DialogTitle>
            <Button size="sm" onClick={openChat} disabled={opening} className="mr-6">
              <MessageSquare className="size-4 mr-1.5" /> {opening ? "Membuka..." : "Chat di Inbox"}
            </Button>
          </div>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Nama Lengkap</Label><Input value={form.full_name || ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>No WhatsApp</Label><Input value={form.whatsapp_number || ""} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Domisili</Label><Input value={form.domicile || ""} onChange={(e) => setForm({ ...form, domicile: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Stage</Label>
            <Select value={form.stage_id || ""} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Produk</Label>
            <Select value={form.interested_product_id || "none"} onValueChange={(v) => setForm({ ...form, interested_product_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Tidak ada —</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Estimated Revenue (Rp)</Label><Input type="number" value={form.estimated_revenue || 0} onChange={(e) => setForm({ ...form, estimated_revenue: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Source</Label><Input value={form.source || ""} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Instagram Ads, Referral, Walk-in..." /></div>
          <div className="space-y-1.5"><Label>Link Dokumen Pendukung</Label><Input value={form.document_url || ""} onChange={(e) => setForm({ ...form, document_url: e.target.value })} placeholder="https://..." /></div>
          <div className="md:col-span-2 space-y-1.5"><Label>Keluhan / Pertanyaan</Label><Textarea rows={2} value={form.chief_complaint || ""} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} /></div>
          <div className="md:col-span-2 space-y-1.5"><Label>Catatan</Label><Textarea rows={3} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        <div className="mt-5 border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <History className="size-4" />
            <h3 className="font-semibold text-sm">Riwayat Lead ({logs.length})</h3>
          </div>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada aktivitas tercatat untuk lead ini.</p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-3">
              {logs.map((l) => (
                <li key={l.id} className="ml-4">
                  <div className="absolute -left-1.5 size-3 rounded-full bg-primary glow-primary" />
                  <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("id-ID")}</div>
                  <div className="text-sm">{actionLabel(l)}</div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 sticky bottom-0 bg-background">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button onClick={save}>Simpan Perubahan</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
