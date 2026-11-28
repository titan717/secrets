import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Palette, Type, User as UserIcon } from "lucide-react";
import { errorMessage } from "../../lib/api";
import { uploadAttachment } from "../../lib/media";
import { useSession } from "../../stores/session";
import { useSettings } from "../../stores/settings";
import { toast } from "../../stores/toast";
import { Avatar, Group, PillButton, Row, Screen, ScreenBody, ScreenHeader, SectionLabel, Spinner } from "../../ui";
import { NameBannerSheet, NameStyleSheet, NameBannerStrip, StyledName, bannerById } from "../profile/NameStyle";
import { patchMe } from "./shared";

/** Profile (blueprint p4). */
export function ProfileScreen() {
  const user = useSession((s) => s.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const onPhoto = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file");
    setBusy(true);
    try {
      const att = await uploadAttachment(f);
      await patchMe({ avatar_url: att.url });
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <Screen label="Profile">
      <ScreenHeader title="Profile" back="/settings/account" />
      <ScreenBody>
        <div className="pe-photo">
          <button className="pe-avatar" onClick={() => fileRef.current?.click()} aria-label="Edit photo">
            <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={96} />
            {busy && (
              <span className="pe-busy">
                <Spinner size={20} />
              </span>
            )}
          </button>
          <button className="pe-edit" onClick={() => fileRef.current?.click()}>
            Edit photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </div>
        <Group label="Profile">
          <Row icon={<UserIcon />} title="Name" sub={user.display_name} to="/settings/profile/name" />
          <Row icon={<MessageCircle />} title="About" sub={user.about || "Add about"} to="/settings/profile/about" />
        </Group>
        <p className="bp-foot">Your photo, name and about are visible to everyone.</p>
      </ScreenBody>
    </Screen>
  );
}

/** Name editor. Not drawn in the blueprint; follows onboarding p39–40 plus rows for p55/p56 (see BLUEPRINT-NOTES). */
export function NameScreen() {
  const user = useSession((s) => s.user);
  const banner = bannerById(useSettings((s) => s.nameBanner));
  const nav = useNavigate();
  const [name, setName] = useState(user?.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  if (!user) return null;
  const trimmed = name.trim();
  const save = async () => {
    setBusy(true);
    try {
      await patchMe({ display_name: trimmed });
      toast.success("Name saved");
      nav("/settings/profile");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen label="Name">
      <ScreenHeader title="Name" back="/settings/profile" />
      <ScreenBody>
        <h2 className="ob-title" style={{ marginTop: 28 }}>
          What’s your name?
        </h2>
        <p className="ob-sub">This is how people will see you. You can change it any time.</p>
        <input className="ob-line" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} placeholder="Your name" aria-label="Your name" />
        <div className="pe-preview" aria-label="Preview">
          <StyledName name={trimmed || user.display_name} />
        </div>
        <Group label="Name style">
          <Row icon={<Type />} title="Display name style" sub="Font and colour" onClick={() => setStyleOpen(true)} chevron />
          <Row icon={<Palette />} title="Name banner" sub={banner?.name ?? "None"} onClick={() => setBannerOpen(true)} chevron />
        </Group>
        {banner && (
          <div style={{ marginTop: 12 }}>
            <NameBannerStrip banner={banner} />
          </div>
        )}
        <div style={{ marginTop: 28 }}>
          <PillButton disabled={!trimmed || trimmed === user.display_name || busy} onClick={() => void save()}>
            Save
          </PillButton>
        </div>
      </ScreenBody>
      <NameStyleSheet open={styleOpen} onClose={() => setStyleOpen(false)} />
      <NameBannerSheet open={bannerOpen} onClose={() => setBannerOpen(false)} />
    </Screen>
  );
}

export const ABOUT_PRESETS = [
  { emoji: "💬", text: "Here to connect" },
  { emoji: "🎧", text: "Deep work mode" },
  { emoji: "🛠️", text: "Building what comes next" },
  { emoji: "🌙", text: "Usually online late" },
  { emoji: "📚", text: "Learning every day" },
  { emoji: "☕", text: "Coffee and good conversations" },
];

/** About (blueprint p19): 160 characters + preset chips. */
export function AboutScreen() {
  const user = useSession((s) => s.user);
  const nav = useNavigate();
  const [about, setAbout] = useState(user?.about ?? "");
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const save = async () => {
    setBusy(true);
    try {
      await patchMe({ about: about.trim() });
      toast.success("About saved");
      nav("/settings/profile");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen label="About" className="ab-screen">
      <ScreenHeader title="About" size="lg" divider={false} back="/settings/profile" />
      <ScreenBody className="ab-body">
        <SectionLabel aside={<span className="ab-count">{about.length}/160</span>}>
          <label htmlFor="about-input">About</label>
        </SectionLabel>
        <textarea id="about-input" className="bp-field ab-field" value={about} maxLength={160} rows={3} placeholder="Tell something about yourself..." onChange={(e) => setAbout(e.target.value.slice(0, 160))} />
        <ul className="ab-presets" aria-label="Suggestions">
          {ABOUT_PRESETS.map((p) => (
            <li key={p.text}>
              <button onClick={() => setAbout(`${p.emoji} ${p.text}`)}>
                <span className="ab-emoji" aria-hidden>
                  {p.emoji}
                </span>
                <span>{p.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </ScreenBody>
      <button className="ab-save" onClick={() => void save()} disabled={busy || about.trim() === (user.about ?? "").trim()}>
        Save
      </button>
    </Screen>
  );
}
