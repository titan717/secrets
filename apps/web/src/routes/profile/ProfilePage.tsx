import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Pencil, QrCode, Settings, Palette, Bell, Shield, LogOut, AtSign, CalendarDays, Copy } from "lucide-react";
import type { User } from "@secrets/shared";
import { api, errorMessage } from "../../lib/api";
import { uploadAttachment } from "../../lib/media";
import { useSession } from "../../stores/session";
import { useDocks } from "../../stores/docks";
import { useChat } from "../../stores/chat";
import { toast } from "../../stores/toast";
import { Avatar, Button, IconButton, Input, Modal, TextArea, ListGroup, ListItem, Spinner } from "../../ui";
import { useLogout } from "../Shell";
import { ShareProfileModal, bannerStyle, profileUrl } from "./ProfileCard";
import "./profile.css";

export function ProfilePage() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const nav = useNavigate();
  const logout = useLogout();
  const docks = useDocks((s) => s.mine.length);
  const chats = useChat((s) => Object.keys(s.conversations).length);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void useDocks.getState().loadMine();
  }, []);

  if (!user) return null;

  const patch = async (body: Partial<Pick<User, "display_name" | "about" | "avatar_url" | "accent">>) => {
    const u = await api("PATCH /v1/me", { body });
    setUser(u);
    return u;
  };

  const onAvatar = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file");
    setUploading(true);
    try {
      const att = await uploadAttachment(f);
      await patch({ avatar_url: att.url });
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const joined = new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="page profile-page">
      <div className="profile-hero">
        <div className="profile-banner" style={bannerStyle(user.accent)}>
          <div className="profile-banner-actions">
            <IconButton label="Share profile" variant="soft" onClick={() => setSharing(true)}>
              <QrCode size={19} />
            </IconButton>
            <IconButton label="Settings" variant="soft" onClick={() => nav("/settings")}>
              <Settings size={19} />
            </IconButton>
          </div>
        </div>
        <div className="profile-id">
          <button className="profile-avatar" onClick={() => fileRef.current?.click()} aria-label="Change profile photo">
            <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={112} ring />
            <span className="profile-avatar-cam">{uploading ? <Spinner size={16} /> : <Camera size={16} />}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onAvatar(e.target.files?.[0])} />
          <div className="profile-names">
            <h1>{user.display_name}</h1>
            <span className="profile-handle">@{user.username}</span>
          </div>
          <div className="row profile-cta">
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
              Edit profile
            </Button>
            <Button icon={<QrCode size={16} />} onClick={() => setSharing(true)}>
              Share
            </Button>
          </div>
        </div>
      </div>

      <div className="page-body profile-body">
        <section className="profile-about">
          <h3 className="list-group-title">About</h3>
          <p className={user.about ? "" : "faint"}>{user.about || "Add a few words so people know it’s you."}</p>
          <div className="row profile-meta">
            <span>
              <CalendarDays size={14} /> Joined {joined}
            </span>
            <span>
              <AtSign size={14} /> {chats} chats · {docks} docks
            </span>
          </div>
        </section>

        <ListGroup title="Your link">
          <ListItem
            icon={<Copy size={18} />}
            title={profileUrl(user.username).replace(/^https?:\/\//, "")}
            subtitle="Anyone with this link can message you"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(profileUrl(user.username));
                toast.success("Link copied");
              } catch {
                toast.error("Couldn’t copy");
              }
            }}
          />
          <ListItem icon={<QrCode size={18} />} title="QR code" subtitle="Let friends scan to find you" chevron onClick={() => setSharing(true)} />
        </ListGroup>

        <ListGroup title="Settings">
          <ListItem icon={<Palette size={18} />} title="Appearance" subtitle="Theme, accent, wallpaper" chevron onClick={() => nav("/settings/appearance")} />
          <ListItem icon={<Bell size={18} />} title="Notifications" chevron onClick={() => nav("/settings/notifications")} />
          <ListItem icon={<Shield size={18} />} title="Privacy & security" chevron onClick={() => nav("/settings/privacy")} />
          <ListItem icon={<Settings size={18} />} title="All settings" chevron onClick={() => nav("/settings")} />
        </ListGroup>

        <ListGroup>
          <ListItem icon={<LogOut size={18} />} title="Log out" danger onClick={() => void logout()} />
        </ListGroup>
      </div>

      <EditProfileModal open={editing} onClose={() => setEditing(false)} onSave={patch} />
      <ShareProfileModal
        user={user}
        open={sharing}
        onClose={() => setSharing(false)}
        onAccent={(id) => {
          void patch({ accent: id }).catch((e) => toast.error(errorMessage(e)));
        }}
      />
    </div>
  );
}

function EditProfileModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (b: { display_name?: string; about?: string }) => Promise<unknown> }) {
  const user = useSession((s) => s.user)!;
  const [name, setName] = useState(user.display_name);
  const [about, setAbout] = useState(user.about);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setName(user.display_name);
    setAbout(user.about);
    setErr(null);
  } else if (!open && lastOpen) setLastOpen(false);

  const save = async () => {
    if (!name.trim()) return setErr("Your name can’t be empty");
    setBusy(true);
    try {
      await onSave({ display_name: name.trim(), about: about.trim() });
      toast.success("Profile saved");
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: "var(--s-4)" }}>
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} error={err} autoFocus />
        <Input label="Username" value={`@${user.username}`} disabled hint="Usernames can’t be changed yet." />
        <TextArea label="About" value={about} onChange={(e) => setAbout(e.target.value)} rows={3} maxLength={160} hint={`${about.length}/160`} placeholder="Coffee, climbing and late-night playlists." />
      </div>
    </Modal>
  );
}
