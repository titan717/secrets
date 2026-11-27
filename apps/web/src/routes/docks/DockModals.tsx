import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Lock, Copy, RefreshCw, Hash, Trash2, Plus, Check, Pencil, X, Crown, Shield } from "lucide-react";
import type { Dock, DockRole } from "@secrets/shared";
import { Button, IconButton, Input, Modal, TextArea, Tabs, Avatar, Badge } from "../../ui";
import { errorMessage } from "../../lib/api";
import { toast } from "../../stores/toast";
import { useDocks, inviteLink, isStaff, roleRank } from "../../stores/docks";
import { useSession } from "../../stores/session";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

export function VisibilityPicker({ value, onChange }: { value: Dock["visibility"]; onChange: (v: Dock["visibility"]) => void }) {
  return (
    <div className="vis-picker" role="radiogroup" aria-label="Who can find this dock">
      {(
        [
          ["public", Globe, "Public", "Anyone can discover and join"],
          ["private", Lock, "Private", "Invite code only"],
        ] as const
      ).map(([v, Icon, label, hint]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`vis-opt ${value === v ? "is-active" : ""}`} onClick={() => onChange(v)}>
          <Icon size={18} />
          <span className="col" style={{ gap: 2 }}>
            <strong>{label}</strong>
            <span className="faint">{hint}</span>
          </span>
          <span className="vis-dot" />
        </button>
      ))}
    </div>
  );
}

export function CreateDockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const create = useDocks((s) => s.create);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Dock["visibility"]>("public");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setHandle("");
      setHandleTouched(false);
      setDescription("");
      setVisibility("public");
      setErr(null);
    }
  }, [open]);

  const h = handleTouched ? handle : slugify(name);
  const handleOk = /^[a-z0-9][a-z0-9-]{1,31}$/.test(h);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || !handleOk) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await create({ name: name.trim(), handle: h, description: description.trim() || undefined, visibility });
      toast.success(`${d.name} is ready`);
      onClose();
      const first = d.channels?.[0];
      nav(first ? `/docks/${d.id}/${first.id}` : `/docks/${d.id}`);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a dock"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!name.trim() || !handleOk}>
            Create dock
          </Button>
        </>
      }
    >
      <form className="col" style={{ gap: "var(--s-4)" }} onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>
          A dock is a home for a community — channels, members and roles in one place.
        </p>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Night Owls Book Club" maxLength={48} autoFocus />
        <Input
          label="Handle"
          leading={<span className="faint">/</span>}
          value={h}
          onChange={(e) => {
            setHandleTouched(true);
            setHandle(slugify(e.target.value));
          }}
          hint={h ? (handleOk ? `secrets.app/d/${h}` : "2–32 letters, numbers or dashes") : "Used in links to your dock"}
          error={h && !handleOk ? "That handle won’t work" : null}
        />
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What’s this dock about?" rows={2} maxLength={280} />
        <VisibilityPicker value={visibility} onChange={setVisibility} />
        {err && <p className="field-error">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function JoinCodeModal({ open, onClose, initialCode }: { open: boolean; onClose: () => void; initialCode?: string }) {
  const nav = useNavigate();
  const joinByCode = useDocks((s) => s.joinByCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCode(initialCode ?? "");
      setErr(null);
    }
  }, [open, initialCode]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // Accept a whole invite link too.
    const raw = code.trim();
    const m = raw.match(/[?&]join=([^&]+)/);
    const c = m ? decodeURIComponent(m[1]) : raw;
    if (!c) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await joinByCode(c);
      toast.success(`Welcome to ${d.name}`);
      onClose();
      const first = d.channels?.[0];
      nav(first ? `/docks/${d.id}/${first.id}` : `/docks/${d.id}`);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join with an invite"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!code.trim()}>
            Join dock
          </Button>
        </>
      }
    >
      <form className="col" style={{ gap: "var(--s-3)" }} onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>
          Paste an invite code or link someone shared with you.
        </p>
        <Input label="Invite code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. k3x9-pq2m" autoFocus error={err} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function RoleBadge({ role }: { role: DockRole }) {
  if (role === "owner")
    return (
      <Badge tone="accent">
        <Crown size={11} /> Owner
      </Badge>
    );
  if (role === "admin")
    return (
      <Badge tone="neutral">
        <Shield size={11} /> Admin
      </Badge>
    );
  return null;
}

export function InviteBox({ dock }: { dock: Dock }) {
  const invite = useDocks((s) => s.invite);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const gen = async () => {
    setBusy(true);
    try {
      setCode(await invite(dock.id));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (what: "code" | "link") => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(what === "code" ? code : inviteLink(code));
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Couldn’t copy — select and copy it manually.");
    }
  };
  return (
    <div className="invite-box">
      {code ? (
        <>
          <div className="invite-code" aria-label="Invite code">
            {code}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="secondary" icon={copied === "code" ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copy("code")}>
              {copied === "code" ? "Copied" : "Copy code"}
            </Button>
            <Button size="sm" variant="secondary" icon={copied === "link" ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copy("link")}>
              {copied === "link" ? "Copied" : "Copy link"}
            </Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void gen()} loading={busy}>
              New code
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {dock.visibility === "private" ? "This dock is private — people need an invite code to join." : "Share a code so friends can jump straight in."}
          </p>
          <Button size="sm" onClick={() => void gen()} loading={busy}>
            Create invite code
          </Button>
        </>
      )}
    </div>
  );
}

type Tab = "overview" | "channels" | "members" | "invite";

export function ManageDockModal({ dock, open, onClose, initialTab = "overview" }: { dock: Dock; open: boolean; onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  return (
    <Modal open={open} onClose={onClose} title={`Manage ${dock.name}`} size="lg" className="manage-modal">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "channels", label: "Channels", count: dock.channels.length },
          { id: "members", label: "Members", count: dock.member_count },
          { id: "invite", label: "Invite" },
        ]}
      />
      <div className="manage-body">
        {tab === "overview" && <OverviewTab dock={dock} onClose={onClose} />}
        {tab === "channels" && <ChannelsTab dock={dock} />}
        {tab === "members" && <MembersTab dock={dock} />}
        {tab === "invite" && <InviteBox dock={dock} />}
      </div>
    </Modal>
  );
}

function OverviewTab({ dock, onClose }: { dock: Dock; onClose: () => void }) {
  const nav = useNavigate();
  const { update, remove } = useDocks.getState();
  const [name, setName] = useState(dock.name);
  const [description, setDescription] = useState(dock.description);
  const [visibility, setVisibility] = useState(dock.visibility);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = name.trim() !== dock.name || description !== dock.description || visibility !== dock.visibility;
  const save = async () => {
    setBusy(true);
    try {
      await update(dock.id, { name: name.trim(), description, visibility });
      toast.success("Dock updated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    try {
      await remove(dock.id);
      toast.success(`${dock.name} was deleted`);
      onClose();
      nav("/docks");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="col" style={{ gap: "var(--s-4)" }}>
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} />
      <Input label="Handle" value={dock.handle} disabled hint="Handles can’t be changed yet." />
      <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={280} />
      <VisibilityPicker value={visibility} onChange={setVisibility} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={() => void save()} disabled={!dirty || !name.trim()} loading={busy}>
          Save changes
        </Button>
      </div>
      {dock.my_role === "owner" && (
        <div className="danger-zone">
          <div className="col" style={{ gap: 2 }}>
            <strong>Delete dock</strong>
            <span className="faint">Removes every channel and message for everyone. This can’t be undone.</span>
          </div>
          {confirm ? (
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Keep it
              </Button>
              <Button size="sm" variant="danger" onClick={() => void del()}>
                Delete forever
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirm(true)}>
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const channelSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);

function ChannelsTab({ dock }: { dock: Dock }) {
  const { addChannel, editChannel, deleteChannel } = useDocks.getState();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eTopic, setETopic] = useState("");
  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const n = channelSlug(name);
    if (!n) return;
    setBusy(true);
    try {
      await addChannel(dock.id, n, topic.trim() || undefined);
      setName("");
      setTopic("");
      toast.success(`#${n} created`);
    } catch (e2) {
      toast.error(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="col" style={{ gap: "var(--s-4)" }}>
      <form className="add-channel" onSubmit={add}>
        <Input label="New channel" leading={<Hash size={15} />} value={name} onChange={(e) => setName(channelSlug(e.target.value))} placeholder="general" />
        <Input label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What’s it for?" />
        <Button type="submit" icon={<Plus size={16} />} loading={busy} disabled={!name}>
          Add
        </Button>
      </form>
      <div className="col" style={{ gap: 4 }}>
        {dock.channels.map((c) =>
          editing === c.id ? (
            <div key={c.id} className="channel-edit">
              <Input value={eName} onChange={(e) => setEName(channelSlug(e.target.value))} leading={<Hash size={15} />} aria-label="Channel name" />
              <Input value={eTopic} onChange={(e) => setETopic(e.target.value)} placeholder="Topic" aria-label="Channel topic" />
              <IconButton
                label="Save"
                variant="accent"
                onClick={async () => {
                  try {
                    await editChannel(dock.id, c.id, { name: eName, topic: eTopic });
                    setEditing(null);
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <Check size={17} />
              </IconButton>
              <IconButton label="Cancel" onClick={() => setEditing(null)}>
                <X size={17} />
              </IconButton>
            </div>
          ) : (
            <div key={c.id} className="channel-row">
              <Hash size={16} className="faint" />
              <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                <span className="truncate">{c.name}</span>
                {c.topic && <span className="faint truncate" style={{ fontSize: "var(--text-xs)" }}>{c.topic}</span>}
              </span>
              <IconButton
                label={`Edit #${c.name}`}
                size="sm"
                onClick={() => {
                  setEditing(c.id);
                  setEName(c.name);
                  setETopic(c.topic);
                }}
              >
                <Pencil size={15} />
              </IconButton>
              <IconButton
                label={`Delete #${c.name}`}
                size="sm"
                variant="danger"
                disabled={dock.channels.length <= 1}
                onClick={async () => {
                  if (!window.confirm(`Delete #${c.name} and all its messages?`)) return;
                  try {
                    await deleteChannel(dock.id, c.id);
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function MembersTab({ dock }: { dock: Dock }) {
  const members = useDocks((s) => s.members[dock.id]);
  const { loadMembers, setRole, kick } = useDocks.getState();
  const me = useSession((s) => s.user?.id);
  const [q, setQ] = useState("");
  useEffect(() => {
    void loadMembers(dock.id).catch(() => {});
  }, [dock.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const l = (members ?? []).filter((m) => !q || m.user.display_name.toLowerCase().includes(q.toLowerCase()) || m.user.username.includes(q.toLowerCase()));
    return l.sort((a, b) => roleRank[b.role] - roleRank[a.role] || a.user.display_name.localeCompare(b.user.display_name));
  }, [members, q]);
  const myRole = dock.my_role;
  return (
    <div className="col" style={{ gap: "var(--s-3)" }}>
      <Input placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
      {!members && <p className="faint">Loading members…</p>}
      {list.map((m) => {
        const canEdit = m.user.id !== me && m.role !== "owner" && (myRole === "owner" || (myRole === "admin" && m.role === "member"));
        return (
          <div key={m.user.id} className="member-row">
            <Avatar name={m.user.display_name} src={m.user.avatar_url} seed={m.user.id} size={36} />
            <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
              <span className="truncate member-name">
                {m.user.display_name} {m.user.id === me && <span className="faint">(you)</span>}
              </span>
              <span className="faint truncate">@{m.user.username}</span>
            </span>
            {canEdit ? (
              <>
                <select
                  className="select"
                  value={m.role}
                  aria-label={`Role for ${m.user.display_name}`}
                  onChange={async (e) => {
                    try {
                      await setRole(dock.id, m.user.id, e.target.value as DockRole);
                    } catch (e2) {
                      toast.error(errorMessage(e2));
                    }
                  }}
                  disabled={myRole !== "owner"}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <IconButton
                  label={`Remove ${m.user.display_name}`}
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!window.confirm(`Remove ${m.user.display_name} from ${dock.name}?`)) return;
                    try {
                      await kick(dock.id, m.user.id);
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  <X size={16} />
                </IconButton>
              </>
            ) : (
              <RoleBadge role={m.role} />
            )}
          </div>
        );
      })}
      {isStaff(myRole) && <p className="faint" style={{ fontSize: "var(--text-xs)" }}>Owners can promote members to admin. Admins can post in #announcements and manage channels.</p>}
    </div>
  );
}
