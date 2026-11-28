import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronDown } from "lucide-react";
import { create } from "zustand";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../stores/session";
import { useSettings } from "../../stores/settings";
import { DatePickerDialog, ObScreen, fromIso, longDate } from "./ob";

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
const MIN_AGE = 13;
type Avail = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

/** In-progress sign-up (kept in memory across the three steps). */
export const useSignupDraft = create<{ name: string; birthday: string | null; username: string; set: (p: Partial<{ name: string; birthday: string | null; username: string }>) => void; reset: () => void }>((set) => ({
  name: "",
  birthday: null,
  username: "",
  set: (p) => set(p),
  reset: () => set({ name: "", birthday: null, username: "" }),
}));

export const normalizeUsername = (v: string) => v.toLowerCase().replace(/^@/, "").replace(/\s+/g, "").replace(/[^a-z0-9_.]/g, "").slice(0, 24);

/** Username ideas from the name: first name, then first name + 4 digits (p38). */
export function usernameIdeas(name: string, current: string, rand = Math.random): string[] {
  const first = normalizeUsername(name.split(/\s+/)[0] ?? "") || normalizeUsername(current) || "secret";
  const base = first.length >= 3 ? first.slice(0, 18) : `${first}_me`;
  const n = () => String(Math.floor(rand() * 9000 + 1000));
  return [...new Set([base, `${base}${n()}`, `${base}${n()}`, `${base}.${n()}`])].filter((s) => s !== current && USERNAME_RE.test(s));
}

export function ageOn(birthday: string, today = new Date()) {
  const b = fromIso(birthday);
  let a = today.getFullYear() - b.getFullYear();
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) a--;
  return a;
}

function NameStep() {
  const nav = useNavigate();
  const { name, set } = useSignupDraft();
  const ref = useRef<HTMLInputElement>(null);
  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return ref.current?.focus();
    nav("/signup/birthday");
  };
  return (
    <form onSubmit={next} className="contents">
      <ObScreen
        label="What's your name?"
        onBack={() => nav("/welcome")}
        foot={
          <button type="submit" className="ob-pill">
            Next
          </button>
        }
      >
        <h1 className="ob-title">What&apos;s your name?</h1>
        <p className="ob-sub">This is how people will see you. You can change it any time.</p>
        <label className="ob-line">
          <input ref={ref} value={name} onChange={(e) => set({ name: e.target.value })} placeholder="Your name" autoComplete="name" aria-label="Your name" maxLength={48} autoFocus />
        </label>
      </ObScreen>
    </form>
  );
}

function BirthdayStep() {
  const nav = useNavigate();
  const { name, birthday, set } = useSignupDraft();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!name.trim()) nav("/signup", { replace: true });
  }, [name, nav]);
  const next = () => {
    if (!birthday) return setOpen(true);
    if (ageOn(birthday) < MIN_AGE) return setErr(`You need to be at least ${MIN_AGE} to use Secrets.`);
    nav("/signup/username");
  };
  return (
    <ObScreen
      label="When's your birthday?"
      onBack={() => nav("/signup")}
      foot={
        <button type="button" className="ob-pill" onClick={next}>
          Next
        </button>
      }
    >
      <h1 className="ob-title">When&apos;s your birthday?</h1>
      <p className="ob-sub">It won&apos;t be on your profile. Enter your own age, even if this account is for a business or a pet.</p>
      <p className="ob-label" id="ob-dob">
        Date of Birth *
      </p>
      <button type="button" className="ob-date" aria-labelledby="ob-dob ob-dob-v" onClick={() => setOpen(true)}>
        <CalendarDays aria-hidden />
        <span id="ob-dob-v">{birthday ? longDate(birthday) : "Choose your date of birth"}</span>
        <ChevronDown aria-hidden />
      </button>
      <p className={`ob-note ${err ? "bad" : ""}`} role={err ? "alert" : undefined}>
        {err ?? "This is private and cannot be changed after it is saved."}
      </p>
      <DatePickerDialog
        open={open}
        value={birthday}
        max={new Date()}
        onCancel={() => setOpen(false)}
        onOk={(v) => {
          set({ birthday: v });
          setErr(null);
          setOpen(false);
        }}
      />
    </ObScreen>
  );
}

function UsernameStep() {
  const nav = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const { name, birthday, username, set, reset } = useSignupDraft();
  const [avail, setAvail] = useState<Avail>("idle");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!name.trim() || !birthday) nav("/signup", { replace: true });
  }, [name, birthday, nav]);

  // Prefill from the name the first time.
  useEffect(() => {
    if (!username && name) set({ username: normalizeUsername(name.split(/\s+/)[0] ?? "") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live availability (debounced).
  useEffect(() => {
    setError(null);
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
    }, 300);
    return () => clearTimeout(t);
  }, [username]);

  // Suggestions: only ones that are free.
  useEffect(() => {
    let live = true;
    const cands = usernameIdeas(name, username);
    Promise.all(cands.map((u) => api("GET /v1/auth/username-available", { query: { username: u } }).then((r) => (r.available ? u : null)).catch(() => null))).then((r) => {
      if (live) setIdeas(r.filter((x): x is string => !!x).slice(0, 3));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, avail === "taken"]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(avail === "available" || avail === "error")) return ref.current?.focus();
    setBusy(true);
    try {
      const s = await api("POST /v1/auth/signup", { body: { username, display_name: name.trim(), birthday: birthday ?? undefined } });
      // Brand-new accounts see the first-run tour, not What's new.
      useSettings.getState().set({ whatsNewSeen: null });
      setSession(s);
      reset();
      nav("/chats", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const hint =
    error ??
    {
      idle: "Use 3–24 letters, numbers, dots or underscores.",
      invalid: "Use 3–24 letters, numbers, dots or underscores.",
      checking: "Checking…",
      available: `@${username} is available.`,
      taken: `@${username} is taken.`,
      error: "Couldn't check right now. You can still try.",
    }[avail];

  return (
    <form onSubmit={submit} className="contents">
      <ObScreen
        label="Pick a username"
        onBack={() => nav("/signup/birthday")}
        foot={
          <button type="submit" className={`ob-pill ${busy ? "busy" : ""}`} disabled={busy}>
            Create account
          </button>
        }
      >
        <h1 className="ob-title">Pick a username</h1>
        <p className="ob-sub">It&apos;s how people find you. You can change it later.</p>
        <label className="ob-line">
          <span aria-hidden>@</span>
          <input
            ref={ref}
            value={username}
            onChange={(e) => set({ username: normalizeUsername(e.target.value) })}
            aria-label="Username"
            aria-describedby="ob-avail"
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            maxLength={24}
            autoFocus
          />
        </label>
        <p id="ob-avail" className={`ob-hint ${error || avail === "taken" || avail === "invalid" ? "bad" : ""}`} aria-live="polite">
          {hint}
        </p>
        {ideas.some((s) => s !== username) && (
          <div className="ob-chips" aria-label="Suggestions">
            {ideas.filter((s) => s !== username).map((s) => (
              <button type="button" key={s} onClick={() => set({ username: s })}>
                @{s}
              </button>
            ))}
          </div>
        )}
      </ObScreen>
    </form>
  );
}

/** Sign-up (blueprint p38–44): name → birthday → username. */
export function Signup() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/signup/birthday")) return <BirthdayStep />;
  if (pathname.startsWith("/signup/username")) return <UsernameStep />;
  return <NameStep />;
}
