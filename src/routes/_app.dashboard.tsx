import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Husada CRM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [contacts, openConv, stages, msgsToday] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
        supabase.from("contacts").select("stage_id, stages(name, color)"),
        supabase.from("messages").select("id", { count: "exact", head: true })
          .gte("sent_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ]);
      const byStage: Record<string, { name: string; color: string; count: number }> = {};
      (stages.data || []).forEach((r: any) => {
        const name = r.stages?.name || "Tanpa stage";
        const color = r.stages?.color || "#888";
        byStage[name] = byStage[name] || { name, color, count: 0 };
        byStage[name].count++;
      });
      return {
        totalContacts: contacts.count || 0,
        openConv: openConv.count || 0,
        messagesToday: msgsToday.count || 0,
        stages: Object.values(byStage),
      };
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Ringkasan aktivitas CRM hari ini.</p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Leads" value={stats?.totalContacts ?? "—"} />
        <StatCard icon={MessageSquare} label="Percakapan Aktif" value={stats?.openConv ?? "—"} />
        <StatCard icon={Clock} label="Pesan Hari Ini" value={stats?.messagesToday ?? "—"} />
        <StatCard icon={CheckCircle2} label="Stage Aktif" value={stats?.stages.length ?? "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Distribusi Stage</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(stats?.stages ?? []).map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="size-3 rounded-full" style={{ background: s.color }} />
                <div className="flex-1 text-sm">{s.name}</div>
                <div className="text-sm font-medium">{s.count}</div>
              </div>
            ))}
            {!stats?.stages.length && <p className="text-sm text-muted-foreground">Belum ada lead.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-md bg-accent text-accent-foreground grid place-items-center">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
