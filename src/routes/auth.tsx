import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, MessageCircle, Sparkles, Users, Activity } from "lucide-react";
import husadaLogo from "@/assets/husada-logo-v2.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — Husada CRM" },
      { name: "description", content: "Masuk ke Husada CRM — WhatsApp Integration untuk tim Rumah Sakit Husada." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.navigate({ to: "/dashboard" });
  }, [user, loading, router]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success("Berhasil masuk"); router.navigate({ to: "/dashboard" }); }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a1a2e] text-white">
      {/* Animated mesh background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-20 size-[36rem] rounded-full bg-emerald-500/30 blur-3xl animate-pulse" />
        <div className="absolute top-1/3 -right-32 size-[40rem] rounded-full bg-blue-500/30 blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute -bottom-40 left-1/3 size-[34rem] rounded-full bg-cyan-400/20 blur-3xl animate-pulse [animation-delay:2s]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0a1a2e_75%)]" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
        {/* Left: brand storytelling */}
        <div className="hidden lg:flex flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <img src={husadaLogo.url} alt="Husada" className="size-14 rounded-2xl bg-white/95 p-1 shadow-2xl shadow-blue-500/30" />
            <div>
              <div className="font-bold text-xl tracking-tight">Husada CRM</div>
              <div className="text-xs text-white/60">Rumah Sakit Husada · est. 1924</div>
            </div>
          </div>

          <div className="space-y-8 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-medium backdrop-blur-sm">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              WhatsApp Integration · Realtime
            </div>
            <h1 className="text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight">
              Satu inbox untuk <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-blue-300 bg-clip-text text-transparent">seluruh percakapan pasien.</span>
            </h1>
            <p className="text-lg text-white/70 leading-relaxed">
              Kelola leads, follow-up, dan konsultasi pasien lewat WhatsApp — semua dalam satu workspace yang dipakai bersama tim Anda.
            </p>

            <div className="grid grid-cols-3 gap-3 pt-4">
              {[
                { icon: MessageCircle, label: "Inbox Realtime", desc: "Mirror antar agent" },
                { icon: Users, label: "Leads Pipeline", desc: "Kanban + analitik" },
                { icon: Activity, label: "Activity Log", desc: "Audit menyeluruh" },
              ].map((f) => (
                <div key={f.label} className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                  <f.icon className="size-5 text-emerald-300 mb-2" />
                  <div className="font-semibold text-sm">{f.label}</div>
                  <div className="text-[11px] text-white/55 mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-white/40">
            <span>© Rumah Sakit Husada</span>
            <span className="flex items-center gap-1.5"><Sparkles className="size-3.5" /> PWA-ready</span>
          </div>
        </div>

        {/* Right: login card */}
        <div className="flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-md">
            {/* Mobile logo header */}
            <div className="lg:hidden flex flex-col items-center text-center mb-6 space-y-3">
              <img src={husadaLogo.url} alt="Husada" className="size-20 rounded-2xl bg-white p-1.5 shadow-2xl shadow-emerald-500/20" />
              <div>
                <div className="font-bold text-2xl">Husada CRM</div>
                <div className="text-xs text-white/60">WhatsApp Integration · Rumah Sakit Husada</div>
              </div>
            </div>

            <div className="rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/15 shadow-2xl shadow-black/40 p-7 sm:p-8 space-y-6">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold tracking-tight">Selamat datang kembali</h2>
                <p className="text-sm text-white/65">Masuk untuk melanjutkan ke workspace tim Anda.</p>
              </div>

              <form onSubmit={signIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-white/80 text-xs uppercase tracking-wider">Email</Label>
                  <Input
                    type="email" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@husada.id"
                    className="h-12 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-emerald-400/60 focus-visible:border-emerald-400/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/80 text-xs uppercase tracking-wider">Password</Label>
                  <Input
                    type="password" required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-emerald-400/60 focus-visible:border-emerald-400/50"
                  />
                </div>
                <Button
                  type="submit" disabled={submitting}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white border-0 shadow-lg shadow-emerald-500/30 transition-all"
                >
                  {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
                  Masuk ke Workspace
                </Button>
              </form>

              <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-white/70">
                <ShieldCheck className="size-4 mt-0.5 shrink-0 text-emerald-300" />
                <div>
                  Pendaftaran mandiri dinonaktifkan. Akun dibuat oleh admin melalui <strong className="text-white">Settings → Tim Agent</strong>.
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-white/35 mt-5 lg:hidden">© Rumah Sakit Husada · est. 1924</p>
          </div>
        </div>
      </div>
    </div>
  );
}
