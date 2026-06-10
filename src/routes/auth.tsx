import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — Husada CRM" },
      { name: "description", content: "Masuk ke Husada CRM untuk mengelola leads dan percakapan WhatsApp." },
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
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex bg-sidebar text-sidebar-foreground p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-xl">H</div>
            <div>
              <div className="font-bold text-xl">Husada CRM</div>
              <div className="text-sm opacity-70">WhatsApp via Fonnte</div>
            </div>
          </div>
          <div className="mt-16 space-y-6 max-w-md">
            <h1 className="text-4xl font-bold leading-tight">Kelola percakapan pasien secara realtime.</h1>
            <p className="opacity-80">Inbox terpadu, leads pipeline, dan integrasi Fonnte API. Mirror chat antar agent secara live.</p>
          </div>
        </div>
        <p className="text-xs opacity-60">© Husada Care</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Masuk ke CRM</CardTitle>
            <CardDescription>Gunakan akun yang dibuatkan admin untuk Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={signIn} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin mr-2" />} Masuk
              </Button>
            </form>
            <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-muted/60 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 mt-0.5 shrink-0 text-primary" />
              <div>
                Pendaftaran mandiri dinonaktifkan. Akun agent dibuat oleh admin melalui menu <strong>Settings → Tim Agent</strong>.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

