import { createFileRoute, Outlet, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, MessageSquare, Users, Settings, LogOut, Send, Inbox, UserCircle2, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import husadaLogo from "@/assets/husada-logo.png.asset.json";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: MessageSquare },
  { to: "/my-inbox", label: "My Inbox", icon: Inbox },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/my-leads", label: "My Leads", icon: UserCircle2 },
  { to: "/broadcast", label: "Broadcast", icon: Send },
  { to: "/activity", label: "Log", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [profileName, setProfileName] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle()
        .then(({ data }) => setProfileName(data?.full_name || data?.email?.split("@")[0] || ""));
    }
  }, [user]);

  if (loading || !user) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Memuat...</div>;
  }

  return (
    <div className="min-h-screen bg-background bg-mesh">
      {/* Floating top navbar */}
      <header className="fixed top-3 inset-x-3 z-30 md:top-4 md:inset-x-6">
        <div className="nav-floating glow-soft rounded-2xl px-3 py-2 flex items-center gap-2">
          <div className="flex items-center gap-2 pr-3 mr-1 border-r border-border/60">
            <img src={husadaLogo.url} alt="Husada" className="size-9 rounded-lg object-contain bg-white p-0.5" />
            <div className="hidden md:block">
              <div className="text-sm font-semibold leading-tight">Husada CRM</div>
              <div className="text-[10px] text-muted-foreground">Rumah Sakit Husada · 1924</div>
            </div>
          </div>
          <nav className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {navItems.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs md:text-sm font-medium whitespace-nowrap transition-all",
                    active
                      ? "bg-primary text-primary-foreground glow-primary"
                      : "text-foreground/70 hover:text-foreground hover:bg-accent/60"
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="hidden md:flex items-center gap-2 pl-2 ml-1 border-l border-border/60">
            <div className="text-xs">
              <div className="font-medium leading-tight">{profileName || "Agent"}</div>
              <div className="text-[10px] text-muted-foreground">Online</div>
            </div>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.navigate({ to: "/auth" }); }}
              className="size-9 grid place-items-center rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
              title="Keluar"
            >
              <LogOut className="size-4" />
            </button>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.navigate({ to: "/auth" }); }}
            className="md:hidden size-9 grid place-items-center rounded-lg hover:bg-destructive/10 text-destructive"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="pt-24 md:pt-28 pb-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
