import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setState({ session, user: session?.user ?? null, loading: false });
    });
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, user: data.session?.user ?? null, loading: false });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}
