import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { AiProvider } from "@shared";
import { Button, Input, Modal } from "../../../ui";
import { PROVIDER_LABEL, useAiSettings } from "../../../lib/ai/settings";
import { PageShell } from "./Shell";

type Card = { id: string; name: string; blurb: string; provider?: AiProvider; bridge?: boolean };
const CARDS: Card[] = [
  { id: "mock", name: "Demo", blurb: "Built-in, no key", provider: "mock" },
  { id: "gemini", name: "Google Gemini", blurb: "API key", provider: "gemini" },
  { id: "openrouter", name: "OpenRouter", blurb: "API key · 300+ models", provider: "openrouter" },
  { id: "anthropic", name: "Anthropic", blurb: "Needs bridge", bridge: true },
  { id: "openai", name: "OpenAI", blurb: "Needs bridge", bridge: true },
  { id: "copilot", name: "GitHub Copilot", blurb: "Needs bridge", bridge: true },
  { id: "ollama", name: "Ollama", blurb: "Local · needs bridge", bridge: true },
  { id: "groq", name: "Groq", blurb: "Needs bridge", bridge: true },
];

export default function ProvidersPage() {
  const s = useAiSettings();
  const [edit, setEdit] = useState<AiProvider | null>(null);
  const [key, setKey] = useState("");
  const [manual, setManual] = useState(false);
  const connected = (p?: AiProvider) => !!p && (p === "mock" || !!s.keys[p as "gemini" | "openrouter"]);
  return (
    <PageShell title="Providers">
      <h3 className="g-sec">Connect</h3>
      <div className="g-prov-grid">
        {CARDS.map((c) => {
          const on = connected(c.provider);
          const active = c.provider === s.provider;
          return (
            <button
              key={c.id}
              type="button"
              className={`g-card g-prov ${active ? "is-active" : ""} ${c.bridge ? "is-bridge" : ""}`}
              disabled={c.bridge}
              onClick={() => {
                if (!c.provider) return;
                if (c.provider === "mock" || on) s.set({ provider: c.provider });
                else { setKey(""); setEdit(c.provider); }
              }}
              aria-pressed={active}
            >
              <span className="g-prov-name">{c.name}</span>
              <span className="g-meta">{active ? "In use" : c.blurb}</span>
              {on && <Check size={16} className="g-prov-check" aria-label="Connected" />}
            </button>
          );
        })}
      </div>
      <h3 className="g-sec">Manual</h3>
      <div className="g-card g-manual">
        <div className="grow col" style={{ gap: 2 }}>
          <b>Any OpenAI-compatible API</b>
          <span className="g-meta">Base URL + key, routed through the bridge.</span>
        </div>
        <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setManual(true)}>Add manually</Button>
      </div>
      {(["gemini", "openrouter"] as const).some((p) => s.keys[p]) && (
        <>
          <h3 className="g-sec">Keys on this device</h3>
          <ul className="g-rows">
            {(["gemini", "openrouter"] as const).filter((p) => s.keys[p]).map((p) => (
              <li key={p} className="g-row">
                <span className="grow">{PROVIDER_LABEL[p]}</span>
                <span className="g-meta">••••{s.keys[p].slice(-4)}</span>
                <button type="button" className="g-link" onClick={() => (setKey(s.keys[p]), setEdit(p))}>Edit</button>
                <button type="button" className="g-link is-danger" onClick={() => s.set({ keys: { ...s.keys, [p]: "" }, provider: s.provider === p ? "mock" : s.provider })}>Remove</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        size="sm"
        title={edit ? `Connect ${PROVIDER_LABEL[edit]}` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button disabled={!key} onClick={() => edit && (s.set({ keys: { ...s.keys, [edit]: key }, provider: edit }), setEdit(null))}>Connect</Button>
          </>
        }
      >
        <Input label="API key" type="password" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder={edit === "gemini" ? "AIza…" : "sk-or-…"} autoFocus autoComplete="off" hint="Stored on this device only and sent as a request header." />
      </Modal>
      <Modal open={manual} onClose={() => setManual(false)} size="sm" title="Add manually" footer={<Button onClick={() => setManual(false)}>Got it</Button>}>
        <p className="muted">Custom OpenAI-compatible providers are configured on the ai.secrets bridge (opencode provider config). Turn on bridge sync in AI settings once the bridge is running, and it will appear in the model list.</p>
      </Modal>
    </PageShell>
  );
}
