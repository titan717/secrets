import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Eye, EyeOff } from "lucide-react";
import { apiRaw, errorMessage } from "../../lib/api";
import { Button, IconButton, Input } from "../../ui";
import { AuthLayout } from "./AuthLayout";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await apiRaw<{ dev_token?: string }>("POST /v1/auth/forgot-password", { body: { email: email.trim() } });
      setSent(true);
      setDevToken(r?.dev_token ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-card auth-form" onSubmit={submit}>
        <div className="auth-top">
          <Link to="/login" aria-label="Back">
            <IconButton label="Back" type="button">
              <ArrowLeft size={20} />
            </IconButton>
          </Link>
        </div>
        <h2 className="auth-title">Reset your password</h2>
        <p className="muted auth-sub">Enter the email on your account. If it matches, we’ll send a single-use link that expires in 30 minutes.</p>
        {sent ? (
          <div className="col" style={{ gap: 12 }}>
            <p className="avail avail-ok">
              <Check size={16} /> Check your inbox for the reset link.
            </p>
            {devToken && (
              <p className="faint">
                Development mode:{" "}
                <Link to={`/reset?token=${encodeURIComponent(devToken)}`}>open the reset link</Link>
              </p>
            )}
            <Link to="/login">Back to sign in</Link>
          </div>
        ) : (
          <>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              autoFocus
              error={error ?? undefined}
            />
            <div className="auth-spacer" />
            <Button type="submit" size="lg" block loading={busy} disabled={!email.includes("@")}>
              Send reset link
            </Button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ok = password.length >= 10 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiRaw("POST /v1/auth/reset-password", { body: { token, password } });
      nav("/login", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-card auth-form" onSubmit={submit}>
        <h2 className="auth-title">Choose a new password</h2>
        <p className="muted auth-sub">All other devices will be signed out for your safety.</p>
        {!token && <p className="avail avail-bad">This link is missing its token. Request a new one.</p>}
        <Input
          label="New password"
          type={show ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
          hint={password && password.length < 10 ? "Needs at least 10 characters" : undefined}
          trailing={
            <button type="button" className="input-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />
        <Input
          label="Confirm password"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          error={confirm && password !== confirm ? "Passwords don’t match" : error ?? undefined}
        />
        <div className="auth-spacer" />
        <Button type="submit" size="lg" block loading={busy} disabled={!token || !ok}>
          Update password
        </Button>
        <p className="auth-switch muted">
          <Link to="/forgot">Request a new link</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
