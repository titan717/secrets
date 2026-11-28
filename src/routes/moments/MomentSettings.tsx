import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Search } from "lucide-react";
import type { MomentSettings as Settings, MomentVisibility } from "@shared";
import { Avatar, Button, Modal, Spinner, Toggle } from "../../ui";
import { momentsApi } from "../../lib/features/api";
import { errorMessage } from "../../lib/api";
import { toast } from "../../stores/toast";
import { useChat } from "../../stores/chat";
import { myId } from "../../stores/session";
import { useMomentsEnabled } from "./prefs";

const OPTIONS: { id: MomentVisibility; label: string; hint: string; pick?: boolean }[] = [
  { id: "all_friends", label: "All friends", hint: "Everyone you chat with can view" },
  { id: "public", label: "Public", hint: "Friends and Dock members can view" },
  { id: "only", label: "Only these people", hint: "Choose who can view", pick: true },
  { id: "except", label: "All friends except", hint: "Hide from specific friends", pick: true },
];

export const visibilityLabel = (s: Settings | null) => {
  if (!s) return "…";
  const o = OPTIONS.find((x) => x.id === s.visibility)!;
  if (o.pick) return `${o.label.replace(" people", "")} (${s.user_ids.length})`;
  return o.label;
};

/** "My Story" privacy: who can view + enable/disable the stories row. */
export function MomentSettings({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (s: Settings) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [picking, setPicking] = useState<MomentVisibility | null>(null);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useMomentsEnabled();

  useEffect(() => {
    if (!open) return;
    setS(null);
    momentsApi.settings().then(setS, (e) => toast.error(errorMessage(e)));
  }, [open]);

  const save = async (next: Settings) => {
    setS(next);
    setSaving(true);
    try {
      const r = await momentsApi.saveSettings(next);
      setS(r);
      onSaved?.(r);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="My Moment" size="sm" className="ms-modal">
      {!s ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : picking ? (
        <PeoplePicker
          title={picking === "only" ? "Only share with" : "Hide from"}
          initial={s.visibility === picking ? s.user_ids : []}
          onCancel={() => setPicking(null)}
          onDone={(ids) => {
            setPicking(null);
            void save({ visibility: picking, user_ids: ids });
          }}
        />
      ) : (
        <div className="ms">
          <h4 className="ms-h">Who can view your moments</h4>
          <div className="ms-opts" role="radiogroup">
            {OPTIONS.map((o) => {
              const on = s.visibility === o.id;
              return (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={on}
                  className={`ms-opt ${on ? "is-on" : ""}`}
                  onClick={() => (o.pick ? setPicking(o.id) : void save({ visibility: o.id, user_ids: [] }))}
                >
                  <span className="ms-radio" />
                  <span className="grow">
                    <span className="ms-label">{o.label}</span>
                    <span className="ms-hint">{on && o.pick ? `${s.user_ids.length} ${s.user_ids.length === 1 ? "person" : "people"}` : o.hint}</span>
                  </span>
                  {o.pick && <ChevronRight size={18} className="faint" />}
                </button>
              );
            })}
          </div>
          <p className="ms-fine">
            Changes apply to new moments; moments you've already shared keep their audience. Blocked people can never view your moments.
            {saving && <span className="faint"> Saving…</span>}
          </p>
          <h4 className="ms-h">Moments availability</h4>
          <div className="ms-row">
            <div className="grow">
              <div className="ms-label">Show moments row</div>
              <div className="ms-hint">Show the moments tray at the top of Chats</div>
            </div>
            <Toggle checked={enabled} onChange={setEnabled} label="Show moments row" />
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PeoplePicker({ title, initial, onCancel, onDone }: { title: string; initial: string[]; onCancel: () => void; onDone: (ids: string[]) => void }) {
  const users = useChat((s) => s.users);
  const [sel, setSel] = useState<Set<string>>(() => new Set(initial));
  const [q, setQ] = useState("");
  const people = useMemo(() => {
    const me = myId();
    const t = q.trim().toLowerCase();
    return Object.values(users)
      .filter((u) => u.id !== me && u.username !== "secrets")
      .filter((u) => !t || u.display_name.toLowerCase().includes(t) || u.username.toLowerCase().includes(t))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [users, q]);
  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };
  return (
    <div className="ms">
      <h4 className="ms-h">{title}</h4>
      <label className="input-wrap input-box">
        <Search size={16} className="input-adorn" />
        <input className="input" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <ul className="ms-people">
        {people.length === 0 && <li className="faint ms-empty">No people yet. Start a chat to add friends.</li>}
        {people.map((u) => (
          <li key={u.id}>
            <button className={`ms-person ${sel.has(u.id) ? "is-on" : ""}`} onClick={() => toggle(u.id)} aria-pressed={sel.has(u.id)}>
              <Avatar name={u.display_name} src={u.avatar_url} seed={u.id} size={36} />
              <span className="grow">
                <span className="ms-label truncate">{u.display_name}</span>
                <span className="ms-hint truncate">@{u.username}</span>
              </span>
              <span className="ms-check">{sel.has(u.id) && <Check size={14} strokeWidth={3} />}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="row ms-actions">
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <span className="grow" />
        <Button onClick={() => onDone([...sel])}>Done · {sel.size}</Button>
      </div>
    </div>
  );
}
