import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Search, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/leads")({
  head: () => ({ meta: [{ title: "Leads — Husada CRM" }] }),
  component: LeadsPage,
});

type Stage = { id: string; name: string; color: string };
type Contact = {
  id: string; whatsapp_number: string; full_name: string | null;
  domicile: string | null; stage_id: string | null; created_at: string;
  stages?: { name: string; color: string };
};

function LeadsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ whatsapp_number: "", full_name: "", domicile: "", notes: "" });

  async function load() {
    const [c, s] = await Promise.all([
      supabase.from("contacts").select("*, stages(name, color)").order("created_at", { ascending: false }),
      supabase.from("stages").select("*").order("order_index"),
    ]);
    setContacts((c.data as any) || []);
    setStages((s.data as any) || []);
  }
  useEffect(() => { load(); }, []);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchQ = !q || c.full_name?.toLowerCase().includes(q) || c.whatsapp_number.includes(q);
    const matchS = stageFilter === "all" || c.stage_id === stageFilter;
    return matchQ && matchS;
  });

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    let phone = form.whatsapp_number.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    if (!phone.startsWith("62")) phone = "62" + phone;
    const defaultStage = stages.find((s) => s.name === "Baru")?.id;
    const { error } = await supabase.from("contacts").insert({
      whatsapp_number: phone,
      full_name: form.full_name || null,
      domicile: form.domicile || null,
      notes: form.notes || null,
      stage_id: defaultStage || null,
      chatbot_state: "done",
    });
    if (error) toast.error(error.message);
    else { toast.success("Lead ditambahkan"); setOpen(false); setForm({ whatsapp_number: "", full_name: "", domicile: "", notes: "" }); load(); }
  }

  async function updateStage(contactId: string, newStage: string) {
    const { error } = await supabase.from("contacts").update({ stage_id: newStage }).eq("id", contactId);
    if (error) toast.error(error.message);
    else { toast.success("Stage diperbarui"); load(); }
  }

  function exportCsv() {
    const rows = [["No WhatsApp", "Nama", "Domisili", "Stage", "Dibuat"]];
    filtered.forEach((c) => rows.push([
      c.whatsapp_number, c.full_name || "", c.domicile || "", c.stages?.name || "", new Date(c.created_at).toLocaleString("id-ID"),
    ]));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} kontak</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="size-4 mr-2" /> Export</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4 mr-2" /> Lead Baru</Button>
            </DialogTrigger>
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

      <Card className="p-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau nomor…" className="pl-8" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Filter stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua stage</SelectItem>
            {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Nama</th>
                <th className="text-left p-3 font-medium">No WhatsApp</th>
                <th className="text-left p-3 font-medium">Domisili</th>
                <th className="text-left p-3 font-medium">Stage</th>
                <th className="text-left p-3 font-medium">Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-medium">{c.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.whatsapp_number}</td>
                  <td className="p-3">{c.domicile || "—"}</td>
                  <td className="p-3">
                    <Select value={c.stage_id || ""} onValueChange={(v) => updateStage(c.id, v)}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue>
                          {c.stages && (
                            <Badge style={{ background: c.stages.color, color: "white" }}>{c.stages.name}</Badge>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("id-ID")}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Belum ada lead.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
