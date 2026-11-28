import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Phone, PhoneIncoming, PhoneMissed, PhoneOff, Trash2, Video } from "lucide-react";
import { Avatar, Button, EmptyState, IconButton, Input, Tabs, Modal } from "../../ui";
import { PageHeader } from "../PageHeader";
import { useCalls, type CallRecord } from "../../stores/calls";
import { conversationPeer, conversationTitle, useChat } from "../../stores/chat";
import { myId, useSession } from "../../stores/session";
import { formatDuration } from "../../lib/voice/format";
import "../../styles/calls.css";

type Filter = "all" | "failed";

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function CallRow({ r }: { r: CallRecord }) {
  const start = useCalls((s) => s.start);
  const starting = useCalls((s) => s.starting);
  const remove = useCalls((s) => s.removeRecord);
  const nav = useNavigate();
  const conv = useChat((s) => s.conversations[r.conversation_id]);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.user?.id ?? "");
  const peer = conv ? conversationPeer(conv, me) : undefined;
  const title = conv ? conversationTitle(conv, users, me) : r.title;
  const src = conv?.avatar_url ?? (peer ? (users[peer.id] ?? peer).avatar_url : null);
  const failed = r.outcome !== "completed";
  const Icon = r.outcome === "missed" ? PhoneMissed : failed ? PhoneOff : r.kind === "video" ? Video : PhoneIncoming;

  return (
    <div className={`call-row ${failed ? "is-failed" : ""}`}>
      <Avatar name={title} src={src} seed={r.conversation_id} size={44} />
      <div className="grow call-row-body">
        <div className="call-row-title truncate">{title}</div>
        <div className="call-row-sub truncate" title={r.reason}>
          <Icon size={13} />
          <span>
            {r.kind === "video" ? "Video" : "Voice"} · {new Date(r.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {failed ? ` · ${r.outcome === "missed" ? "Missed" : "Didn’t connect"}` : r.duration ? ` · ${formatDuration(r.duration)}` : ""}
          </span>
        </div>
      </div>
      <div className="call-row-actions">
        <IconButton label="Delete from history" size="sm" className="call-row-del" onClick={() => remove(r.id)}>
          <Trash2 size={15} />
        </IconButton>
        <IconButton label="Open chat" size="sm" onClick={() => nav(`/chats/${r.conversation_id}`)}>
          <MessageCircle size={17} />
        </IconButton>
        <IconButton label={`Voice call ${title}`} variant="soft" disabled={starting} onClick={() => void start({ conversation_id: r.conversation_id, kind: "voice", title })}>
          <Phone size={17} />
        </IconButton>
        <IconButton label={`Video call ${title}`} variant="soft" disabled={starting} onClick={() => void start({ conversation_id: r.conversation_id, kind: "video", title })}>
          <Video size={17} />
        </IconButton>
      </div>
    </div>
  );
}

function NewCallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const conversations = useChat((s) => s.conversations);
  const users = useChat((s) => s.users);
  const start = useCalls((s) => s.start);
  const starting = useCalls((s) => s.starting);
  const [q, setQ] = useState("");
  const me = myId();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.values(conversations)
      .filter((c) => c.kind !== "channel")
      .map((c) => ({ c, title: conversationTitle(c, users, me) }))
      .filter((x) => !t || x.title.toLowerCase().includes(t))
      .sort((a, b) => (b.c.last_message?.created_at ?? b.c.created_at).localeCompare(a.c.last_message?.created_at ?? a.c.created_at))
      .slice(0, 50);
  }, [conversations, users, me, q]);

  const go = (conversation_id: string, kind: "voice" | "video", title: string) => {
    onClose();
    void start({ conversation_id, kind, title });
  };

  return (
    <Modal open={open} onClose={onClose} title="New call">
      <Input placeholder="Search people and groups" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="call-pick">
        {list.length === 0 && <p className="faint call-pick-empty">{Object.keys(conversations).length ? "No matches." : "Start a chat first — calls happen inside your conversations."}</p>}
        {list.map(({ c, title }) => {
          const peer = conversationPeer(c, me);
          return (
            <div key={c.id} className="call-pick-row">
              <Avatar name={title} src={c.avatar_url ?? (peer ? (users[peer.id] ?? peer).avatar_url : null)} seed={c.id} size={38} />
              <span className="grow truncate">{title}</span>
              <IconButton label={`Voice call ${title}`} variant="soft" size="sm" disabled={starting} onClick={() => go(c.id, "voice", title)}>
                <Phone size={16} />
              </IconButton>
              <IconButton label={`Video call ${title}`} variant="soft" size="sm" disabled={starting} onClick={() => go(c.id, "video", title)}>
                <Video size={16} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function CallsPage() {
  const history = useCalls((s) => s.history);
  const clear = useCalls((s) => s.clearHistory);
  const [filter, setFilter] = useState<Filter>("all");
  const [picker, setPicker] = useState(false);
  const failedCount = history.filter((h) => h.outcome !== "completed").length;
  const rows = filter === "all" ? history : history.filter((h) => h.outcome !== "completed");

  const groups: { label: string; items: CallRecord[] }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.started_at);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(r);
    else groups.push({ label, items: [r] });
  }

  return (
    <div className="page">
      <PageHeader
        title="Calls"
        subtitle="Voice and video, history kept on this device"
        actions={
          <>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear
              </Button>
            )}
            <Button size="sm" icon={<Phone size={16} />} onClick={() => setPicker(true)}>
              New call
            </Button>
          </>
        }
      />
      <div className="page-body calls-body">
        {history.length > 0 && (
          <Tabs<Filter>
            variant="pill"
            value={filter}
            onChange={setFilter}
            items={[
              { id: "all", label: "All" },
              { id: "failed", label: "Missed & failed", count: failedCount },
            ]}
          />
        )}
        {rows.length === 0 ? (
          <EmptyState
            title={history.length ? "Nothing here" : "No calls yet"}
            body={history.length ? "No missed or failed calls." : "Start a voice or video call from any chat, or pick someone here."}
            action={
              !history.length && (
                <Button icon={<Phone size={16} />} onClick={() => setPicker(true)}>
                  Start a call
                </Button>
              )
            }
          />
        ) : (
          groups.map((g) => (
            <section key={g.label} className="call-group">
              <h3 className="call-group-title">{g.label}</h3>
              <div className="call-group-body">
                {g.items.map((r) => (
                  <CallRow key={r.id} r={r} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <NewCallModal open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}
