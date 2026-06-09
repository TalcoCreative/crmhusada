import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Husada CRM" }] }),
  component: SettingsPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function SettingsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Konfigurasi sistem CRM dan integrasi WhatsApp.</p>
      </header>
      <Tabs defaultValue="fonnte">
        <TabsList>
          <TabsTrigger value="fonnte">Fonnte WA</TabsTrigger>
          <TabsTrigger value="products">Produk</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>
        <TabsContent value="fonnte"><FonnteTab /></TabsContent>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="webhook"><WebhookTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function FonnteTab() {
  const [apiKey, setApiKey] = useState("");
  const [device, setDevice] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testNumber, setTestNumber] = useState("");
  const [testMsg, setTestMsg] = useState("Test pesan dari Husada CRM ✅");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("system_settings").select("key,value").in("key", ["fonnte_api_key", "fonnte_device"]);
      data?.forEach((r) => {
        if (r.key === "fonnte_api_key") setApiKey(r.value || "");
        if (r.key === "fonnte_device") setDevice(r.value || "");
      });
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/save-fonnte-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ api_key: apiKey, device }),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) toast.error(j.error || "Gagal menyimpan");
    else toast.success("Tersimpan");
  }

  async function testConnection() {
    if (!apiKey) { toast.error("Masukkan API key dulu"); return; }
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fonnte-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const j = await res.json();
    setTestResult(j);
    setTesting(false);
    if (j.ok) toast.success("Fonnte terkoneksi!");
    else toast.error("Koneksi gagal. Cek API key.");
  }

  async function testSend() {
    if (!testNumber) { toast.error("Masukkan nomor tujuan"); return; }
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fonnte-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ target: testNumber, content: testMsg, is_test: true }),
    });
    const j = await res.json();
    setSending(false);
    if (j.ok) toast.success("Pesan test terkirim! Cek WhatsApp.");
    else toast.error(j.error || JSON.stringify(j.fonnte));
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="size-5" /> Fonnte API Key</CardTitle>
          <CardDescription>
            Dapatkan API key dari{" "}
            <a href="https://fonnte.com/devices" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 underline">
              fonnte.com/devices <ExternalLink className="size-3" />
            </a>{" "}
            (login → Device → Token).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Fonnte API Token</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Token dari Fonnte" />
          </div>
          <div className="space-y-1.5">
            <Label>Nomor Device (opsional)</Label>
            <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="628xxx" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />} Simpan
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing || !apiKey}>
              {testing && <Loader2 className="size-4 mr-2 animate-spin" />} Test Koneksi
            </Button>
          </div>
          {testResult && (
            <div className={`mt-2 p-3 rounded-md text-sm border ${testResult.ok ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
              <div className="flex items-center gap-2 font-medium">
                {testResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                {testResult.ok ? "Terkoneksi ke Fonnte" : "Gagal terhubung"}
              </div>
              <pre className="text-[11px] mt-2 overflow-x-auto opacity-80">{JSON.stringify(testResult.data || testResult, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Kirim Pesan</CardTitle>
          <CardDescription>Kirim pesan WhatsApp ke nomor manapun untuk memverifikasi koneksi end-to-end.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nomor Tujuan (628xxx)</Label>
            <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="628123456789" />
          </div>
          <div className="space-y-1.5">
            <Label>Pesan</Label>
            <Textarea rows={3} value={testMsg} onChange={(e) => setTestMsg(e.target.value)} />
          </div>
          <Button onClick={testSend} disabled={sending}>
            {sending && <Loader2 className="size-4 mr-2 animate-spin" />} Kirim Test
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WebhookTab() {
  const url = `${SUPABASE_URL}/functions/v1/fonnte-webhook`;
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Webhook URL untuk Fonnte</CardTitle>
        <CardDescription>Copy URL ini ke <strong>Fonnte Dashboard → Device → URL Webhook</strong>, lalu centang event <em>incoming</em>.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Disalin"); }}>
            <Copy className="size-4" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>✅ Pesan masuk akan otomatis bikin/lookup kontak + conversation.</p>
          <p>✅ Chatbot onboarding (3 pertanyaan) akan jalan untuk kontak baru.</p>
          <p>✅ UI Inbox menerima pesan secara realtime tanpa refresh.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  async function load() {
    const { data } = await supabase.from("products").select("*").order("sort_order");
    setProducts(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name) return;
    const { error } = await supabase.from("products").insert({ name, description: desc });
    if (error) toast.error(error.message);
    else { setName(""); setDesc(""); load(); toast.success("Produk ditambahkan"); }
  }

  async function toggle(id: string, active: boolean) {
    await supabase.from("products").update({ is_active: !active }).eq("id", id);
    load();
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Tambah Produk</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nama produk" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="Deskripsi (opsional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button onClick={add}>Tambah</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Daftar Produk</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b py-2">
                <div>
                  <div className="font-medium">{p.name} {!p.is_active && <Badge variant="secondary">nonaktif</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggle(p.id, p.is_active)}>
                  {p.is_active ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </div>
            ))}
            {!products.length && <p className="text-sm text-muted-foreground">Belum ada produk.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
