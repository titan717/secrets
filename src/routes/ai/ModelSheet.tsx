import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Lock, RefreshCw, Search } from "lucide-react";
import type { AiProvider } from "@shared";
import { Modal, Spinner, Tabs } from "../../ui";
import { fetchModels, type ModelOption } from "../../lib/ai/client";
import { ASSISTANT_NAME, DEFAULT_MODELS, PROVIDER_LABEL, useAiSettings } from "../../lib/ai/settings";
import { MASCOT } from "./mascot";

function badges(id: string, name: string) {
  const s = `${id} ${name}`.toLowerCase();
  const out: { label: string; tone: "fast" | "max" | "new" | "think" }[] = [];
  if (/:free\b/.test(s)) out.push({ label: "Free", tone: "new" });
  if (/lite|mini|flash|haiku|fast|nano/.test(s)) out.push({ label: "Fast", tone: "fast" });
  if (/opus|ultra|pro\b|-pro|max/.test(s)) out.push({ label: "Max", tone: "max" });
  if (/thinking|reason|r1\b|-r1|o\d\b|deepthink/.test(s)) out.push({ label: "Thinking", tone: "think" });
  return out.slice(0, 2);
}

/** Bottom sheet: "Best" + provider model list, locked rows when no key is set. */
export function ModelSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const s = useAiSettings();
  const key = s.provider === "mock" ? "" : s.keys[s.provider];
  const locked = s.provider !== "mock" && !key;
  const [list, setList] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (locked) {
      setList([]);
      setErr(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    fetchModels(s.provider, key, ctrl.signal)
      .then(setList)
      .catch((e: Error) => !ctrl.signal.aborted && (setErr(e.message), setList([])))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [open, s.provider, key, locked, nonce]);

  const pinned = s.models[s.provider] || DEFAULT_MODELS[s.provider];
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    let l = list.length ? list : [{ id: DEFAULT_MODELS[s.provider], name: DEFAULT_MODELS[s.provider] }];
    if (!l.some((m) => m.id === pinned)) l = [{ id: pinned, name: pinned }, ...l];
    return (t ? l.filter((m) => m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)) : l).slice(0, 120);
  }, [list, q, pinned, s.provider]);

  const pick = (id: string) => {
    s.set({ modelChoice: "pinned", models: { ...s.models, [s.provider]: id } });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Models" className="g-sheet g-models">
      <Tabs<AiProvider> variant="pill" items={(["mock", "gemini", "openrouter"] as AiProvider[]).map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))} value={s.provider} onChange={(provider) => s.set({ provider })} />
      <button type="button" className={`g-model-best ${s.modelChoice === "best" ? "is-on" : ""}`} onClick={() => (s.set({ modelChoice: "best" }), onClose())}>
        <img src={MASCOT} alt="" width={26} height={26} />
        <span className="grow">
          <span className="g-model-name">Best</span>
          <span className="g-model-sub">
            {ASSISTANT_NAME} picks the best available model{s.effort === "instant" ? " (a fast one on Instant effort)" : ""}.
          </span>
        </span>
        {s.modelChoice === "best" && <Check size={20} className="g-check" />}
      </button>
      <div className="g-divider" />
      {list.length > 8 && (
        <label className="g-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${list.length} models`} aria-label="Search models" />
        </label>
      )}
      {locked && (
        <button type="button" className="g-lock-note" onClick={() => (onClose(), nav("/ai/providers"))}>
          <Lock size={16} /> Add your {PROVIDER_LABEL[s.provider]} key to unlock these models
        </button>
      )}
      {err && (
        <div className="g-err-row">
          <span className="grow">{err}</span>
          <button type="button" onClick={() => setNonce(nonce + 1)} aria-label="Retry">
            <RefreshCw size={15} />
          </button>
        </div>
      )}
      <div className="g-model-list" role="listbox" aria-label="Models">
        {loading && (
          <div className="g-center">
            <Spinner size={18} />
          </div>
        )}
        {rows.map((m) => {
          const on = s.modelChoice === "pinned" && m.id === pinned;
          return (
            <button key={m.id} type="button" role="option" aria-selected={on} className={`g-model-row ${on ? "is-on" : ""} ${locked ? "is-locked" : ""}`} onClick={() => (locked ? (onClose(), nav("/ai/providers")) : pick(m.id))}>
              <span className="g-model-name truncate">{m.name || m.id}</span>
              {badges(m.id, m.name).map((b) => (
                <span key={b.label} className={`g-badge is-${b.tone}`}>
                  {b.label}
                </span>
              ))}
              <span className="grow" />
              {locked ? <Lock size={18} className="faint" /> : on ? <Check size={18} className="g-check" /> : null}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
