import { useEffect, useMemo, useState } from "react";
import { Bookmark, Bot, Cloud, Eye, EyeOff, Github, KeyRound, RefreshCw, ShieldCheck, Sparkles, Wrench, Zap } from "lucide-react";
import type { AiProvider, EffortLevel } from "@shared";
import { EFFORT_LEVELS, EFFORT_META, effortSummary } from "../../lib/ai/effort";
import { Input, ListGroup, ListItem, Modal, Spinner, Tabs, Toggle } from "../../ui";
import { DEFAULT_MODELS, PROVIDER_LABEL, useAiSettings } from "../../lib/ai/settings";
import { fetchModels, type ModelOption } from "../../lib/ai/client";
import { AI_URL } from "../../config";

function SecretInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <Input
      label={label}
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value.trim())}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      leading={<KeyRound size={16} />}
      trailing={
        <button type="button" className="input-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
      hint={hint}
    />
  );
}

function ModelPicker() {
  const provider = useAiSettings((s) => s.provider);
  const key = useAiSettings((s) => (s.provider === "mock" ? "" : s.keys[s.provider]));
  const model = useAiSettings((s) => s.models[s.provider]);
  const set = useAiSettings((s) => s.set);
  const models = useAiSettings((s) => s.models);
  const [list, setList] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (provider !== "mock" && !key) {
      setList([]);
      setErr(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    fetchModels(provider, key, ctrl.signal)
      .then(setList)
      .catch((e: Error) => !ctrl.signal.aborted && (setErr(e.message), setList([])))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [provider, key, nonce]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = t ? list.filter((m) => m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)) : list;
    return l.slice(0, 80);
  }, [list, q]);

  const setModel = (id: string) => set({ models: { ...models, [provider]: id } });

  return (
    <div className="ai-models col">
      <Input
        label="Model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={DEFAULT_MODELS[provider]}
        spellCheck={false}
        leading={<Bot size={16} />}
        trailing={
          <button type="button" className="input-eye" onClick={() => setNonce(nonce + 1)} aria-label="Refresh models" title="Refresh models">
            {loading ? <Spinner size={14} /> : <RefreshCw size={15} />}
          </button>
        }
        hint={err ? <span className="ai-err-text">{err} — type a model id instead.</span> : provider !== "mock" && !key ? "Add a key to load the model list, or type any model id." : "Type any model id, or pick one below."}
      />
      {list.length > 6 && <Input variant="line" placeholder={`Filter ${list.length} models…`} value={q} onChange={(e) => setQ(e.target.value)} />}
      {filtered.length > 0 && (
        <div className="ai-model-list" role="listbox" aria-label="Available models">
          {filtered.map((m) => (
            <button key={m.id} role="option" aria-selected={m.id === model} className={`ai-model ${m.id === model ? "is-active" : ""}`} onClick={() => setModel(m.id)} type="button">
              <span className="truncate">{m.name || m.id}</span>
              {m.name && m.name !== m.id && <span className="faint truncate ai-model-id">{m.id}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiSettingsBody({ onProviders }: { onProviders?: () => void }) {
  const s = useAiSettings();
  const effortItems: { id: EffortLevel; label: string }[] = [...EFFORT_LEVELS.map((id) => ({ id, label: EFFORT_META[id].label })), { id: "custom", label: "Custom" }];
  return (
    <div className="ai-settings col">
      <section className="col">
        <h3 className="ai-h">Provider</h3>
        <Tabs<AiProvider>
          variant="pill"
          items={(["mock", "gemini", "openrouter"] as AiProvider[]).map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))}
          value={s.provider}
          onChange={(provider) => s.set({ provider })}
        />
        {s.provider === "mock" && <p className="faint ai-small">A built-in demo that needs no key. With Agent mode on it runs a search tool, then asks you to approve a write.</p>}
        {s.provider === "gemini" && (
          <SecretInput
            label="Gemini API key"
            value={s.keys.gemini}
            onChange={(gemini) => s.set({ keys: { ...s.keys, gemini } })}
            placeholder="AIza…"
            hint={
              <>
                Stored on this device only. Get one at{" "}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                  Google AI Studio
                </a>
                .
              </>
            }
          />
        )}
        {s.provider === "openrouter" && (
          <SecretInput
            label="OpenRouter API key"
            value={s.keys.openrouter}
            onChange={(openrouter) => s.set({ keys: { ...s.keys, openrouter } })}
            placeholder="sk-or-…"
            hint={
              <>
                Stored on this device only. Create one at{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                  openrouter.ai/keys
                </a>
                .
              </>
            }
          />
        )}
        <ModelPicker />
      </section>

      <section className="col">
        <h3 className="ai-h">Effort</h3>
        <Tabs<EffortLevel> variant="pill" items={effortItems} value={s.effort} onChange={(effort) => s.set({ effort })} />
        {s.effort !== "custom" ? (
          <p className="faint ai-small">{effortSummary(s.effort, { maxSteps: s.customSteps, thinkingBudget: s.thinkingBudget })}</p>
        ) : (
          <div className="ai-grid2">
            <Input label="Max steps" type="number" min={1} max={50} value={s.customSteps} onChange={(e) => s.set({ customSteps: clamp(+e.target.value, 1, 50) })} />
            <Input label="Thinking budget" type="number" min={0} max={32768} step={512} value={s.thinkingBudget} onChange={(e) => s.set({ thinkingBudget: clamp(+e.target.value, 0, 32768) })} hint="Tokens; 0 = off" />
          </div>
        )}
      </section>

      <ListGroup title="Agent" footer="Write actions (posting, creating issues, notes) always ask first unless auto-approve is on.">
        <ListItem icon={<Sparkles size={18} />} title="Agent mode" subtitle="Let the assistant call tools in a loop" trailing={<Toggle label="Agent mode" checked={s.agentMode} onChange={(agentMode) => s.set({ agentMode })} />} />
        <ListItem icon={<Wrench size={18} />} title="Secrets tools" subtitle="Read conversations, summarize channels, draft messages" trailing={<Toggle label="Secrets tools" checked={s.tools.secrets} onChange={(v) => s.set({ tools: { ...s.tools, secrets: v } })} />} />
        <ListItem icon={<Github size={18} />} title="GitHub tools" subtitle={s.githubToken ? "Repos, issues, PRs, files" : "Add a token below to enable"} trailing={<Toggle label="GitHub tools" checked={s.tools.github} onChange={(v) => s.set({ tools: { ...s.tools, github: v } })} />} />
        <ListItem icon={<Zap size={18} />} title="Auto-approve this session" subtitle="Skip confirmations until you reload" trailing={<Toggle label="Auto-approve" checked={s.autoApprove} onChange={(autoApprove) => s.set({ autoApprove })} />} />
      </ListGroup>

      {s.tools.github && (
        <SecretInput
          label="GitHub fine-grained token"
          value={s.githubToken}
          onChange={(githubToken) => s.set({ githubToken })}
          placeholder="github_pat_…"
          hint={
            <>
              Stays on this device.{" "}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
                Create a token
              </a>{" "}
              with only the repos and permissions you need.
            </>
          }
        />
      )}

      <ListGroup title="Memory & sync" footer="Bridge sync mirrors projects, usage, memory, connections, shares and upcoming tasks to the ai.secrets v2 endpoints. Everything works locally without it.">
        <ListItem icon={<Bookmark size={18} />} title="Use memory" subtitle="Recall facts you approved" trailing={<Toggle label="Use memory" checked={s.memoryEnabled} onChange={(memoryEnabled) => s.set({ memoryEnabled })} />} />
        <ListItem icon={<Cloud size={18} />} title="Bridge sync" subtitle={s.bridgeToken ? "Use the ai.secrets bridge" : "Add a bridge token below"} trailing={<Toggle label="Bridge sync" checked={s.bridgeSync} onChange={(bridgeSync) => s.set({ bridgeSync })} />} />
      </ListGroup>
      {s.bridgeSync && <SecretInput label="Bridge token" value={s.bridgeToken} onChange={(bridgeToken) => s.set({ bridgeToken })} placeholder="From ai.secrets pairing" hint="Printed by the bridge when you pair this device." />}

      {onProviders && (
        <button type="button" className="g-link" onClick={onProviders}>
          Browse all providers →
        </button>
      )}

      <p className="faint ai-small row ai-privacy">
        <ShieldCheck size={14} /> Keys are sent only as request headers to {AI_URL.replace(/^https?:\/\//, "")}, never stored server-side.
      </p>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo;
}

export function AiSettingsModal({ open, onClose, onProviders }: { open: boolean; onClose: () => void; onProviders?: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="AI settings" kind="side" className="ai-settings-modal">
      <AiSettingsBody onProviders={onProviders} />
    </Modal>
  );
}
