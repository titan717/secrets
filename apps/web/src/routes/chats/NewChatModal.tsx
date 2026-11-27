import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Check, X, Users } from "lucide-react";
import type { User } from "@secrets/shared";
import { api, errorMessage } from "../../lib/api";
import { useUserSearch } from "../../lib/useUserSearch";
import { useChat } from "../../stores/chat";
import { useSession } from "../../stores/session";
import { toast } from "../../stores/toast";
import { Avatar, Button, Input, Modal, Spinner, Tabs } from "../../ui";

export function NewChatModal({ mode, onClose }: { mode: "dm" | "group" | null; onClose: () => void }) {
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<User[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const me = useSession((s) => s.user);
  const nav = useNavigate();
  const { results, loading } = useUserSearch(q);
  const upsert = useChat((s) => s.upsertConversation);
  const known = useChat((s) => s.users);

  useEffect(() => {
    if (mode) {
      setTab(mode);
      setQ("");
      setPicked([]);
      setTitle("");
    }
  }, [mode]);

  const people = (q.trim() ? results : Object.values(known)).filter((u) => u.id !== me?.id).slice(0, 30);

  const startDm = async (u: User) => {
    setBusy(true);
    try {
      const c = await api("POST /v1/conversations/dm", { body: { user_id: u.id } });
      upsert(c);
      onClose();
      nav(`/chats/${c.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!picked.length) return;
    setBusy(true);
    try {
      const c = await api("POST /v1/conversations/group", { body: { title: title.trim() || picked.map((p) => p.display_name.split(" ")[0]).join(", "), member_ids: picked.map((p) => p.id) } });
      upsert(c);
      onClose();
      nav(`/chats/${c.id}`);
      toast.success("Group created");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (u: User) => setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={tab === "dm" ? "New chat" : "New group"}
      footer={
        tab === "group" ? (
          <Button onClick={createGroup} loading={busy} disabled={!picked.length} icon={<Users size={16} />}>
            Create group{picked.length ? ` · ${picked.length + 1}` : ""}
          </Button>
        ) : undefined
      }
    >
      <Tabs
        variant="pill"
        value={tab}
        onChange={setTab}
        items={[
          { id: "dm", label: "Direct message" },
          { id: "group", label: "Group" },
        ]}
      />
      {tab === "group" && (
        <>
          <Input label="Group name" placeholder="Weekend crew" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} />
          {picked.length > 0 && (
            <div className="chips">
              {picked.map((p) => (
                <button key={p.id} className="chip chip-person" onClick={() => toggle(p)} aria-label={`Remove ${p.display_name}`}>
                  <Avatar name={p.display_name} src={p.avatar_url} seed={p.id} size={22} /> {p.display_name}
                  <X size={14} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <Input leading={<Search size={16} />} placeholder="Search by name or @username" value={q} onChange={(e) => setQ(e.target.value)} autoFocus trailing={loading ? <Spinner size={14} /> : undefined} aria-label="Search people" />
      <div className="people-list">
        {people.length === 0 && !loading && <p className="faint people-empty">{q.trim() ? "No one found with that name." : "Search for someone by their @username."}</p>}
        {people.map((u) => {
          const on = picked.some((p) => p.id === u.id);
          return (
            <button key={u.id} className={`person ${on ? "is-on" : ""}`} onClick={() => (tab === "dm" ? startDm(u) : toggle(u))} disabled={busy && tab === "dm"}>
              <Avatar name={u.display_name} src={u.avatar_url} seed={u.id} size={40} />
              <span className="grow col" style={{ gap: 0 }}>
                <span className="truncate person-name">{u.display_name}</span>
                <span className="truncate faint">@{u.username}</span>
              </span>
              {tab === "group" && <span className={`check ${on ? "is-on" : ""}`}>{on && <Check size={14} />}</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
