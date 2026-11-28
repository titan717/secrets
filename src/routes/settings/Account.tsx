import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AtSign, CircleCheck, KeyRound, Laptop, Lock, Mail, Trash2 } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../stores/session";
import { toast } from "../../stores/toast";
import { Avatar, Group, PillButton, Row, Screen, ScreenBody, ScreenHeader, SectionLabel, Sheet } from "../../ui";
import { useLogout } from "../Shell";
import { copyText } from "./shared";

/** Account (blueprint p5). */
export function AccountScreen() {
  const user = useSession((s) => s.user);
  const deviceId = useSession((s) => s.deviceId);
  const nav = useNavigate();
  const logout = useLogout();
  const [sheet, setSheet] = useState<null | "password" | "devices" | "delete" | "2fa">(null);
  const [pw, setPw] = useState({ old: "", next: "" });
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const close = () => setSheet(null);

  const changePassword = async () => {
    setBusy(true);
    try {
      await api("POST /v1/auth/change-password", { body: { current_password: pw.old, new_password: pw.next } });
      toast.success("Password changed");
      setPw({ old: "", next: "" });
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const deleteAccount = async () => {
    setBusy(true);
    try {
      await api("DELETE /v1/me");
      await logout();
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen label="Account">
      <ScreenHeader title="Account" back="/settings" />
      <ScreenBody>
        <Group label="Account">
          <Row icon={<Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={30} />} className="acc-profile" title="Profile" to="/settings/profile" />
          <Row
            icon={<AtSign />}
            title="Username"
            value={`@${user.username}`}
            chevron
            onClick={() => void copyText(`@${user.username}`).then((ok) => (ok ? toast.success("Username copied") : toast.error("Couldn’t copy")))}
          />
          <Row icon={<Mail />} title="Email" sub={user.email || "Not added"} disabled />
          <Row icon={<CircleCheck />} title="Verified" chevron onClick={() => (user.email_verified ? toast.info("Your email is verified") : nav("/verify"))} />
        </Group>

        <SectionLabel>Security</SectionLabel>
        <Group label="Security">
          <Row icon={<Lock />} title="Two-factor authentication" value="Off" chevron onClick={() => setSheet("2fa")} />
          <Row icon={<KeyRound />} title="Password" chevron onClick={() => setSheet("password")} />
          <Row icon={<Laptop />} title="Linked devices" chevron onClick={() => setSheet("devices")} />
        </Group>

        <Group label="Danger zone" className="acc-danger">
          <Row icon={<Trash2 className="acc-trash" />} title="Delete account" chevron onClick={() => setSheet("delete")} />
        </Group>
      </ScreenBody>

      <Sheet open={sheet === "2fa"} onClose={close} title="Two-factor authentication">
        <h3 className="sheet-h">Two-factor authentication</h3>
        <p className="sheet-p">Add a second step when you sign in on a new device. Authenticator apps are coming to Secrets soon.</p>
        <PillButton onClick={close}>Got it</PillButton>
      </Sheet>

      <Sheet open={sheet === "password"} onClose={close} title="Change password">
        <h3 className="sheet-h">Change password</h3>
        <input className="bp-field" type="password" placeholder="Current password" autoComplete="current-password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} aria-label="Current password" />
        <input className="bp-field" style={{ marginTop: 10 }} type="password" placeholder="New password (8+ characters)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} aria-label="New password" />
        <div className="sheet-actions">
          <PillButton disabled={!pw.old || pw.next.length < 8 || busy} onClick={() => void changePassword()}>
            Change password
          </PillButton>
        </div>
      </Sheet>

      <Sheet open={sheet === "devices"} onClose={close} title="Linked devices">
        <h3 className="sheet-h">Linked devices</h3>
        <div className="bp-group" style={{ marginTop: 0 }}>
          <Row icon={<Laptop />} title="This browser" sub={`Active now · ${deviceId.slice(0, 8)}`} disabled />
        </div>
        <p className="sheet-p" style={{ marginTop: 14 }}>
          Devices you sign in on show up here.
        </p>
      </Sheet>

      <Sheet open={sheet === "delete"} onClose={close} title="Delete account">
        <h3 className="sheet-h">Delete account?</h3>
        <p className="sheet-p">This removes your profile, chats and docks from Secrets. You can’t undo this.</p>
        <div className="sheet-actions">
          <PillButton variant="ghost" onClick={close}>
            Cancel
          </PillButton>
          <PillButton className="is-danger" disabled={busy} onClick={() => void deleteAccount()}>
            Delete
          </PillButton>
        </div>
      </Sheet>
    </Screen>
  );
}
