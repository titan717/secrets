import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Share2, Download } from "lucide-react";
import type { User } from "@shared";
import { ALL_ACCENTS, findAccent, accentCss, type Accent } from "../../lib/theme";
import { Avatar, Button, Modal, LogoMark } from "../../ui";
import { toast } from "../../stores/toast";

export const profileUrl = (username: string) => `${location.origin}/u/${username}`;

/** Gradient banner color for a profile (uses their accent, falls back to Secrets violet). */
export function bannerStyle(accent: string | null | undefined): React.CSSProperties {
  const a = findAccent(accent ?? "g-secrets");
  return {
    background: `radial-gradient(120% 140% at 0% 0%, ${a.c1}cc, transparent 60%), radial-gradient(120% 140% at 100% 100%, ${a.c2}cc, transparent 55%), linear-gradient(135deg, ${a.c1}55, ${a.c2}88)`,
  };
}

export function AccentSwatches({ value, onChange, size = 32 }: { value: string; onChange: (id: string) => void; size?: number }) {
  const row = (list: Accent[]) =>
    list.map((a) => (
      <button
        key={a.id}
        type="button"
        className={`swatch ${value === a.id ? "is-active" : ""}`}
        style={{ width: size, height: size, background: accentCss(a) }}
        onClick={() => onChange(a.id)}
        aria-label={a.name}
        aria-pressed={value === a.id}
        title={a.name}
      />
    ));
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="swatches">{row(ALL_ACCENTS.filter((a) => !a.gradient))}</div>
      <div className="swatches">{row(ALL_ACCENTS.filter((a) => a.gradient))}</div>
    </div>
  );
}

export function ShareProfileModal({ user, open, onClose, onAccent }: { user: User; open: boolean; onClose: () => void; onAccent?: (id: string) => void }) {
  const [accent, setAccent] = useState(user.accent ?? "g-secrets");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = profileUrl(user.username);
  useEffect(() => {
    if (open) setAccent(user.accent ?? "g-secrets");
  }, [open, user.accent]);
  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 1, width: 440, errorCorrectionLevel: "M", color: { dark: "#0b0a10", light: "#ffffff" } }).then(setQr);
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn’t copy the link");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${user.display_name} on Secrets`, url });
      } catch {
        /* cancelled */
      }
    } else void copy();
  };
  const download = () => {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `secrets-${user.username}.png`;
    a.click();
  };

  return (
    <Modal open={open} onClose={onClose} title="Share profile" size="sm" className="share-modal">
      <div className="col" style={{ gap: "var(--s-5)", alignItems: "center" }}>
        <div className="share-card" style={bannerStyle(accent)}>
          <div className="share-card-top">
            <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={64} ring />
            <div className="col" style={{ gap: 0, minWidth: 0 }}>
              <strong className="truncate">{user.display_name}</strong>
              <span className="truncate">@{user.username}</span>
            </div>
          </div>
          <div className="share-qr">{qr ? <img src={qr} alt={`QR code for @${user.username}`} /> : <span className="skeleton" style={{ width: "100%", height: "100%" }} />}<span className="share-qr-mark"><LogoMark size={30} /></span></div>
          <span className="share-card-foot">Scan to chat on Secrets</span>
        </div>
        <div className="col" style={{ gap: 8, width: "100%" }}>
          <span className="field-label">Card color</span>
          <AccentSwatches
            value={accent}
            onChange={(id) => {
              setAccent(id);
              onAccent?.(id);
            }}
            size={28}
          />
        </div>
        <div className="row" style={{ gap: 8, width: "100%" }}>
          <Button variant="secondary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()} style={{ flex: 1 }}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={download} aria-label="Save QR code">
            Save
          </Button>
          <Button icon={<Share2 size={16} />} onClick={() => void share()} style={{ flex: 1 }}>
            Share
          </Button>
        </div>
      </div>
    </Modal>
  );
}
