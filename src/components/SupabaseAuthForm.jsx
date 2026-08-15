import { useId, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { Field, Input, Panel } from "./ui/primitives";

// Replaces @supabase/auth-ui-react, which is deprecated and pinned to React 18.
// Covers what the old <Auth> element provided here: email/password sign-in,
// sign-up, Google OAuth, and password reset. Session state is not tracked
// locally -- AuthProvider's onAuthStateChange listener picks it up and
// LoginPage redirects once a session exists.

const MODES = {
  signIn: {
    submitLabel: "Sign in",
    pendingLabel: "Signing in...",
    alt: "Don't have an account? Sign up",
    altMode: "signUp",
  },
  signUp: {
    submitLabel: "Create account",
    pendingLabel: "Creating account...",
    alt: "Already have an account? Sign in",
    altMode: "signIn",
  },
  reset: {
    submitLabel: "Send reset link",
    pendingLabel: "Sending...",
    alt: "Back to sign in",
    altMode: "signIn",
  },
};

export default function SupabaseAuthForm({ redirectTo }) {
  const [mode, setMode] = useState("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const emailId = useId();
  const passwordId = useId();

  const config = MODES[mode];

  function switchMode(nextMode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setPassword("");
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (resetError) throw resetError;
        setNotice("Check your inbox for a password reset link.");
      } else if (mode === "signUp") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (signUpError) throw signUpError;
        // With email confirmation enabled Supabase returns a user but no
        // session; nothing will happen on screen unless we say so.
        if (!data?.session) {
          setNotice("Account created. Check your inbox to confirm your email.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        // No success branch: AuthProvider observes the new session.
      }
    } catch (submitError) {
      setError(submitError?.message || "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
      // On success the browser navigates away to Google.
    } catch (oauthError) {
      setError(oauthError?.message || "Could not start Google sign-in.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={pending}
        className="sc-button is-dark w-full justify-center disabled:cursor-not-allowed"
      >
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
        <span className="h-px flex-1 bg-[var(--sc-border)]" />
        or
        <span className="h-px flex-1 bg-[var(--sc-border)]" />
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label="Email" htmlFor={emailId}>
          <Input
            id={emailId}
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(changeEvent) => setEmail(changeEvent.target.value)}
          />
        </Field>

        {mode !== "reset" ? (
          <Field
            label="Password"
            htmlFor={passwordId}
            action={
              mode === "signIn" ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => switchMode("reset")}
                >
                  Forgot password?
                </button>
              ) : null
            }
          >
            <Input
              id={passwordId}
              type="password"
              value={password}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              required
              minLength={mode === "signUp" ? 6 : undefined}
              onChange={(changeEvent) => setPassword(changeEvent.target.value)}
            />
          </Field>
        ) : null}

        {error ? (
          <Panel variant="light" className="p-3 text-sm text-[var(--sc-live-ink)]" role="alert">
            {error}
          </Panel>
        ) : null}

        {notice ? (
          <Panel variant="light" className="p-3 text-sm" role="status">
            {notice}
          </Panel>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="sc-button is-dark w-full justify-center disabled:cursor-not-allowed"
        >
          {pending ? config.pendingLabel : config.submitLabel}
        </button>
      </form>

      <button
        type="button"
        className="text-sm underline text-ink-muted"
        onClick={() => switchMode(config.altMode)}
      >
        {config.alt}
      </button>
    </div>
  );
}
