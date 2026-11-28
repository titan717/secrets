import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, AtSign } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../stores/session";
import { Button, IconButton, Input } from "../../ui";
import { AuthLayout } from "./AuthLayout";

export function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const setSession = useSession((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const id = username.trim();
      const s = await api("POST /v1/auth/login", { body: id.includes("@") ? { username: id.toLowerCase(), password } : { username: id.toLowerCase().replace(/^@/, ""), password } });
      setSession(s);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from !== "/welcome" ? from : "/chats", { replace: true });
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
          <IconButton label="Back" onClick={() => nav("/welcome")} type="button">
            <ArrowLeft size={20} />
          </IconButton>
        </div>
        <h2 className="auth-title">Welcome back</h2>
        <p className="muted auth-sub">Sign in with your username or email.</p>
        <Input label="Username or email" leading={<AtSign size={16} />} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" autoFocus />
        <Input
          label="Password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          trailing={
            <button type="button" className="input-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          error={error}
        />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Link className="faint" to="/forgot">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={busy} disabled={!username.trim() || !password}>
          Sign in
        </Button>
        <p className="auth-switch muted">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
