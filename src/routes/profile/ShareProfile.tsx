import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { X, Link2, Globe, Share2, Download } from "lucide-react";
import type { User } from "@shared";
import { api } from "../../lib/api";
import { useSession } from "../../stores/session";
import { useSettings } from "../../stores/settings";
import { toast } from "../../stores/toast";
import { Switch } from "../../ui";
import { profileUrl } from "./ProfileCard";
import "./share.css";

/** Card colours (blueprint p1): card gradient top-left → bottom-right and the darker QR module gradient. */
export const SHARE_COLORS = [
  { id: "blue", name: "Blue", dot: "#0a17fc", c1: "#3d6bff", c2: "#0a17fc", q1: "#0a1580", q2: "#0010d8" },
  { id: "red", name: "Red", dot: "#ff0b0a", c1: "#ff5a3c", c2: "#e00a0a", q1: "#7a0a05", q2: "#c00806" },
  { id: "pink", name: "Pink", dot: "linear-gradient(135deg,#d801a7,#8f04d3)", c1: "#ff0a8c", c2: "#5b02e6", q1: "#6e0219", q2: "#0d00d4" },
  { id: "green", name: "Green", dot: "linear-gradient(135deg,#009c3b,#00d732)", c1: "#00d732", c2: "#007a2e", q1: "#004d1c", q2: "#006b26" },
  { id: "orange", name: "Orange", dot: "linear-gradient(135deg,#fe7f00,#ffaf00)", c1: "#ffaf00", c2: "#fe6a00", q1: "#7a3300", q2: "#b84a00" },
  { id: "black", name: "Black", dot: "#151518", c1: "#2b2b31", c2: "#050506", q1: "#000000", q2: "#1c1c22" },
] as const;
export type ShareColor = (typeof SHARE_COLORS)[number];
export const shareColor = (id: string | null | undefined): ShareColor => SHARE_COLORS.find((c) => c.id === id) ?? SHARE_COLORS[2];

const linkLabel = (url: string) => url.replace(/^https?:\/\//, "");

/** QR modules as an SVG path (one square per dark module). */
function useQrPath(url: string) {
  return useMemo(() => {
    const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return { d, n };
  }, [url]);
}

function QrCard({ user, color, url, onTap }: { user: User; color: ShareColor; url: string; onTap: () => void }) {
  const { d, n } = useQrPath(url);
  const logo = Math.round(n * 0.22);
  const lo = (n - logo) / 2;
  return (
    <button
      className="sp-card"
      style={{ background: `linear-gradient(135deg, ${color.c1}, ${color.c2})` }}
      onClick={onTap}
      aria-label={`Profile card, ${color.name}. Tap to change its colour.`}
    >
      <span className="sp-qr">
        <svg viewBox={`0 0 ${n} ${n}`} role="img" aria-label={`QR code for @${user.username}`} shapeRendering="crispEdges">
          <defs>
            <linearGradient id="sp-qr-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={color.q1} />
              <stop offset="1" stopColor={color.q2} />
            </linearGradient>
          </defs>
          <path d={d} fill="url(#sp-qr-g)" />
          <rect x={lo - 0.6} y={lo - 0.6} width={logo + 1.2} height={logo + 1.2} rx={1.6} fill="#fff" />
          <image href="/logo-mark.png" x={lo} y={lo} width={logo} height={logo} />
        </svg>
      </span>
      <span className="sp-name">{user.display_name}</span>
      <span className="sp-handle">@{user.username}</span>
      <span className="sp-cap">Scan with any camera to add me on Secrets</span>
    </button>
  );
}

/** Draws the card to a PNG (Save image). */
export async function renderCardPng(user: User, color: ShareColor, url: string): Promise<string> {
  const W = 960;
  const H = 1130;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("Canvas unavailable");
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, color.c1);
  bg.addColorStop(1, color.c2);
  rr(0, 0, W, H, 84);
  g.fillStyle = bg;
  g.fill();
  const box = 726;
  const bx = (W - box) / 2;
  const by = 78;
  rr(bx, by, box, box, 66);
  g.fillStyle = "#fff";
  g.fill();
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const inner = box - 96;
  const m = inner / n;
  const ox = bx + 48;
  const oy = by + 48;
  const qg = g.createLinearGradient(ox, oy, ox + inner, oy + inner);
  qg.addColorStop(0, color.q1);
  qg.addColorStop(1, color.q2);
  g.fillStyle = qg;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) g.fillRect(ox + x * m, oy + y * m, Math.ceil(m), Math.ceil(m));
  const logo = Math.round(n * 0.22) * m;
  const lx = ox + (inner - logo) / 2;
  const ly = oy + (inner - logo) / 2;
  rr(lx - 8, ly - 8, logo + 16, logo + 16, 22);
  g.fillStyle = "#fff";
  g.fill();
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      g.drawImage(img, lx, ly, logo, logo);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = "/logo-mark.png";
  });
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.font = "700 72px Inter, system-ui, sans-serif";
  g.fillText(user.display_name, W / 2, 920);
  g.font = "600 50px Inter, system-ui, sans-serif";
  g.fillText(`@${user.username}`, W / 2, 992);
  g.globalAlpha = 0.88;
  g.font = "400 42px Inter, system-ui, sans-serif";
  g.fillText("Scan with any camera to add me on Secrets", W / 2, 1076);
  return c.toDataURL("image/png");
}

/** Share profile (blueprint p1): recolourable QR card, colour dots, link + Copy, signed-out preview, Share, Save image. */
export function ShareProfilePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const me = useSession((s) => s.user);
  const colorId = useSettings((s) => s.shareColor);
  const preview = useSettings((s) => s.privacy.profilePreview);
  const setSettings = useSettings((s) => s.set);
  const other = params.get("u");
  const [user, setUser] = useState<User | null>(other && other !== me?.username ? null : me);

  useEffect(() => {
    if (!other || other === me?.username) return setUser(me);
    api("GET /v1/users/:username", { params: { username: other } })
      .then(setUser)
      .catch(() => toast.error("Couldn't find that profile"));
  }, [other, me]);

  const color = shareColor(colorId);
  const isMe = !!user && user.id === me?.id;
  const url = user ? profileUrl(user.username) : "";

  const pick = (id: string) => setSettings({ shareColor: id });
  const cycle = () => {
    const i = SHARE_COLORS.findIndex((c) => c.id === color.id);
    pick(SHARE_COLORS[(i + 1) % SHARE_COLORS.length].id);
  };
  const close = () => (window.history.length > 1 ? nav(-1) : nav("/settings"));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  const share = async () => {
    if (!user) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${user.display_name} on Secrets`, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    await copy();
  };
  const save = async () => {
    if (!user) return;
    try {
      const png = await renderCardPng(user, color, url);
      const a = document.createElement("a");
      a.href = png;
      a.download = `secrets-${user.username}.png`;
      a.click();
      toast.success("Image saved");
    } catch {
      toast.error("Couldn't save the image");
    }
  };

  return (
    <div className="sp-screen" role="region" aria-label="Share profile">
      <header className="sp-head">
        <div>
          <h1>Share profile</h1>
          <p>Tap the card to change its colour.</p>
        </div>
        <button className="sp-x" aria-label="Close" onClick={close}>
          <X />
        </button>
      </header>
      {user ? (
        <>
          <QrCard user={user} color={color} url={url} onTap={cycle} />
          <div className="sp-dots" role="radiogroup" aria-label="Card colour">
            {SHARE_COLORS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={c.id === color.id}
                aria-label={c.name}
                className={`sp-dot ${c.id === color.id ? "is-on" : ""}`}
                onClick={() => pick(c.id)}
              >
                <i style={{ background: c.dot }} />
              </button>
            ))}
          </div>
          <div className="sp-link">
            <Link2 aria-hidden />
            <span className="sp-url truncate">{linkLabel(url)}</span>
            <button className="sp-copy" onClick={() => void copy()}>
              Copy
            </button>
          </div>
          {isMe && (
            <div className="sp-preview">
              <Globe aria-hidden />
              <div className="sp-preview-text">
                <strong id="sp-prev-t">Preview for signed-out visitors</strong>
                <span>Show your name, photo and about text to anyone who opens your link.</span>
              </div>
              <Switch variant="accent" checked={preview} onChange={(v) => useSettings.getState().setPrivacy({ profilePreview: v })} label="Preview for signed-out visitors" />
            </div>
          )}
          <div className="sp-actions">
            <button className="sp-share" onClick={() => void share()}>
              <Share2 aria-hidden /> Share
            </button>
            <button className="sp-save" onClick={() => void save()}>
              <Download aria-hidden /> Save image
            </button>
          </div>
        </>
      ) : (
        <div className="sp-card sp-card-skel skeleton" aria-busy />
      )}
    </div>
  );
}
