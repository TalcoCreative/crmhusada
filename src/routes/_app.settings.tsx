import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// tabs replaced with custom pill nav
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Husada CRM" }] }),
  component: SettingsPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function SettingsPage() {
  const [tab, setTab] = useState("gateway");
  const tabs = [
    { v: "gateway", label: "WhatsApp Gateway" },
    { v: "quick", label: "Quick Replies" },
    { v: "products", label: "Produk" },
    { v: "team", label: "Tim Agent" },
    { v: "webhook", label: "Webhook" },
  ];
  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Konfigurasi sistem, integrasi WhatsApp, tim, dan template balasan cepat.</p>
      </header>

      {/* Segmented pill nav — wraps cleanly on mobile */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-card border glow-soft">
        {tabs.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs md:text-sm font-medium transition-all ${
              tab === t.v ? "bg-primary text-primary-foreground glow-primary" : "text-foreground/70 hover:bg-accent"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "gateway" && <FonnteTab />}
        {tab === "quick" && <QuickRepliesTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "team" && <TeamTab />}
        {tab === "webhook" && <WebhookTab />}
      </div>
    </div>
  );
}


function QuickRepliesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  async function load() {
    const { data } = await supabase.from("templates").select("*").eq("is_quick_reply", true).order("sort_order");
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !content.trim()) return toast.error("Nama & isi wajib diisi");
    const { error } = await supabase.from("templates").insert({
      name, content, is_quick_reply: true, sort_order: (rows[rows.length - 1]?.sort_order || 0) + 1, category: "custom",
    });
    if (error) toast.error(error.message);
    else { setName(""); setContent(""); load(); toast.success("Quick reply ditambahkan"); }
  }
  async function update(id: string, patch: any) {
    const { error } = await supabase.from("templates").update(patch).eq("id", id);
    if (error) toast.error(error.message); else load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Dihapus"); load(); }
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Tambah Quick Reply</CardTitle>
          <CardDescription>Gunakan placeholder <code className="text-xs bg-muted px-1 rounded">{"{agent}"}</code> untuk otomatis isi nama agent yang membalas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nama template (cth: Opening)" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea rows={3} placeholder="Isi pesan..." value={content} onChange={(e) => setContent(e.target.value)} />
          <Button onClick={add}>Tambah</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Daftar Quick Replies ({rows.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border rounded-md p-3 space-y-2">
              <Input value={r.name} onChange={(e) => setRows(rows.map(x => x.id === r.id ? { ...x, name: e.target.value } : x))}
                onBlur={() => update(r.id, { name: r.name })} className="font-medium" />
              <Textarea rows={2} value={r.content}
                onChange={(e) => setRows(rows.map(x => x.id === r.id ? { ...x, content: e.target.value } : x))}
                onBlur={() => update(r.id, { content: r.content })} />
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r.id)}>Hapus</Button>
              </div>
            </div>
          ))}
          {!rows.length && <p className="text-sm text-muted-foreground">Belum ada quick reply.</p>}
        </CardContent>
      </Card>
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
    if (!res.ok) { toast.error(j.error || "Gagal menyimpan"); return; }
    if (j.device) { setDevice(j.device); toast.success(`Tersimpan · Device terhubung: ${j.device}`); }
    else { toast.success("Tersimpan (device tidak terdeteksi, periksa token)"); }
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
    if (j.ok) toast.success("Gateway terkoneksi!");
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
    else toast.error(j.error || JSON.stringify(j.gateway || j.fonnte));
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="size-5" /> WhatsApp Gateway API Key</CardTitle>
          <CardDescription>
            Hubungkan WhatsApp Gateway untuk mengirim dan menerima pesan otomatis. Token didapat dari dashboard penyedia gateway Anda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {device && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <div>
                <div className="font-medium text-emerald-700 dark:text-emerald-300">Device Aktif</div>
                <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80 font-mono">{device}</div>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>API Token</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Token gateway WhatsApp" />
            <p className="text-[11px] text-muted-foreground">Setelah Simpan, sistem otomatis mendeteksi nomor device dari token ini.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nomor Device (opsional, otomatis terdeteksi)</Label>
            <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="628xxx (otomatis)" />
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
                {testResult.ok ? "Gateway terhubung" : "Gagal terhubung"}
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
        <CardTitle>Webhook URL untuk WhatsApp Gateway</CardTitle>
        <CardDescription>Copy URL ini ke <strong>dashboard gateway Anda → Device → URL Webhook</strong>, lalu centang event <em>incoming</em>.</CardDescription>
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

function TeamTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  // Add-agent form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("62");
  const [role, setRole] = useState("agent");

  async function load() {
    setLoading(true);
    const [{ data: u }, { data: profiles }, { data: roles }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("id, email, full_name, position, phone, created_at").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setMe(u.user?.id || null);
    const roleMap: Record<string, string[]> = {};
    (roles || []).forEach((r: any) => { roleMap[r.user_id] = [...(roleMap[r.user_id] || []), r.role]; });
    setRows((profiles || []).map((p: any) => ({ ...p, roles: roleMap[p.id] || [] })));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function callManageAgent(body: any) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Gagal");
    return j;
  }

  function normPhone(v: string): string {
    const d = v.replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) return "62" + d.slice(1);
    if (d.startsWith("62")) return d;
    return "62" + d;
  }

  async function addAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      toast.error("Nama, email, dan password (min 6) wajib diisi");
      return;
    }
    setBusy(true);
    try {
      await callManageAgent({ action: "create", full_name: fullName, email, password, position, phone: normPhone(phone), role });
      toast.success(`Agent ${fullName} ditambahkan`);
      setFullName(""); setEmail(""); setPassword(""); setPosition(""); setPhone("62"); setRole("agent");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function deleteAgent(id: string, name: string) {
    if (id === me) { toast.error("Tidak bisa hapus akun sendiri"); return; }
    if (!confirm(`Hapus agent "${name}"? Aksi ini permanen.`)) return;
    setBusy(true);
    try {
      await callManageAgent({ action: "delete", user_id: id });
      toast.success("Agent dihapus");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function savePosition(id: string, value: string) {
    try {
      await callManageAgent({ action: "update", user_id: id, position: value });
      toast.success("Jabatan diperbarui");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Tambah Agent Baru</CardTitle>
          <CardDescription>
            Buat akun agent langsung — tanpa konfirmasi email. Pendaftaran mandiri di halaman login sudah dinonaktifkan, semua akun dibuat dari sini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addAgent} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nama Lengkap</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Andi" />
            </div>
            <div className="space-y-1.5">
              <Label>Jabatan</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="cth: Front Office, Dokter, Supervisor" />
            </div>
            <div className="space-y-1.5">
              <Label>No. WhatsApp (62...)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6281234567890" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@husada.id" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busy} className="w-full md:w-auto">
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />}Tambah Agent
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tim Agent ({rows.length})</CardTitle>
          <CardDescription>Semua agent dapat melihat & membalas chat di Inbox secara real-time.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Memuat...</div>
          ) : (
            <div className="border rounded-md divide-y">
              {rows.map((r) => (
                <div key={r.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      {r.full_name || r.email}
                      {r.id === me && <Badge variant="outline" className="text-[10px]">Anda</Badge>}
                      {r.roles.map((role: string) => (
                        <Badge key={role} variant={role.includes("admin") ? "default" : "secondary"} className="text-[10px]">
                          {role}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                  </div>
                  <Input
                    defaultValue={r.position || ""}
                    placeholder="Jabatan..."
                    className="h-9 text-xs w-full md:w-44"
                    onBlur={(e) => {
                      if (e.target.value !== (r.position || "")) savePosition(r.id, e.target.value);
                    }}
                  />
                  <Input
                    defaultValue={r.phone || ""}
                    placeholder="62..."
                    className="h-9 text-xs w-full md:w-40"
                    onBlur={async (e) => {
                      const v = e.target.value.trim();
                      if (v !== (r.phone || "")) {
                        try { await callManageAgent({ action: "update", user_id: r.id, phone: v }); toast.success("Nomor diperbarui"); load(); }
                        catch (err: any) { toast.error(err.message); }
                      }
                    }}
                  />
                  <Button
                    size="sm" variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    disabled={busy || r.id === me}
                    onClick={() => deleteAgent(r.id, r.full_name || r.email)}
                  >
                    Hapus
                  </Button>
                </div>
              ))}
              {!rows.length && <p className="p-3 text-sm text-muted-foreground">Belum ada anggota tim.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
