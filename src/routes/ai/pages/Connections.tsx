import { useState } from "react";
import { Github, Plug, Plus, Server, Trash2 } from "lucide-react";
import type { AiConnection } from "@shared";
import { Button, Input, Modal, Spinner, Tabs, Toggle } from "../../../ui";
import { useAiConnections, useConnectionList } from "../../../lib/ai/connections";
import { useAiSettings } from "../../../lib/ai/settings";
import { MASCOT } from "../mascot";
import { PageShell, relTime } from "./Shell";

const STATUS: Record<AiConnection["status"], string> = { connected: "Connected", error: "Needs attention", untested: "Not tested", disabled: "Off" };

function Icon({ c }: { c: AiConnection }) {
  if (c.kind === "github") return <Github size={22} />;
  if (c.kind === "secrets") return <img src={MASCOT} alt="" width={24} height={24} />;
  return <Server size={22} />;
}

export default function ConnectionsPage() {
  const list = useConnectionList();
  const { test, removeCustom, setCustomEnabled, addCustom } = useAiConnections.getState();
  const settings = useAiSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", mode: "url" as "url" | "command", value: "" });

  const toggle = (c: AiConnection, v: boolean) => {
    if (c.kind === "custom") setCustomEnabled(c.id, v);
    else settings.set({ tools: { ...settings.tools, [c.kind]: v } });
  };
  const runTest = async (id: string) => {
    setBusy(id);
    await test(id);
    setBusy(null);
  };

  return (
    <PageShell title="Connections" actions={<Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add MCP server</Button>}>
      <ul className="g-conns">
        {list.map((c) => (
          <li key={c.id} className="g-card g-conn">
            <div className="g-conn-head">
              <span className="g-conn-ic"><Icon c={c} /></span>
              <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
                <b className="truncate">{c.name}</b>
                <span className={`g-status is-${c.status}`}>
                  <i /> {STATUS[c.status]}
                  {c.lastTestedAt && <span className="faint"> · {relTime(c.lastTestedAt)}</span>}
                </span>
              </div>
              <Toggle label={`Enable ${c.name}`} checked={c.enabled} onChange={(v) => toggle(c, v)} />
            </div>
            {c.message && <p className="g-meta">{c.message}</p>}
            {(c.url || c.command) && <code className="g-code truncate">{c.url ?? c.command}</code>}
            {c.kind === "github" && c.enabled && (
              <Input type="password" label="GitHub fine-grained token" value={settings.githubToken} onChange={(e) => settings.set({ githubToken: e.target.value.trim() })} placeholder="github_pat_…" autoComplete="off" hint="Stays on this device. Grant only the repos you need." />
            )}
            <div className="row g-conn-actions">
              <Button size="sm" variant="secondary" disabled={!c.enabled || busy === c.id} onClick={() => runTest(c.id)} icon={busy === c.id ? <Spinner size={14} /> : <Plug size={14} />}>
                Test
              </Button>
              {c.kind === "custom" && (
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => removeCustom(c.id)}>
                  Remove
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="faint ai-small">Custom MCP servers run through the ai.secrets bridge. Remote URLs can be reachability-tested from the browser.</p>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add MCP server"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              disabled={!form.name.trim() || !form.value.trim()}
              onClick={() => {
                addCustom({ name: form.name.trim(), [form.mode]: form.value.trim() });
                setForm({ name: "", mode: "url", value: "" });
                setAdding(false);
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="col" style={{ gap: 12 }}>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Linear" autoFocus />
          <Tabs<"url" | "command"> variant="pill" items={[{ id: "url", label: "Remote URL" }, { id: "command", label: "Local command" }]} value={form.mode} onChange={(mode) => setForm({ ...form, mode })} />
          <Input label={form.mode === "url" ? "Server URL" : "Command"} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.mode === "url" ? "https://mcp.example.com/sse" : "npx -y @acme/mcp-server"} spellCheck={false} />
        </div>
      </Modal>
    </PageShell>
  );
}
