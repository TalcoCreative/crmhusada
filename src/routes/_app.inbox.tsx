import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Send, Search, Loader2, User as UserIcon, Tag, Zap, FileText, MoreVertical, StickyNote, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Husada CRM" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s.c === "string" ? s.c : undefined }),
  component: () => <InboxView mineOnly={false} />,
});

export type Profile = { id: string; full_name: string | null; email: string };
export type Stage = { id: string; name: string; color: string | null };
export type Contact = {
  id: string; full_name: string | null; whatsapp_number: string;
  stage_id: string | null; interested_product_id: string | null;
  chief_complaint: string | null; domicile: string | null;
};
export type Conversation = {
  id: string; contact_id: string; status: string;
  assigned_agent_id: string | null; last_replied_by_id: string | null;
  last_message_at: string | null; last_message_preview: string | null;
  unread_count: number; contact?: Contact;
};
type Message = {
  id: string; conversation_id: string;
  direction: "INBOUND" | "OUTBOUND"; content: string;
  sent_at: string; sent_by_id: string | null; status: string;
  type: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "INTERNAL_NOTE";
};
type QuickReply = { id: string; name: string; content: string; sort_order: number };
type Product = { id: string; name: string };

type ComposeMode = "reply" | "note";

export function InboxView({ mineOnly }: { mineOnly: boolean }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [stages, setStages] = useState<Stage[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposeMode>("reply");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    let q = supabase
      .from("conversations")
      .select("*, contact:contacts(id, full_name, whatsapp_number, stage_id, interested_product_id, chief_complaint, domicile)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300);
    if (mineOnly && user) q = q.eq("assigned_agent_id", user.id);
    const { data } = await q;
    setConversations((data as any) || []);
  }

  async function loadMeta() {
    const [p, s, pr, qr] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("stages").select("id, name, color").order("order_index"),
      supabase.from("products").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("templates").select("id, name, content, sort_order").eq("is_quick_reply", true).order("sort_order"),
    ]);
    const pmap: Record<string, Profile> = {};
    (p.data || []).forEach((x: any) => { pmap[x.id] = x; });
    setProfiles(pmap);
    setAgents((p.data as any) || []);
    setStages((s.data as any) || []);
    setProducts((pr.data as any) || []);
    setQuickReplies((qr.data as any) || []);
  }

  useEffect(() => { loadConversations(); loadMeta(); }, [mineOnly, user?.id]);

  // Auto-select conversation from ?c= query param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c) setActiveId(c);
  }, [conversations.length]);

  // Online heartbeat — update last_seen_at every 60s
  useEffect(() => {
    if (!user) return;
    const beat = () => supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
    beat();
    const t = setInterval(beat, 60_000);
    return () => clearInterval(t);
  }, [user?.id]);

  useEffect(() => {
    const ch = supabase.channel("inbox-all-" + (mineOnly ? "mine" : "team"))
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConversations())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contacts" }, () => loadConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "templates" }, () => loadMeta())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [mineOnly, user?.id]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase.from("messages").select("*")
        .eq("conversation_id", activeId).order("sent_at", { ascending: true });
      setMessages((data as any) || []);
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);
    })();
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const ch = supabase.channel(`messages-${activeId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        (payload) => setMessages((prev) => prev.find((m) => m.id === (payload.new as any).id) ? prev : [...prev, payload.new as Message]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return conversations.filter((c) => !q ||
      c.contact?.full_name?.toLowerCase().includes(q) ||
      c.contact?.whatsapp_number?.includes(q));
  }, [conversations, search]);

  const active = conversations.find((c) => c.id === activeId);
  const activeProductName = active?.contact?.interested_product_id
    ? products.find((p) => p.id === active.contact?.interested_product_id)?.name : null;

  async function sendMessage(payload?: string) {
    const content = (payload ?? text).trim();
    if (!content || !activeId) return;
    setSending(true);
    const textBackup = content;
    setText("");

    if (mode === "note") {
      // Internal note: insert directly, never sent to user via Fonnte
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeId,
        direction: "OUTBOUND",
        type: "INTERNAL_NOTE",
        content,
        sent_by_id: user?.id || null,
        status: "SENT",
      } as any);
      setSending(false);
      if (error) { toast.error(error.message); setText(textBackup); return; }
      toast.success("Catatan internal disimpan");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://iqllohqbaqmdiyojygow.supabase.co/functions/v1/fonnte-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ conversation_id: activeId, content }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok || !json.ok) { toast.error(json.error || "Gagal kirim"); setText(textBackup); return; }
    // Log reply
    if (user) {
      await supabase.from("activity_logs").insert({
        user_id: user.id, action: "reply_message",
        entity_type: "conversation", entity_id: activeId,
        metadata: {
          contact_name: active?.contact?.full_name, whatsapp: active?.contact?.whatsapp_number,
          length: content.length,
        },
      } as any);
    }
  }

  async function logAction(action: string, metadata: Record<string, any> = {}) {
    if (!user) return;
    await supabase.from("activity_logs").insert({
      user_id: user.id, action,
      entity_type: "conversation", entity_id: activeId,
      metadata,
    } as any);
  }

  async function assignAgent(agentId: string | null) {
    if (!activeId) return;
    const prev = active?.assigned_agent_id || null;
    const { error } = await supabase.from("conversations").update({ assigned_agent_id: agentId }).eq("id", activeId);
    if (error) return toast.error(error.message);
    await logAction("assign_agent", {
      contact_name: active?.contact?.full_name, whatsapp: active?.contact?.whatsapp_number,
      from_agent: prev, to_agent: agentId,
      from_name: agentName(prev), to_name: agentName(agentId),
    });
    toast.success(agentId ? `Ditugaskan ke ${agentName(agentId)}` : "Penugasan dihapus");
    loadConversations();
  }

  async function changeStage(stageId: string) {
    if (!active?.contact_id) return;
    const prevStageId = active.contact?.stage_id || null;
    const { error } = await supabase.from("contacts").update({ stage_id: stageId }).eq("id", active.contact_id);
    if (error) return toast.error(error.message);
    await logAction("change_stage", {
      contact_name: active.contact?.full_name, whatsapp: active.contact?.whatsapp_number,
      from_stage: stages.find((s) => s.id === prevStageId)?.name || null,
      to_stage: stages.find((s) => s.id === stageId)?.name || null,
    });
    toast.success("Stage diperbarui");
    loadConversations();
  }

  async function deleteConversation() {
    if (!active) return;
    // Delete conversation (cascade removes messages). Reset chatbot_state so the next inbound restarts the bot — but keep the lead (contact) so name/phone/keluhan get UPDATED in place on the next round.
    const { error: delErr } = await supabase.from("conversations").delete().eq("id", active.id);
    if (delErr) return toast.error(delErr.message);
    await supabase.from("contacts").update({ chatbot_state: null }).eq("id", active.contact_id);
    await logAction("delete_chat", {
      contact_name: active.contact?.full_name, whatsapp: active.contact?.whatsapp_number,
      message_count: messages.length,
    });
    toast.success("Percakapan dihapus. Bot akan menanyakan ulang saat pesan berikutnya masuk.");
    setActiveId(null);
    loadConversations();
  }

  function agentName(id: string | null) {
    if (!id) return "Sistem";
    const p = profiles[id];
    return p?.full_name || p?.email?.split("@")[0] || "Agent";
  }

  function applyQuickReply(content: string) {
    const myName = agentName(user?.id || null);
    const filled = content.replace(/\{agent\}/g, myName);
    setText(filled);
    setMode("reply");
  }

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 h-[calc(100vh-7rem)]">
      <div className="h-full flex bg-card glow-soft rounded-2xl overflow-hidden border">
        {/* List */}
        <div className={cn("w-full md:w-[340px] border-r flex flex-col", activeId && "hidden md:flex")}>
          <div className="p-3 border-b">
            <div className="text-sm font-semibold mb-2">{mineOnly ? "Inbox Saya" : "Semua Inbox"}</div>
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kontak..." className="pl-8" />
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live · {conversations.length} percakapan
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Belum ada percakapan{mineOnly ? " yang ditugaskan kepada Anda." : "."}
              </div>
            )}
            {filtered.map((c) => {
              const stage = stages.find((s) => s.id === c.contact?.stage_id);
              return (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className={cn("w-full text-left px-4 py-3 border-b hover:bg-accent/60 flex flex-col gap-1 transition-colors",
                    activeId === c.id && "bg-accent")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {c.contact?.full_name || "Tanpa nama"}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 shrink-0 glow-primary">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{c.contact?.whatsapp_number}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.last_message_preview || "—"}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {stage && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: (stage.color || "#888") + "20", color: stage.color || "inherit" }}>
                        {stage.name}
                      </span>
                    )}
                    {c.assigned_agent_id ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                        <UserIcon className="size-2.5" /> {agentName(c.assigned_agent_id)}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        Belum ditugaskan
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {c.last_message_at && formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: idLocale })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat panel */}
        <div className={cn("flex-1 flex flex-col min-w-0", !activeId && "hidden md:flex")}>
          {!active ? (
            <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
              Pilih percakapan untuk mulai chat.
            </div>
          ) : (
            <>
              <header className="px-4 py-3 border-b bg-card/80 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button className="md:hidden text-xs text-primary mb-1" onClick={() => setActiveId(null)}>← Kembali</button>
                    <div className="font-semibold text-base truncate">{active.contact?.full_name || "Tanpa nama"}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      <span>{active.contact?.whatsapp_number}</span>
                      {activeProductName && <span>· {activeProductName}</span>}
                    </div>
                    {/* Keluhan + extras: desktop only */}
                    <div className="hidden md:block">
                      {active.contact?.domicile && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">{active.contact.domicile}</div>
                      )}
                      {active.contact?.chief_complaint && (
                        <div className="text-[11px] text-muted-foreground mt-1 italic line-clamp-1">
                          Keluhan: {active.contact.chief_complaint}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Desktop quick actions */}
                  <div className="hidden md:flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Tag className="size-3.5 text-muted-foreground" />
                      <Select value={active.contact?.stage_id || ""} onValueChange={changeStage}>
                        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Stage" /></SelectTrigger>
                        <SelectContent>
                          {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserIcon className="size-3.5 text-muted-foreground" />
                      <Select value={active.assigned_agent_id || "unassigned"}
                        onValueChange={(v) => assignAgent(v === "unassigned" ? null : v)}>
                        <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Agent" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Belum ditugaskan</SelectItem>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.full_name || a.email?.split("@")[0]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {user && active.assigned_agent_id !== user.id && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => assignAgent(user.id)}>
                        Ambil chat
                      </Button>
                    )}
                    <DeleteChatButton onConfirm={deleteConversation} variant="desktop" />
                  </div>

                  {/* Mobile actions menu */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="icon" variant="ghost" className="md:hidden h-9 w-9 shrink-0">
                        <MoreVertical className="size-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3 space-y-3" align="end">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                          <Tag className="size-3" /> Stage
                        </div>
                        <Select value={active.contact?.stage_id || ""} onValueChange={changeStage}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pilih stage" /></SelectTrigger>
                          <SelectContent>
                            {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                          <UserIcon className="size-3" /> Tugaskan agent
                        </div>
                        <Select value={active.assigned_agent_id || "unassigned"}
                          onValueChange={(v) => assignAgent(v === "unassigned" ? null : v)}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Belum ditugaskan</SelectItem>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.full_name || a.email?.split("@")[0]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {user && active.assigned_agent_id !== user.id && (
                        <Button size="sm" className="w-full h-9 text-xs" onClick={() => assignAgent(user.id)}>
                          Ambil chat ini
                        </Button>
                      )}
                      <DeleteChatButton onConfirm={deleteConversation} variant="mobile" />
                      {active.contact?.chief_complaint && (
                        <div className="text-[11px] text-muted-foreground pt-2 border-t italic">
                          Keluhan: {active.contact.chief_complaint}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3 bg-muted/30">
                {messages.map((m) => {
                  if (m.type === "INTERNAL_NOTE") {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[85%] rounded-xl border border-amber-400/50 bg-amber-100/70 dark:bg-amber-500/10 px-3 py-2 text-xs shadow-sm">
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 mb-1">
                            <StickyNote className="size-3" />
                            Catatan Internal · {agentName(m.sent_by_id)}
                          </div>
                          <div className="whitespace-pre-wrap break-words text-amber-900 dark:text-amber-100">{m.content}</div>
                          <div className="text-[10px] opacity-60 mt-1 text-right">
                            {new Date(m.sent_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const out = m.direction === "OUTBOUND";
                  return (
                    <div key={m.id} className={cn("flex flex-col gap-0.5", out ? "items-end" : "items-start")}>
                      <span className="text-[10px] text-muted-foreground px-1">
                        {out ? agentName(m.sent_by_id) : (active.contact?.full_name || "Pelanggan")}
                      </span>
                      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                        out ? "bg-chat-out text-chat-out-foreground rounded-br-sm"
                            : "bg-chat-in text-chat-in-foreground border rounded-bl-sm")}>
                        {m.content}
                        <div className="text-[10px] opacity-60 mt-1 text-right">
                          {new Date(m.sent_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && <p className="text-center text-xs text-muted-foreground">Belum ada pesan.</p>}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="border-t p-3 bg-card space-y-2">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <div className="inline-flex rounded-full border bg-background p-0.5 text-[11px]">
                    <button type="button" onClick={() => setMode("reply")}
                      className={cn("px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors",
                        mode === "reply" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                      <MessageSquare className="size-3" /> Balas WA
                    </button>
                    <button type="button" onClick={() => setMode("note")}
                      className={cn("px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors",
                        mode === "note" ? "bg-amber-500 text-white" : "text-muted-foreground")}>
                      <StickyNote className="size-3" /> Catatan
                    </button>
                  </div>
                  {mode === "reply" && (
                    <>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1">
                            <Zap className="size-3" /> Quick Replies
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-1" align="start">
                          <div className="max-h-72 overflow-auto">
                            {quickReplies.length === 0 && (
                              <div className="p-3 text-xs text-muted-foreground">Belum ada template. Tambah di Settings.</div>
                            )}
                            {quickReplies.map((q) => (
                              <button key={q.id} type="button" onClick={() => applyQuickReply(q.content)}
                                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-xs">
                                <div className="font-medium">{q.name}</div>
                                <div className="text-muted-foreground line-clamp-2">{q.content}</div>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <div className="hidden sm:flex flex-wrap gap-1.5">
                        {quickReplies.slice(0, 3).map((q) => (
                          <button key={q.id} type="button" onClick={() => applyQuickReply(q.content)}
                            className="text-[11px] px-2 py-1 rounded-full border bg-background hover:bg-accent transition-colors flex items-center gap-1">
                            <FileText className="size-3" /> {q.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={mode === "note"
                      ? "Catatan internal — hanya dilihat agent..."
                      : `Balas sebagai ${agentName(user?.id || null)}...`}
                    disabled={sending}
                    className={mode === "note" ? "bg-amber-50 dark:bg-amber-500/10 border-amber-300" : ""}
                    autoFocus />
                  <Button type="submit" disabled={sending || !text.trim()}
                    className={mode === "note" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}>
                    {sending ? <Loader2 className="size-4 animate-spin" /> :
                      mode === "note" ? <StickyNote className="size-4" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DeleteChatButton({ onConfirm, variant }: { onConfirm: () => void; variant: "desktop" | "mobile" }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "desktop" ? (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1">
            <Trash2 className="size-3.5" /> Hapus
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full h-9 text-xs text-destructive border-destructive/40 gap-1.5">
            <Trash2 className="size-3.5" /> Hapus percakapan
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus percakapan?</AlertDialogTitle>
          <AlertDialogDescription>
            Semua pesan dalam percakapan ini akan dihapus permanen. Data lead (nama, nomor, stage) tetap tersimpan di Leads.
            Saat user mengirim pesan baru, bot akan menanyakan ulang produk, domisili, dan keluhan — lalu mengupdate data lead.
            Tindakan ini akan dicatat di Log Aktivitas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Ya, hapus
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
