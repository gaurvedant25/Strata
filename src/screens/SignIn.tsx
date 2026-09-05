import { useState } from "react";
import { useAuth } from "../auth";
import { Button, Eyebrow } from "../components/ui";

/**
 * The first screen on a new install, and the only one that needs a network.
 *
 * Signing in happens once, at the point where you have just downloaded the app
 * and so demonstrably have signal. After that the session is persisted and
 * every other screen works offline — the account exists so a lost phone is not
 * a lost training history, not so the app can phone home.
 */
export function SignIn({ onSkip }: { onSkip: () => void }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      await auth.signInWithGoogle();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach Google. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+26px)] pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex-1 pt-[22vh]">
        <Eyebrow>Gym Log</Eyebrow>
        <h1 className="mt-4 text-[30px] font-bold leading-[1.1] tracking-[-0.028em] text-pretty">
          Sign in once, and your training is never only on this phone.
        </h1>
        <p className="mt-3.5 text-[14px] leading-relaxed text-muted text-pretty">
          Every workout is saved to your account and to this device. Lose the phone, clear your
          browser, switch to a tablet — it follows you.
        </p>
        <p className="mt-3.5 text-[14px] leading-relaxed text-muted text-pretty">
          After this you never need signal again. The app logs, scores and charts entirely offline
          and catches the account up whenever you next have a connection.
        </p>

        {err && <p className="mt-5 text-[13px] leading-relaxed text-danger">{err}</p>}
      </div>

      <div className="flex flex-col gap-3 pt-6">
        <Button onClick={() => void go()} disabled={busy}>
          <GoogleMark />
          {busy ? "Opening Google…" : "Continue with Google"}
        </Button>
        <Button variant="quiet" onClick={onSkip}>
          Use without an account
        </Button>
        <p className="px-1 pt-1 text-center text-[11px] leading-relaxed text-faint text-pretty">
          Without an account everything still works, but your logs live only on this device and go
          with it.
        </p>
      </div>
    </div>
  );
}

/** Google's mark, which their branding terms require be shown unrecoloured. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-2.7-.4-4H24v7.3h12.1c-.2 1.9-1.6 4.9-4.5 6.8l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.5z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.02-6.8 5.2-.1.3C7.9 41 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-6.9-5.3-.2.1A22 22 0 0 0 2 24c0 3.5.9 6.9 2.4 9.9l7.1-5.5z"
      />
      <path
        fill="#EB4335"
        d="M24 10.1c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.9 29.9 2 24 2 15.4 2 7.9 7 4.4 14.1l7.1 5.5C13.3 14.3 18.2 10.1 24 10.1z"
      />
    </svg>
  );
}
