import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Eye, EyeOff, X } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../stores/session";
import { Button, IconButton, Input, Spinner } from "../../ui";
import { AuthLayout } from "./AuthLayout";

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
type Avail = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

function normalize(v: string) {
  return v.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_.]/g, "");
}

function suggestions(base: string): string[] {
  const b = base.replace(/[._]+$/, "").slice(0, 18) || "secret";
  const n = () => Math.floor(Math.random() * 900 + 100);
  return [`${b}_${n()}`, `${b}${new Date().getFullYear() % 100}`, `the.${b}`];
}

export function Signup() {
  const nav = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [avail, setAvail] = useState<Avail>("idle");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const sugg = useMemo(() => suggestions(username || "secret"), [avail === "taken"]); // eslint-disable-line

  useEffect(() => {
    if (!username) return setAvail("idle");
    if (!USERNAME_RE.test(username)) return setAvail("invalid");
    setAvail("checking");
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const r = await api("GET /v1/auth/username-available", { query: { username } });
        if (id === reqId.current) setAvail(r.available ? "available" : "taken");
      } catch {
        if (id === reqId.current) setAvail("error");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  const pwOk = password.length >= 8;
  const pwMatch = password === confirm;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api("POST /v1/auth/signup", { body: { username, password, display_name: name.trim() || username } });
      setSession(s);
      nav("/chats", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const back = () => (step === 0 ? nav("/welcome") : setStep(step - 1));

  const availLine = {
    idle: <span className="faint">3–24 characters: letters, numbers, dots and underscores.</span>,
    invalid: <span className="avail avail-bad">Use 3–24 letters, numbers, dots or underscores.</span>,
    checking: (
      <span className="avail faint">
        <Spinner size={12} /> Checking…
      </span>
    ),
    available: (
      <span className="avail avail-ok">
        <Check size={14} /> @{username} is available.
      </span>
    ),
    taken: (
      <span className="avail avail-bad">
        <X size={14} /> @{username} is taken.
      </span>
    ),
    error: <span className="avail faint">Couldn’t check right now — you can still try.</span>,
  }[avail];

  return (
    <AuthLayout>
      <div className="auth-card auth-form">
        <div className="auth-top">
          <IconButton label="Back" onClick={back}>
            <ArrowLeft size={20} />
          </IconButton>
          <div className="steps" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`step-dot ${i <= step ? "is-on" : ""}`} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <form
            className="col auth-step"
            onSubmit={(e) => {
              e.preventDefault();
              if (avail === "available" || avail === "error") setStep(1);
            }}
          >
            <h2 className="auth-title">Pick a username</h2>
            <p className="muted auth-sub">It’s how people find you on Secrets. You can share it as a link or QR code.</p>
            <Input
              variant="line"
              leading={<span className="at">@</span>}
              value={username}
              onChange={(e) => setUsername(normalize(e.target.value))}
              placeholder="username"
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
              autoFocus
              aria-label="Username"
              maxLength={24}
              hint={availLine}
            />
            {avail === "taken" && (
              <div className="chips">
                {sugg.map((s) => (
                  <button type="button" key={s} className="chip" onClick={() => setUsername(s)}>
                    @{s}
                  </button>
                ))}
              </div>
            )}
            <div className="auth-spacer" />
            <Button type="submit" size="lg" block disabled={!(avail === "available" || avail === "error")}>
              Next
            </Button>
            <p className="auth-switch muted">
              Have an account? <Link to="/login">Sign in</Link>
            </p>
          </form>
        )}

        {step === 1 && (
          <form
            className="col auth-step"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) setStep(2);
            }}
          >
            <h2 className="auth-title">What’s your name?</h2>
            <p className="muted auth-sub">This is how people will see you. You can change it any time.</p>
            <Input variant="line" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" autoFocus aria-label="Display name" maxLength={48} />
            <div className="auth-spacer" />
            <Button type="submit" size="lg" block disabled={!name.trim()}>
              Next
            </Button>
          </form>
        )}

        {step === 2 && (
          <form
            className="col auth-step"
            onSubmit={(e) => {
              e.preventDefault();
              if (pwOk && pwMatch) void create();
            }}
          >
            <h2 className="auth-title">Set a password</h2>
            <p className="muted auth-sub">At least 8 characters. There’s no email reset in this preview, so keep it somewhere safe.</p>
            <Input
              label="Password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              trailing={
                <button type="button" className="input-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              hint={password && !pwOk ? "Needs at least 8 characters" : undefined}
            />
            <Input label="Confirm password" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={confirm && !pwMatch ? "Passwords don’t match" : error} />
            <div className="signup-summary">
              <span className="faint">Creating</span> <strong>{name.trim()}</strong> <span className="faint">as</span> <strong>@{username}</strong>
            </div>
            <div className="auth-spacer" />
            <Button type="submit" size="lg" block loading={busy} disabled={!pwOk || !pwMatch}>
              Create account
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
