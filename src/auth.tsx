import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudConfigured, redirectTo, supabase } from "./lib/supabase";
import { syncNow, type SyncState } from "./lib/sync";

type Auth = {
  /** False when the app was built without a Supabase project, i.e. local-only. */
  cloud: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  name: string | null;
  sync: SyncState;
  lastSyncedAt: number | null;
  signInWithGoogle: () => Promise<void>;
  /** Resolves to a message to show, or null when the session is already live. */
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Reconcile now. Safe to call when signed out — it does nothing. */
  push: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AuthProvider({ children, onSynced }: { children: ReactNode; onSynced: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!cloudConfigured);
  const [sync, setSync] = useState<SyncState>(cloudConfigured ? "idle" : "off");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const run = useCallback(async () => {
    const uid = session?.user.id;
    if (!supabase || !uid || running.current) return;
    running.current = true;
    setSync("syncing");
    try {
      await syncNow(uid);
      setLastSyncedAt(Date.now());
      setSync("idle");
      onSynced();
    } catch {
      // Offline or the server is unhappy. The local copy is untouched and
      // authoritative, so this is a state to report, never one to recover from.
      setSync("error");
    } finally {
      running.current = false;
    }
  }, [session?.user.id, onSynced]);

  // Reconcile on sign-in, whenever the network comes back, and when the app is
  // brought to the foreground — the three moments where this device is most
  // likely to be holding something the server has not seen.
  useEffect(() => {
    if (!session) return;
    void run();
    const onOnline = () => void run();
    const onVisible = () => document.visibilityState === "visible" && void run();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, run]);

  const value: Auth = {
    cloud: cloudConfigured,
    ready,
    session,
    email: session?.user.email ?? null,
    name:
      (session?.user.user_metadata?.full_name as string | undefined) ??
      (session?.user.user_metadata?.name as string | undefined) ??
      null,
    sync,
    lastSyncedAt,
    async signInWithGoogle() {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo() },
      });
    },
    async signUp(email, password) {
      if (!supabase) throw new Error("No account service is configured.");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
      // With email confirmation switched on, Supabase returns a user but no
      // session until the link is clicked; the caller has to say so rather than
      // silently appearing to have done nothing.
      if (!data.session) return "Check your email to confirm the address, then sign in.";
      return null;
    },
    async signIn(email, password) {
      if (!supabase) throw new Error("No account service is configured.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async resetPassword(email) {
      if (!supabase) throw new Error("No account service is configured.");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo(),
      });
      if (error) throw error;
    },
    /**
     * Sign out, whatever the network is doing.
     *
     * Both halves of this used to be unbounded awaits — a full sync, then a
     * request to the server to revoke the session — so on a slow or dead
     * connection the button did nothing at all, with no way to tell whether it
     * had been pressed. Being unable to leave an account because the server
     * cannot be reached is never what anyone wants, so every step is now capped
     * and the local session is dropped regardless of what the server says.
     */
    async signOut() {
      if (!supabase) return;
      // A last reconciliation, so anything logged since the previous one is not
      // stranded on a device about to forget it — but only if it is quick.
      await Promise.race([run(), wait(4000)]);
      try {
        await Promise.race([
          supabase.auth.signOut(),
          wait(5000).then(() => Promise.reject(new Error("timeout"))),
        ]);
      } catch {
        // Server unreachable or too slow. Forget the session on this device
        // anyway; the server's copy expires on its own.
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
      setSession(null);
      // Signing out should land on the sign-in screen, even for someone who
      // once chose to go without an account.
      localStorage.removeItem("gymlog.noAccount");
    },
    push: run,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
