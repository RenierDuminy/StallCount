import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { Card, Field, Input, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";

// Landing page for every link in StallCount's auth emails. The email templates
// link here as /auth/confirm?token_hash=...&type=..., and nothing is used up
// until this page calls verifyOtp. Mail scanners (Outlook Safe Links and the
// like) that open links before the person does therefore cannot spend the
// one-time token, which is what made the default {{ .ConfirmationURL }} links
// arrive "expired".
//
// invite / recovery  -> signed in, then asked to choose a password
// signup             -> email confirmed, signed in
// email_change       -> new address confirmed (Supabase may ask for both)

const MIN_PASSWORD_LENGTH = 8;
const OTP_TYPES = new Set(["invite", "recovery", "signup", "email_change", "email", "magiclink"]);
const PASSWORD_TYPES = new Set(["invite", "recovery"]);

// A token can be verified once. React's development double-run of effects (and
// a re-render while the request is in flight) must not send it twice, so the
// request is shared per token for the life of the page.
const verifications = new Map();

function verifyOnce(tokenHash, type) {
  const key = `${type}:${tokenHash}`;
  if (!verifications.has(key)) {
    verifications.set(key, supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  }
  return verifications.get(key);
}

function describeLinkError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("expired") || message.includes("invalid") || message.includes("not found")) {
    return "This link has expired or has already been used.";
  }
  return error?.message || "This link could not be used.";
}

const HEADINGS = {
  invite: {
    title: "Welcome to StallCount",
    description: "Choose a password to finish setting up your account.",
    submit: "Save password and continue",
  },
  recovery: {
    title: "Choose a new password",
    description: "Enter a new password for your StallCount account.",
    submit: "Save new password",
  },
};

export default function AuthConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tokenHash = params.get("token_hash");
  const rawType = params.get("type");
  const type = OTP_TYPES.has(rawType) ? rawType : null;

  // Supabase puts an error in the query or hash when it rejects a link itself.
  const linkError = (() => {
    const fromQuery = params.get("error_description");
    if (fromQuery) return fromQuery;
    if (typeof window === "undefined") return null;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return hash.get("error_description");
  })();

  const [status, setStatus] = useState(() => {
    if (linkError) return "error";
    if (!tokenHash || !type) return "error";
    return "verifying";
  });
  const [error, setError] = useState(() => {
    if (linkError) return linkError.replace(/\+/g, " ");
    if (!tokenHash || !type) return "This link is incomplete. Open it again from the email.";
    return null;
  });
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (status !== "verifying") return undefined;
    let active = true;
    verifyOnce(tokenHash, type)
      .then(({ data, error: verifyError }) => {
        if (!active) return;
        if (verifyError) {
          setError(describeLinkError(verifyError));
          setStatus("error");
          return;
        }
        setEmail(data?.user?.email || data?.session?.user?.email || "");
        setStatus(PASSWORD_TYPES.has(type) ? "password" : "done");
      })
      .catch((verifyError) => {
        if (!active) return;
        setError(describeLinkError(verifyError));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [status, tokenHash, type]);

  return (
    <div className="min-h-screen bg-light-page text-[var(--sc-surface-light-ink)]">
      <SectionShell className="flex min-h-screen items-center justify-center py-12">
        <div className="w-full max-w-xl">
          <Card variant="light" className="space-y-6 p-8 shadow-xl shadow-[rgba(15,31,25,0.08)]">
            {status === "verifying" ? (
              <SectionHeader title="Checking your link" description="One moment…" />
            ) : null}

            {status === "error" ? (
              <>
                <SectionHeader title="This link can't be used" description={error} />
                <p className="text-sm">
                  Invitation links and password reset links can each be used once and expire after a
                  while. Ask the person who invited you for a new invitation, or request a new reset
                  link from the sign-in page.
                </p>
                <Link to="/login" className="sc-button is-dark w-full justify-center">
                  Go to sign in
                </Link>
              </>
            ) : null}

            {status === "password" ? (
              <SetPasswordForm
                email={email}
                copy={HEADINGS[type]}
                onSaved={() => navigate(type === "invite" ? "/user" : "/", { replace: true })}
              />
            ) : null}

            {status === "done" ? (
              <>
                <SectionHeader
                  title={type === "email_change" ? "Email address confirmed" : "Email confirmed"}
                  description={
                    type === "email_change"
                      ? "If a confirmation email was also sent to your other address, open that link too to finish the change."
                      : "Your StallCount account is ready."
                  }
                />
                <Link to="/" className="sc-button is-dark w-full justify-center">
                  Continue to StallCount
                </Link>
              </>
            ) : null}
          </Card>
        </div>
      </SectionShell>
    </div>
  );
}

function SetPasswordForm({ email, copy, onSaved }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const passwordId = useId();
  const confirmId = useId();

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    if (pending) return;
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setPending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      onSaved();
    } catch (saveError) {
      setError(saveError?.message || "Your password could not be saved. Please try again.");
      setPending(false);
    }
  }

  return (
    <>
      <SectionHeader title={copy.title} description={copy.description} />
      {email ? (
        <p className="text-sm">
          Account: <span className="font-semibold">{email}</span>
        </p>
      ) : null}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" value={email} autoComplete="username" readOnly hidden />
        <Field label="New password" htmlFor={passwordId}>
          <Input
            id={passwordId}
            type="password"
            value={password}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(changeEvent) => setPassword(changeEvent.target.value)}
          />
        </Field>
        <Field label="Confirm password" htmlFor={confirmId}>
          <Input
            id={confirmId}
            type="password"
            value={confirm}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(changeEvent) => setConfirm(changeEvent.target.value)}
          />
        </Field>
        {error ? (
          <Panel variant="light" className="p-3 text-sm text-[var(--sc-live-ink)]" role="alert">
            {error}
          </Panel>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="sc-button is-dark w-full justify-center disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : copy.submit}
        </button>
      </form>
    </>
  );
}
