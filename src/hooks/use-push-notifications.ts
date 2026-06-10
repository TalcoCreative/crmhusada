import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import husadaLogo from "@/assets/husada-logo-v2.png.asset.json";

/**
 * Foreground push notifications: requests browser Notification permission,
 * subscribes to realtime INBOUND messages, and shows a desktop/mobile
 * notification when a new patient message arrives.
 */
export function usePushNotifications(enabled: boolean) {
  const askedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    // Request permission once
    if (!askedRef.current && Notification.permission === "default") {
      askedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }

    // Realtime subscription for incoming messages
    const channel = supabase
      .channel("push-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "direction=eq.INBOUND" },
        async (payload: any) => {
          if (document.visibilityState === "visible") return; // skip if user is looking
          if (Notification.permission !== "granted") return;
          const msg = payload.new;
          // Fetch contact for nicer title
          let title = "Pesan WhatsApp baru";
          try {
            const { data: conv } = await supabase
              .from("conversations")
              .select("contact_id, contacts(full_name, whatsapp_number)")
              .eq("id", msg.conversation_id)
              .maybeSingle();
            const c: any = conv?.contacts;
            if (c) title = `Pesan dari ${c.full_name || c.whatsapp_number}`;
          } catch {}
          try {
            new Notification(title, {
              body: String(msg.content || "").slice(0, 140),
              icon: husadaLogo.url,
              badge: husadaLogo.url,
              tag: msg.conversation_id,
            });
          } catch {}
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [enabled]);
}
