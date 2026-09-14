import { useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { Button, Eyebrow, TextTabs, inputCls } from "../components/ui";
import { PRIVACY_URL, TERMS_URL } from "../lib/legal";

/**
 * Create an account or sign in to one.
 *
 * No passwords are stored or checked here — Supabase Auth owns all of that,
 * including hashing, email confirmation and resets. This screen only collects
 * two fields and reports what came back, which is the correct amount of
 * authentication code to write by hand.
 *
 * It is the first screen on a new install, and the only one that needs a
 * network. After it, the session persists and every other screen works offline.
 */

type Mode = "in" | "up";

/** Supabase's messages are terse and occasionally cryptic; these are not. */
function explain(raw: string, mode: Mode) {
  const m = raw.toLowerCase();
  if (m.includes("invalid login"))
    return "That email and password don't match an account.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "There's already an account with that email. Try signing in instead.";
  if (m.includes("email not confirmed"))
    return "Confirm your email first — check your inbox for the link.";
  if (m.includes("password") && m.includes("6"))
    return "Passwords need to be at least 6 characters.";
  if (m.includes("invalid") && m.includes("email"))
    return "The account service rejected that address. Use an inbox you can actually open, or continue with Google instead.";
  if (
    m.includes("sending") ||
    m.includes("smtp") ||
    m.includes("confirmation email")
  )
    return "The confirmation email could not be sent. Continue with Google instead — it needs no email.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Signing up sends a confirmation email, and only a couple are allowed per hour — wait, or continue with Google, which sends none.";
  if (m.includes("fetch") || m.includes("network"))
    return `You appear to be offline. ${mode === "up" ? "Creating an account" : "Signing in"} needs a connection.`;
  return raw;
}

export function SignIn({
  onSkip,
  skipLabel = "Use without an account",
  skipNote = "Without an account everything still works, but your logs live only on this device and go with it.",
}: {
  onSkip: () => void;
  /**
   * What leaving without signing in is called here.
   *
   * This screen is no longer the front door — it is opened deliberately, from
   * Settings, by somebody who already has their logs on the device. "Use
   * without an account" is the right words for a first run and the wrong ones
   * for that, where the honest label is simply "not now".
   */
  skipLabel?: string;
  skipNote?: string;
}) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  /**
   * Why the form cannot be sent yet, in words, or `null` when it can.
   *
   * This used to be a boolean that disabled the button, which is how a tap
   * came to do nothing at all: a white pill at forty percent opacity on a
   * black ground does not read as disabled, so the button looked live, did
   * nothing when pressed, and said nothing about why. A control that declines
   * has to give a reason — the reason is the whole point of declining.
   *
   * The six-character minimum is checked only when creating an account,
   * because it is a rule about new passwords. Applied to signing in it locks
   * out anyone whose existing password is shorter — they could not even
   * attempt it, since the button would never enable. What an existing
   * password has to be is between the account and the server.
   */
  function problem(): string | null {
    if (!email.trim()) return "Enter your email address.";
    if (!emailOk) return "That does not look like an email address.";
    if (!password) return "Enter your password.";
    if (mode === "up" && password.length < 6)
      return "Passwords need to be at least 6 characters.";
    return null;
  }

  async function submit() {
    const missing = problem();
    if (missing) {
      setErr(missing);
      setNote(null);
      return;
    }
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      if (mode === "up") {
        const msg = await auth.signUp(email.trim(), password);
        if (msg) setNote(msg);
      } else {
        await auth.signIn(email.trim(), password);
      }
    } catch (e) {
      setErr(explain(e instanceof Error ? e.message : String(e), mode));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!emailOk) {
      setErr("Enter your email address first, then tap this again.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await auth.resetPassword(email.trim());
      setNote("Password reset link sent. Check your email.");
    } catch (e) {
      setErr(explain(e instanceof Error ? e.message : String(e), mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+26px)] pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex-1">
        <div className="pt-[10vh]">
          <Eyebrow>Gym Log</Eyebrow>
          <h1 className="mt-4 text-[1.8125rem] font-bold leading-[1.1] tracking-[-0.028em] text-pretty">
            {mode === "up"
              ? "Create an account and your training is never only on this phone."
              : "Welcome back."}
          </h1>
          <p className="mt-3 text-[0.875rem] leading-relaxed text-muted text-pretty">
            {mode === "up"
              ? "Every workout is saved to your account and to this device. After this you never need signal again."
              : "Sign in and this device catches up with everything you have logged elsewhere."}
          </p>
        </div>

        <TextTabs
          className="pt-7"
          gap="gap-6"
          options={[
            { id: "in" as Mode, label: "Sign in" },
            { id: "up" as Mode, label: "Create account" },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErr(null);
            setNote(null);
          }}
        />

        <div className="pt-5">
          <label className="block">
            <Eyebrow className="mb-1.5 block tracking-[0.18em]">Email</Eyebrow>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              className={inputCls}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="mt-5 block">
            <Eyebrow className="mb-1.5 block tracking-[0.18em]">
              Password
            </Eyebrow>
            <input
              type="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              className={inputCls}
              placeholder={
                mode === "up" ? "At least 6 characters" : "Your password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                // Not gated on the form being valid: Enter on an incomplete
                // form should say what is missing, exactly as the button does.
                if (e.key === "Enter") void submit();
              }}
            />
          </label>

          {mode === "in" && (
            <button
              onClick={() => void forgot()}
              className="mt-3.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted active:text-fg"
            >
              Forgot password
            </button>
          )}
        </div>

        {err && (
          <p className="mt-5 text-[0.8125rem] leading-relaxed text-danger text-pretty">
            {err}
          </p>
        )}
        {note && (
          <p className="mt-5 text-[0.8125rem] leading-relaxed text-fg text-pretty">
            {note}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-7">
        {/* Disabled only while a request is in flight. Everything else it
            might object to, it objects to out loud in `submit`. */}
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
        </Button>

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-rule" />
          <Eyebrow tone="dim" className="tracking-[0.18em]">
            or
          </Eyebrow>
          <span className="h-px flex-1 bg-rule" />
        </div>

        <Button
          variant="outline"
          onClick={() => void auth.signInWithGoogle()}
          disabled={busy}
        >
          <GoogleMark />
          Continue with Google
        </Button>

        {/* Directly under both buttons that make an account, because this is
            the moment the agreement is actually entered into — a link filed
            away in Settings is a document nobody was asked about. It stays put
            in either mode: signing in on a new device is also a moment to be
            told what you are signing into. */}
        <p className="px-1 text-center text-[0.75rem] leading-relaxed text-dim text-pretty">
          By continuing you agree to the <LegalLink href={TERMS_URL}>Terms</LegalLink> and
          the <LegalLink href={PRIVACY_URL}>Privacy&nbsp;Policy</LegalLink>.
        </p>

        <Button variant="quiet" onClick={onSkip}>
          {skipLabel}
        </Button>
        <p className="px-1 text-center text-[0.6875rem] leading-relaxed text-dim text-pretty">
          {skipNote}
        </p>
      </div>
    </div>
  );
}

/**
 * A link inside a sentence, which is the one place in the app where a target
 * smaller than 44px is unavoidable: the words have to stay in the line they
 * belong to. The vertical padding is there anyway — on an inline box it grows
 * what the finger can hit without moving the line it sits on.
 */
function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="-my-1 py-1 text-muted underline decoration-[1.5px] underline-offset-[3px] active:text-fg"
    >
      {children}
    </a>
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
