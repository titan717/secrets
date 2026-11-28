import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ShieldCheck, Lock, UserPlus, LogOut, X, Pencil, Check, Link2, FileText, Pin } from "lucide-react";
import type { Attachment, Conversation, MessageView, User } from "@shared";
import { openBody } from "@shared";
import { conversationPeer, conversationTitle, useChat } from "../../stores/chat";
import { useSession } from "../../stores/session";
import { api, apiRaw, errorMessage } from "../../lib/api";
import { useUserSearch } from "../../lib/useUserSearch";
import { toast } from "../../stores/toast";
import { listTime } from "../../lib/time";
import { AuthImage, Avatar, AvatarStack, Button, GroupAvatar, IconButton, Input, ListItem, Modal, Tabs, Toggle } from "../../ui";
import { extractLinks } from "./linkify";
import { Lightbox } from "./Lightbox";

const EMPTY: MessageView[] = [];

function useMuted(id: string): [boolean, (v: boolean) => void] {
  const key = `secrets.muted.${id}`;
  const [m, setM] = useState(() => localStorage.getItem(key) === "1");
  return [m, (v) => (localStorage.setItem(key, v ? "1" : "0"), setM(v))];
}

export function InfoPanel({ conversation: c, onClose }: { conversation: Conversation; onClose: () => void }) {
  const [tab, setTab] = useState<"members" | "media" | "files" | "links">(c.kind === "dm" ? "media" : "members");
  const me = useSession((s) => s.user);
  const users = useChat((s) => s.users);
  const presence = useChat((s) => s.presence);
  const messages = useChat((s) => s.messages[c.id] ?? EMPTY);
  const upsert = useChat((s) => s.upsertConversation);
  const nav = useNavigate();
  const [muted, setMuted] = useMuted(c.id);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.title ?? "");
  const [lb, setLb] = useState<number | null>(null);
  const [pins, setPins] = useState<MessageView[] | null>(null);
  const title = conversationTitle(c, users, me?.id ?? "");
  const peer = conversationPeer(c, me?.id ?? "");

  const { media, files, links } = useMemo(() => {
    const media: Attachment[] = [], files: Attachment[] = [], links: { url: string; at: string }[] = [];
    for (const m of messages) {
      if (m.deleted) continue;
      const b = openBody(m);
      for (const a of b.attachments ?? []) (a.mime.startsWith("image/") ? media : files).push(a);
      for (const url of extractLinks(b.text ?? "")) links.push({ url, at: m.created_at });
    }
    return { media: media.reverse(), files: files.reverse(), links: links.reverse() };
  }, [messages]);

  const rename = async () => {
    try {
      const updated = await api("PATCH /v1/conversations/:id", { params: { id: c.id }, body: { title: name.trim() } });
      upsert(updated);
      setRenaming(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const leave = async () => {
    if (!me || !window.confirm(`Leave ${title}?`)) return;
    try {
      await api("DELETE /v1/conversations/:id/members/:userId", { params: { id: c.id, userId: me.id } });
      const all = { ...useChat.getState().conversations };
      delete all[c.id];
      useChat.setState({ conversations: all });
      nav("/chats");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const loadPins = async () => {
    try {
      setPins(await apiRaw<MessageView[]>("GET /v1/conversations/:id/pins", { params: { id: c.id } }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="info">
      <div className="info-top">
        <span className="faint info-label">{c.kind === "dm" ? "Contact" : "Group info"}</span>
        <IconButton label="Close details" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="info-hero">
        <div className="info-banner" />
        {c.kind === "dm" ? (
          <Avatar name={title} src={peer?.avatar_url} seed={peer?.id ?? c.id} size={76} online={peer ? !!presence[peer.id] : undefined} ring />
        ) : (
          <GroupAvatar names={c.members.map((m) => m.display_name)} src={c.avatar_url} seed={c.id} size={76} />
        )}
        {renaming ? (
          <div className="row info-rename">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={64} onKeyDown={(e) => e.key === "Enter" && rename()} />
            <IconButton label="Save name" variant="accent" size="sm" onClick={rename}>
              <Check size={16} />
            </IconButton>
          </div>
        ) : (
          <h3 className="info-title">
            {title}
            {c.kind === "group" && (
              <IconButton label="Rename" size="sm" onClick={() => setRenaming(true)}>
                <Pencil size={14} />
              </IconButton>
            )}
          </h3>
        )}
        <p className="faint info-sub">{c.kind === "dm" ? (peer ? `@${peer.username}` : "") : `${c.members.length} members · Private group`}</p>
        {c.kind === "dm" && peer?.about && <p className="muted info-about">{peer.about}</p>}
        {c.kind === "dm" && peer && (
          <Button variant="secondary" size="sm" onClick={() => nav(`/u/${peer.username}`)}>
            View profile
          </Button>
        )}
      </div>

      <div className="list-group-body info-rows">
        <ListItem icon={<Bell size={17} />} title="Notifications" trailing={<Toggle checked={!muted} onChange={(v) => setMuted(!v)} label="Notifications" />} />
        <ListItem icon={<ShieldCheck size={17} />} title="Encryption" value={<span className="faint">E2EE rolling out</span>} />
        <ListItem icon={<Lock size={17} />} title={c.kind === "dm" ? "Direct message" : "Group type"} value="Private" />
        <ListItem icon={<Pin size={17} />} title="Pinned messages" chevron onClick={loadPins} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ...(c.kind !== "dm" ? [{ id: "members" as const, label: "Members", count: c.members.length }] : []),
          { id: "media" as const, label: "Media", count: media.length },
          { id: "files" as const, label: "Files", count: files.length },
          { id: "links" as const, label: "Links", count: links.length },
        ]}
      />

      <div className="info-tab">
        {tab === "members" && (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <AvatarStack people={c.members.map((m) => ({ id: m.id, name: m.display_name, src: m.avatar_url }))} max={6} />
            </div>
            <Button variant="secondary" block icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>
              Add members
            </Button>
            <div className="member-list">
              {c.members.map((m) => (
                <button key={m.id} className="person" onClick={() => nav(`/u/${m.username}`)}>
                  <Avatar name={m.display_name} src={m.avatar_url} seed={m.id} size={36} online={!!presence[m.id]} />
                  <span className="grow col" style={{ gap: 0 }}>
                    <span className="truncate person-name">
                      {m.display_name}
                      {m.id === me?.id && <span className="faint"> (you)</span>}
                    </span>
                    <span className="truncate faint">@{m.username}</span>
                  </span>
                </button>
              ))}
            </div>
            <Button variant="danger" block icon={<LogOut size={16} />} onClick={leave}>
              Leave group
            </Button>
          </>
        )}
        {tab === "media" &&
          (media.length ? (
            <div className="media-grid">
              {media.map((a, i) => (
                <button key={a.id + i} onClick={() => setLb(i)} aria-label="Open photo">
                  <AuthImage path={a.url} alt="" />
                </button>
              ))}
            </div>
          ) : (
            <p className="faint info-empty">Photos you share here will show up in this tab.</p>
          ))}
        {tab === "files" &&
          (files.length ? (
            files.map((f) => <ListItem key={f.id} icon={<FileText size={17} />} title={f.name ?? "File"} subtitle={`${Math.round(f.size / 1024)} KB`} />)
          ) : (
            <p className="faint info-empty">No files yet.</p>
          ))}
        {tab === "links" &&
          (links.length ? (
            links.map((l, i) => (
              <a key={l.url + i} className="link-row" href={l.url} target="_blank" rel="noreferrer noopener">
                <Link2 size={16} />
                <span className="grow truncate">{l.url.replace(/^https?:\/\//, "")}</span>
                <span className="faint">{listTime(l.at)}</span>
              </a>
            ))
          ) : (
            <p className="faint info-empty">Links shared in this chat will collect here.</p>
          ))}
      </div>
      {lb !== null && <Lightbox items={media} index={lb} onIndex={setLb} onClose={() => setLb(null)} />}
      <AddMembersModal open={adding} onClose={() => setAdding(false)} conversation={c} />
      <Modal open={pins !== null} onClose={() => setPins(null)} title="Pinned messages">
        {pins?.length ? (
          pins.map((m) => {
            const b = openBody(m);
            const u = users[m.sender_id];
            return <ListItem key={m.id} leading={<Avatar name={u?.display_name ?? "?"} seed={m.sender_id} size={32} />} title={u?.display_name ?? "Someone"} subtitle={b.text || (b.attachments?.length ? "Photo" : "")} value={listTime(m.created_at)} />;
          })
        ) : (
          <p className="faint">Nothing pinned yet. Hover a message and tap the pin to keep it handy.</p>
        )}
      </Modal>
    </div>
  );
}

function AddMembersModal({ open, onClose, conversation }: { open: boolean; onClose: () => void; conversation: Conversation }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const { results } = useUserSearch(q);
  const upsert = useChat((s) => s.upsertConversation);
  const existing = new Set(conversation.members.map((m) => m.id));
  const add = async () => {
    setBusy(true);
    try {
      const c = await api("POST /v1/conversations/:id/members", { params: { id: conversation.id }, body: { user_ids: picked.map((p) => p.id) } });
      upsert(c);
      toast.success(`Added ${picked.length} ${picked.length === 1 ? "person" : "people"}`);
      setPicked([]);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add members" footer={<Button onClick={add} loading={busy} disabled={!picked.length}>Add {picked.length || ""}</Button>}>
      <Input placeholder="Search by name or @username" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="people-list">
        {results
          .filter((u) => !existing.has(u.id))
          .map((u) => {
            const on = picked.some((p) => p.id === u.id);
            return (
              <button key={u.id} className={`person ${on ? "is-on" : ""}`} onClick={() => setPicked(on ? picked.filter((p) => p.id !== u.id) : [...picked, u])}>
                <Avatar name={u.display_name} src={u.avatar_url} seed={u.id} size={36} />
                <span className="grow col" style={{ gap: 0 }}>
                  <span className="truncate person-name">{u.display_name}</span>
                  <span className="truncate faint">@{u.username}</span>
                </span>
                <span className={`check ${on ? "is-on" : ""}`}>{on && <Check size={14} />}</span>
              </button>
            );
          })}
      </div>
    </Modal>
  );
}
