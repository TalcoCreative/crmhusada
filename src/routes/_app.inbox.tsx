import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Search, Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Husada CRM" }] }),
  component: InboxPage,
});

type Conversation = {
  id: string;
  contact_id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact?: { id: string; full_name: string | null; whatsapp_number: string };
};

type Message = {
  id: string;
  conversation_id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  sent_at: string;
  sent_by_id: string | null;
  status: string;
};

function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations
  async function loadConversations() {
    const { data } = await supabase
      .from("conversations")
      .select("*, contact:contacts(id, full_name, whatsapp_number)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100);
    setConversations((data as any) || []);
  }

  useEffect(() => { loadConversations(); }, []);

  // Realtime conversation list updates
  useEffect(() => {
    const ch = supabase
      .channel("inbox-conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        loadConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("sent_at", { ascending: true });
      setMessages((data as any) || []);
      // mark read
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);
    })();
  }, [activeId]);

  // Realtime messages for active conversation (mirroring)
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`messages-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === (payload.new as any).id)) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return conversations.filter((c) =>
      !q ||
      c.contact?.full_name?.toLowerCase().includes(q) ||
      c.contact?.whatsapp_number?.includes(q)
    );
  }, [conversations, search]);

  const active = conversations.find((c) => c.id === activeId);

  async function sendMessage() {
    if (!text.trim() || !activeId) return;
    setSending(true);
    const content = text.trim();
    setText("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://iqllohqbaqmdiyojygow.supabase.co/functions/v1/fonnte-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ conversation_id: activeId, content }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok || !json.ok) {
      toast.error(json.error || "Gagal kirim pesan");
      setText(content);
    }
  }

  return (
    <div className="h-full flex">
      {/* Conversation list */}
      <div className={cn("w-full md:w-80 border-r flex flex-col", activeId && "hidden md:flex")}>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kontak…" className="pl-8" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Belum ada percakapan.<br />
              <span className="text-xs">Pesan masuk via Fonnte webhook akan muncul di sini.</span>
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                "w-full text-left px-4 py-3 border-b hover:bg-accent flex flex-col gap-1",
                activeId === c.id && "bg-accent"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate">
                  {c.contact?.full_name || c.contact?.whatsapp_number}
                </span>
                {c.unread_count > 0 && (
                  <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                    {c.unread_count}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">{c.last_message_preview || "—"}</div>
              <div className="text-[10px] text-muted-foreground">
                {c.last_message_at && formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: idLocale })}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className={cn("flex-1 flex flex-col", !activeId && "hidden md:flex")}>
        {!active ? (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
            Pilih percakapan untuk mulai chat.
          </div>
        ) : (
          <>
            <header className="px-4 py-3 border-b flex items-center justify-between bg-card">
              <div>
                <button className="md:hidden text-xs text-primary mb-1" onClick={() => setActiveId(null)}>← Kembali</button>
                <div className="font-semibold">{active.contact?.full_name || "Tanpa nama"}</div>
                <div className="text-xs text-muted-foreground">{active.contact?.whatsapp_number}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveId(activeId)}>
                <RefreshCcw className="size-4" />
              </Button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-2 bg-muted/30">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "OUTBOUND" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                      m.direction === "OUTBOUND"
                        ? "bg-chat-out text-chat-out-foreground rounded-br-sm"
                        : "bg-chat-in text-chat-in-foreground border rounded-bl-sm"
                    )}
                  >
                    {m.content}
                    <div className="text-[10px] opacity-60 mt-1 text-right">
                      {new Date(m.sent_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="text-center text-xs text-muted-foreground">Belum ada pesan.</p>}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="border-t p-3 flex gap-2 bg-card"
            >
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ketik pesan…"
                disabled={sending}
                autoFocus
              />
              <Button type="submit" disabled={sending || !text.trim()}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
