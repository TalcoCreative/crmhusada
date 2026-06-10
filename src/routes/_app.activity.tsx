import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Activity, Trash2, UserCog, Tag, MessageSquare, Filter } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export const Route = createFileRoute("/_app/activity")({
  head: () => ({ meta: [{ title: "Log Aktivitas — Husada CRM" }] }),
  component: ActivityLogPage,
});

type Log = {
  id: string; user_id: string | null; action: string;
  entity_type: string | null; entity_id: string | null;
  metadata: any; created_at: string;
};
type Profile = { id: string; full_name: string | null; email: string | null; last_seen_at: string | null };

const ACTION_META: Record<string, { label: string; icon: any; color: string }> = {
  reply_message: { label: "Membalas pesan", icon: MessageSquare, color: "text-blue-600 bg-blue-500/10" },
  assign_agent: { label: "Mengubah penugasan agent", icon: UserCog, color: "text-violet-600 bg-violet-500/10" },
  change_stage: { label: "Mengubah stage lead", icon: Tag, color: "text-emerald-600 bg-emerald-500/10" },
  delete_chat: { label: "Menghapus percakapan", icon: Trash2, color: "text-red-600 bg-red-500/10" },
};

function todayStr(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function ActivityLogPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [from, setFrom] = useState(todayStr(-7));
  const [to, setTo] = useState(todayStr(0));
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();
    let q = supabase.from("activity_logs").select("*")
      .gte("created_at", start).lte("created_at", end)
      .order("created_at", { ascending: false }).limit(500);
    if (actionFilter !== "all") q = q.eq("action", actionFilter);
    if (userFilter !== "all") q = q.eq("user_id", userFilter);
    const { data } = await q;
    setLogs((data as any) || []);
    setLoading(false);
  }

  async function loadProfiles() {
    const { data } = await supabase.from("profiles").select("id, full_name, email, last_seen_at");
    const map: Record<string, Profile> = {};
    (data || []).forEach((p: any) => { map[p.id] = p; });
    setProfiles(map);
  }

  useEffect(() => { loadProfiles(); }, []);
  useEffect(() => { load(); }, [from, to, actionFilter, userFilter]);

  useEffect(() => {
    const ch = supabase.channel("activity-logs-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => loadProfiles())
      .subscribe();
    const t = setInterval(loadProfiles, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [from, to, actionFilter, userFilter]);

  const agents = useMemo(() => Object.values(profiles).sort((a, b) =>
    (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")), [profiles]);

  function isOnline(p: Profile) {
    if (!p.last_seen_at) return false;
    return Date.now() - new Date(p.last_seen_at).getTime() < 3 * 60_000;
  }

  function userName(id: string | null) {
    if (!id) return "Sistem";
    const p = profiles[id];
    return p?.full_name || p?.email?.split("@")[0] || "Agent";
  }

  function describe(log: Log) {
    const m = log.metadata || {};
    const contact = m.contact_name || m.whatsapp || "kontak";
    if (log.action === "reply_message") return `Membalas ${contact} (${m.length || 0} karakter)`;
    if (log.action === "assign_agent") {
      const from = m.from_name || "Tidak ditugaskan";
      const to = m.to_name || "Tidak ditugaskan";
      return `Penugasan ${contact}: ${from} → ${to}`;
    }
    if (log.action === "change_stage") {
      return `Stage ${contact}: ${m.from_stage || "—"} → ${m.to_stage || "—"}`;
    }
    if (log.action === "delete_chat") return `Menghapus percakapan ${contact} (${m.message_count || 0} pesan)`;
    return log.action;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 grid place-items-center">
          <Activity className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Log Aktivitas & Status Agent</h1>
          <p className="text-xs text-muted-foreground">Riwayat balasan, penugasan, perubahan stage, dan penghapusan chat.</p>
        </div>
      </div>

      {/* Agents online */}
      <div className="rounded-2xl border bg-card glow-soft p-4">
        <div className="text-sm font-semibold mb-3">Agent Online</div>
        <div className="flex flex-wrap gap-2">
          {agents.map((a) => {
            const online = isOnline(a);
            return (
              <div key={a.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${online ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/40"}`}>
                <span className={`size-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                <span className="font-medium">{a.full_name || a.email?.split("@")[0]}</span>
                <span className="text-muted-foreground">
                  {online ? "online" : a.last_seen_at ? `· ${format(new Date(a.last_seen_at), "dd MMM HH:mm", { locale: idLocale })}` : "· belum aktif"}
                </span>
              </div>
            );
          })}
          {agents.length === 0 && <div className="text-xs text-muted-foreground">Belum ada agent terdaftar.</div>}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border bg-card glow-soft p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="size-4" /> Filter
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Dari tanggal</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Sampai tanggal</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Jenis aksi</label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua aksi</SelectItem>
                {Object.entries(ACTION_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Agent</label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua agent</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name || a.email?.split("@")[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" className="h-9 text-xs flex-1" onClick={() => { setFrom(todayStr(0)); setTo(todayStr(0)); }}>Hari ini</Button>
            <Button variant="outline" size="sm" className="h-9 text-xs flex-1" onClick={() => { setFrom(todayStr(-7)); setTo(todayStr(0)); }}>7 hari</Button>
          </div>
        </div>
      </div>

      {/* Logs list */}
      <div className="rounded-2xl border bg-card glow-soft overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">Riwayat ({logs.length})</div>
          {loading && <div className="text-[11px] text-muted-foreground">Memuat...</div>}
        </div>
        <div className="divide-y max-h-[60vh] overflow-auto">
          {logs.map((l) => {
            const meta = ACTION_META[l.action] || { label: l.action, icon: Activity, color: "text-muted-foreground bg-muted" };
            const Icon = meta.icon;
            return (
              <div key={l.id} className="px-4 py-3 flex items-start gap-3 hover:bg-accent/30">
                <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${meta.color}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{describe(l)}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    oleh <span className="font-medium text-foreground">{userName(l.user_id)}</span>
                    {" · "}
                    {format(new Date(l.created_at), "dd MMM yyyy HH:mm:ss", { locale: idLocale })}
                  </div>
                </div>
              </div>
            );
          })}
          {logs.length === 0 && !loading && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Tidak ada aktivitas pada rentang tanggal ini.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
