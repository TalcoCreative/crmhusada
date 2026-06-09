import { createFileRoute, Outlet, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, MessageSquare, Users, Settings, LogOut, Send, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: MessageSquare },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/broadcast", label: "Broadcast", icon: Send },
  { to: "/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Memuat…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-lg">H</div>
          <div>
            <div className="font-semibold leading-tight">Husada CRM</div>
            <div className="text-[11px] opacity-70 flex items-center gap-1"><Activity className="size-3" /> Fonnte WA</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60 opacity-80 hover:opacity-100"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="text-xs opacity-70 truncate px-2 mb-2">{user.email}</div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.navigate({ to: "/auth" }); }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/60"
          >
            <LogOut className="size-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-sidebar text-sidebar-foreground border-b border-sidebar-border flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded bg-primary text-primary-foreground grid place-items-center font-bold text-sm">H</div>
          <span className="font-semibold text-sm">Husada CRM</span>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.navigate({ to: "/auth" }); }}>
          <LogOut className="size-4" />
        </button>
      </div>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-sidebar text-sidebar-foreground border-t border-sidebar-border flex justify-around py-2">
        {navItems.map((i) => (
          <Link key={i.to} to={i.to} className="flex flex-col items-center text-[10px] gap-0.5 opacity-80">
            <i.icon className="size-5" />
            {i.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 overflow-auto pt-14 md:pt-0 pb-16 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
