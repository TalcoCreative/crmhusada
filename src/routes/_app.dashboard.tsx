import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Clock, TrendingUp, Inbox as InboxIcon, Wallet, UserCheck, History } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Husada CRM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);

  const { startISO, endISO } = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    if (range === "today") {}
    else if (range === "7d") start.setDate(start.getDate() - 6);
    else if (range === "30d") start.setDate(start.getDate() - 29);
    else if (range === "month") start.setDate(1);
    else if (range === "year") { start.setMonth(0); start.setDate(1); }
    else if (range === "custom" && from && to) {
      return { startISO: new Date(from + "T00:00:00").toISOString(), endISO: new Date(to + "T23:59:59").toISOString() };
    }
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [range, from, to]);

  useEffect(() => {
    (async () => {
      const [contacts, openConv, msgsList, profiles, respMsgs, stageLogs, allConvs, assignLogs] = await Promise.all([
        supabase.from("contacts").select("id, full_name, whatsapp_number, estimated_revenue, stage_id, created_at, stages(name, color)"),
        supabase.from("conversations").select("id, contact_id, assigned_agent_id, last_message_at, last_message_preview", { count: "exact" }).eq("status", "OPEN"),
        supabase.from("messages").select("sent_at, direction")
          .gte("sent_at", startISO).lte("sent_at", endISO),
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("messages").select("sent_by_id, response_seconds")
          .gte("sent_at", startISO).lte("sent_at", endISO)
          .eq("direction", "OUTBOUND").not("response_seconds", "is", null),
        supabase.from("activity_logs").select("entity_id, metadata, created_at")
          .eq("action", "change_stage")
          .gte("created_at", startISO).lte("created_at", endISO)
          .order("created_at", { ascending: true }),
        supabase.from("conversations").select("id, contact_id, created_at"),
        supabase.from("activity_logs").select("entity_id, metadata, created_at, user_id")
          .eq("action", "assign_agent")
          .gte("created_at", startISO).lte("created_at", endISO),
      ]);

      const byStage: Record<string, { name: string; color: string; count: number }> = {};
      let totalRevenue = 0;
      (contacts.data || []).forEach((r: any) => {
        const name = r.stages?.name || "Tanpa stage";
        const color = r.stages?.color || "#888";
        byStage[name] = byStage[name] || { name, color, count: 0 };
        byStage[name].count++;
        totalRevenue += Number(r.estimated_revenue) || 0;
      });
      const stageDist = Object.values(byStage).sort((a, b) => b.count - a.count);
      const topStage = stageDist[0];

      const allResp = (respMsgs.data || []) as any[];
      const teamAvg = allResp.length ? Math.round(allResp.reduce((s, m) => s + (m.response_seconds || 0), 0) / allResp.length) : 0;

      const perAgent: Record<string, { count: number; total: number }> = {};
      allResp.forEach((m: any) => {
        if (!m.sent_by_id) return;
        perAgent[m.sent_by_id] = perAgent[m.sent_by_id] || { count: 0, total: 0 };
        perAgent[m.sent_by_id].count++;
        perAgent[m.sent_by_id].total += m.response_seconds || 0;
      });
      const profMap: Record<string, any> = {};
      (profiles.data || []).forEach((p: any) => { profMap[p.id] = p; });
      const agentStats = Object.entries(perAgent).map(([id, v]) => ({
        id,
        name: profMap[id]?.full_name || profMap[id]?.email?.split("@")[0] || "Agent",
        avg: Math.round(v.total / v.count),
        avgMin: +(v.total / v.count / 60).toFixed(1),
        count: v.count,
      })).sort((a, b) => a.avg - b.avg);

      // Daily message volume
      const dayMap: Record<string, { date: string; in: number; out: number }> = {};
      (msgsList.data || []).forEach((m: any) => {
        const d = new Date(m.sent_at).toISOString().slice(0, 10);
        dayMap[d] = dayMap[d] || { date: d, in: 0, out: 0 };
        if (m.direction === "INBOUND") dayMap[d].in++; else dayMap[d].out++;
      });
      const dailySeries = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ ...d, label: d.date.slice(5) }));

      // Avg stage transition time (from log[i-1] to log[i] per contact)
      // group change_stage logs by contact_id (from metadata) - fallback via conversation->contact
      const convToContact: Record<string, string> = {};
      (allConvs.data || []).forEach((c: any) => { convToContact[c.id] = c.contact_id; });
      const contactCreated: Record<string, string> = {};
      (contacts.data || []).forEach((c: any) => { contactCreated[c.id] = c.created_at; });

      const perContactLogs: Record<string, any[]> = {};
      (stageLogs.data || []).forEach((l: any) => {
        const m = l.metadata || {};
        const cid = m.contact_id || convToContact[l.entity_id];
        if (!cid) return;
        perContactLogs[cid] = perContactLogs[cid] || [];
        perContactLogs[cid].push(l);
      });

      const edgeAgg: Record<string, { from: string; to: string; total: number; count: number }> = {};
      Object.entries(perContactLogs).forEach(([cid, lgs]) => {
        lgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        let prevTime = contactCreated[cid] ? new Date(contactCreated[cid]).getTime() : null;
        lgs.forEach((l: any) => {
          const m = l.metadata || {};
          const from = m.from_stage || "Awal";
          const to = m.to_stage || "—";
          const t = new Date(l.created_at).getTime();
          if (prevTime !== null) {
            const dur = (t - prevTime) / 1000;
            if (dur > 0) {
              const key = `${from}→${to}`;
              edgeAgg[key] = edgeAgg[key] || { from, to, total: 0, count: 0 };
              edgeAgg[key].total += dur;
              edgeAgg[key].count++;
            }
          }
          prevTime = t;
        });
      });
      const transitions = Object.values(edgeAgg).map((e) => ({
        edge: `${e.from} → ${e.to}`,
        count: e.count,
        avgSec: Math.round(e.total / e.count),
        avgHours: +(e.total / e.count / 3600).toFixed(2),
      })).sort((a, b) => b.count - a.count);

      const myInbox = (openConv.data || []).filter((c: any) => c.assigned_agent_id === user?.id).length;
      const { data: myConvs } = await supabase.from("conversations").select("contact_id").eq("assigned_agent_id", user?.id || "00000000-0000-0000-0000-000000000000");
      const myLeadIds = new Set((myConvs || []).map((c: any) => c.contact_id));
      const myLeadCount = (contacts.data || []).filter((c: any) => myLeadIds.has(c.id)).length;

      setData({
        totalContacts: (contacts.data || []).length,
        openConv: openConv.count || 0,
        messagesRange: (msgsList.data || []).length,
        teamAvg, agentStats, stageDist, topStage, totalRevenue,
        myInbox, myLeads: myLeadCount, dailySeries, transitions,
      });
    })();
  }, [startISO, endISO, user?.id]);

  function fmtSec(s: number) {
    if (!s) return "—";
    if (s < 60) return `${s}d`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}j`;
  }

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Performa tim & lead pipeline.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">Rentang</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hari ini</SelectItem>
                <SelectItem value="7d">7 hari terakhir</SelectItem>
                <SelectItem value="30d">30 hari terakhir</SelectItem>
                <SelectItem value="month">Bulan ini</SelectItem>
                <SelectItem value="year">Tahun ini</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === "custom" && (
            <>
              <div><Label className="text-xs">Dari</Label><Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label className="text-xs">Sampai</Label><Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={InboxIcon} label="My Inbox" value={data?.myInbox ?? "—"} />
        <StatCard icon={Users} label="My Leads" value={data?.myLeads ?? "—"} />
        <StatCard icon={MessageSquare} label="Percakapan Aktif" value={data?.openConv ?? "—"} />
        <StatCard icon={Clock} label="Avg Respon Tim" value={fmtSec(data?.teamAvg || 0)} />
        <StatCard icon={Users} label="Total Leads" value={data?.totalContacts ?? "—"} />
        <StatCard icon={MessageSquare} label="Pesan (Rentang)" value={data?.messagesRange ?? "—"} />
        <StatCard icon={TrendingUp} label="Stage Teratas" value={data?.topStage?.name ?? "—"} />
        <StatCard icon={Wallet} label="Est. Revenue" value={`Rp ${(data?.totalRevenue || 0).toLocaleString("id-ID")}`} />
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="glow-soft lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Volume Pesan Harian</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.dailySeries || []}>
                <defs>
                  <linearGradient id="gIn" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOut" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="in" name="Masuk" stroke="hsl(var(--primary))" fill="url(#gIn)" strokeWidth={2} />
                <Area type="monotone" dataKey="out" name="Keluar" stroke="#10b981" fill="url(#gOut)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glow-soft">
          <CardHeader><CardTitle className="text-base">Distribusi Stage</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data?.stageDist || []} dataKey="count" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {(data?.stageDist || []).map((s: any, i: number) => (
                    <Cell key={i} fill={s.color || "#888"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2 max-h-32 overflow-auto">
              {(data?.stageDist || []).map((s: any) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <div className="size-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glow-soft">
          <CardHeader><CardTitle className="text-base">Avg Respon per Agent (menit)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.agentStats || []} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={11} width={90} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="avgMin" name="Menit" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {!data?.agentStats?.length && <p className="text-center text-sm text-muted-foreground py-8">Belum ada data respon.</p>}
          </CardContent>
        </Card>

        <Card className="glow-soft">
          <CardHeader><CardTitle className="text-base">Leads per Stage</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.stageDist || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" height={60} interval={0} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Jumlah" radius={[6, 6, 0, 0]}>
                  {(data?.stageDist || []).map((s: any, i: number) => (
                    <Cell key={i} fill={s.color || "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Stage transitions */}
      <Card className="glow-soft">
        <CardHeader>
          <CardTitle className="text-base">Avg Perpindahan Stage</CardTitle>
          <p className="text-xs text-muted-foreground">Rata-rata waktu (jam) & jumlah perpindahan antar stage berdasarkan log aktivitas dalam rentang ini.</p>
        </CardHeader>
        <CardContent>
          {(!data?.transitions || data.transitions.length === 0) ? (
            <p className="text-center text-sm text-muted-foreground py-8">Belum ada perpindahan stage pada rentang ini.</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={Math.max(220, (data?.transitions?.length || 0) * 32)}>
                <BarChart data={data?.transitions || []} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="edge" fontSize={11} width={160} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, n: any) => n === "avgHours" ? [`${v} jam`, "Rata-rata"] : [v, "Jumlah"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="avgHours" name="Avg (jam)" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="count" name="Jumlah" fill="#10b981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left py-2">Perpindahan</th>
                      <th className="text-right">Jumlah</th>
                      <th className="text-right">Rata-rata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transitions.map((t: any) => (
                      <tr key={t.edge} className="border-b">
                        <td className="py-2 pr-2">{t.edge}</td>
                        <td className="text-right tabular-nums">{t.count}</td>
                        <td className="text-right tabular-nums">{fmtSec(t.avgSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card className="glow-soft">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center glow-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-lg font-bold truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
