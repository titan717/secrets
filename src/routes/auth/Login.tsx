import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../stores/session";
import { GoogleG } from "./ob";
import { useGoogleSignIn } from "./useGoogle";
import "./onboarding.css";

/** Join or sign in (blueprint p47): Google, or email/username then password. */
export function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const setSession = useSession((s) => s.setSession);
  const g = useGoogleSignIn();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"id" | "password">("id");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ident = id.trim().toLowerCase().replace(/^@/, "");
    if (step === "id") {
      if (!ident) return setError("Enter your email or username.");
      return setStep("password");
    }
    if (!password) return setError("Enter your password.");
    setBusy(true);
    try {
      const s = await api("POST /v1/auth/login", { body: { username: ident, password } });
      setSession(s);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && !/^\/(welcome|login|signup)/.test(from) ? from : "/chats", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="ob ob-login" aria-label="Join or sign in">
      <form className="ob-col" onSubmit={submit} noValidate>
        <button type="button" className="ob-back" aria-label="Close" onClick={() => (step === "password" ? (setStep("id"), setPassword(""), setError(null)) : nav("/welcome"))}>
          <X />
        </button>
        <div className="ob-brand">
          <img src="/logo-mark.png" alt="" /> Secrets
        </div>
        <h1 className="ob-title">{step === "id" ? "Join or sign in" : "Enter your password"}</h1>
        <p className="ob-dim">{step === "id" ? "One account for chats, docks, Grace and more." : `Signing in as ${id.trim()}.`}</p>
        {step === "id" && (
          <>
            <button type="button" className="ob-google" style={{ marginTop: 30 }} onClick={g.start}>
              <GoogleG /> Continue with Google
            </button>
            <p className="ob-or">or</p>
            <label className="ob-box">
              <span>Email or username</span>
              <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={id} onChange={(e) => setId(e.target.value)} aria-invalid={!!error} autoFocus />
            </label>
          </>
        )}
        {step === "password" && (
          <label className="ob-box" style={{ marginTop: 30 }}>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} autoFocus />
          </label>
        )}
        {error && (
          <p className="ob-err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={`ob-pill ${busy ? "busy" : ""}`} disabled={busy}>
          Continue
        </button>
        {step === "password" ? (
          <Link className="ob-old" to="/forgot">
            Forgot password?
          </Link>
        ) : (
          <>
            <p className="ob-legal">
              By continuing, you agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.
            </p>
            <div>
              <Link className="ob-old" to="/login/classic">
                Use the old sign-in page
              </Link>
            </div>
          </>
        )}
      </form>
      {g.chooser}
    </main>
  );
}
