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
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, crucial: false },
  { to: "/inbox", label: "Inbox", icon: MessageSquare, crucial: true },
  { to: "/my-inbox", label: "My Inbox", icon: Inbox, crucial: false },
  { to: "/leads", label: "Leads", icon: Users, crucial: true },
  { to: "/my-leads", label: "My Leads", icon: UserCircle2, crucial: false },
  { to: "/broadcast", label: "Broadcast", icon: Send, crucial: false },
  { to: "/activity", label: "Log", icon: Activity, crucial: false },
  { to: "/settings", label: "Settings", icon: Settings, crucial: false },
];

function AppLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [profileName, setProfileName] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle()
        .then(({ data }) => setProfileName(data?.full_name || data?.email?.split("@")[0] || ""));
    }
  }, [user]);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  if (loading || !user) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Memuat...</div>;
  }

  const crucialItems = navItems.filter((i) => i.crucial);

  return (
    <div className="min-h-screen bg-background bg-mesh">
      {/* Floating top navbar */}
      <header className="fixed top-3 inset-x-3 z-30 md:top-4 md:inset-x-6">
        <div className="nav-floating glow-soft rounded-2xl px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="flex items-center gap-2 pr-3 mr-1 border-r border-border/60 md:cursor-default"
            title="Menu"
          >
            <img src={husadaLogo.url} alt="Husada" className="size-9 rounded-lg object-contain bg-white p-0.5" />
            <div className="hidden md:block text-left">
              <div className="text-sm font-semibold leading-tight">Husada CRM</div>
              <div className="text-[10px] text-muted-foreground">Rumah Sakit Husada · 1924</div>
            </div>
          </button>

          {/* Desktop: full nav */}
          <nav className="hidden md:flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
            {navItems.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              return (
                <Link key={item.to} to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs md:text-sm font-medium whitespace-nowrap transition-all",
                    active ? "bg-primary text-primary-foreground glow-primary" : "text-foreground/70 hover:text-foreground hover:bg-accent/60"
                  )}>
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile: only crucial buttons */}
          <nav className="md:hidden flex-1 flex items-center gap-1 justify-end">
            {crucialItems.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              return (
                <Link key={item.to} to={item.to}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                    active ? "bg-primary text-primary-foreground glow-primary" : "text-foreground/70 hover:bg-accent/60"
                  )}>
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
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

        {/* Mobile expanded menu (tap logo to toggle) */}
        {mobileOpen && (
          <div className="md:hidden mt-2 nav-floating glow-soft rounded-2xl p-2 grid grid-cols-2 gap-1.5 animate-in fade-in slide-in-from-top-2">
            {navItems.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              return (
                <Link key={item.to} to={item.to}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium",
                    active ? "bg-primary text-primary-foreground glow-primary" : "text-foreground/80 hover:bg-accent/60"
                  )}>
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </header>

      <main className="pt-24 md:pt-28 pb-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
