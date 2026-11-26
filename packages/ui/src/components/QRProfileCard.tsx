import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { Copy, Download } from "lucide-react";
import { cx } from "../cx";
import { profileLink } from "../shared/format";
import { Avatar } from "./Avatar";
import { Button } from "./Button";

/** Build an SVG path for a QR code (module = 1 unit, includes quiet zone). */
export function qrPath(data: string, quiet = 2): { d: string; size: number } {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return { d, size: n + quiet * 2 };
}

export interface QRProfileCardProps {
  displayName: string;
  username: string;
  avatarSrc?: string;
  onCopyLink?: (link: string) => void;
  onSaveImage?: () => void;
  className?: string;
}

/** QR encodes the public profile link only — never keys or tokens. */
export function QRProfileCard({ displayName, username, avatarSrc, onCopyLink, onSaveImage, className }: QRProfileCardProps) {
  const link = profileLink(username);
  const { d, size } = useMemo(() => qrPath(link), [link]);
  const handle = `@${username.replace(/^@/, "")}`;
  return (
    <figure className={cx("s-qr-card", className)}>
      <div className="s-qr-card__code">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code for ${link}`} shapeRendering="crispEdges">
          <rect width={size} height={size} fill="#FFFFFF" />
          <path d={d} fill="#0B0B12" />
        </svg>
        <Avatar name={displayName} src={avatarSrc} size="md" className="s-qr-card__avatar" decorative />
      </div>
      <figcaption className="s-qr-card__caption">
        <span className="s-qr-card__name">{displayName}</span>
        <span className="s-qr-card__handle">{handle}</span>
        <span className="s-qr-card__link">{link.replace(/^https:\/\//, "")}</span>
      </figcaption>
      {(onCopyLink || onSaveImage) && (
        <div className="s-qr-card__actions">
          {onCopyLink && (
            <Button size="sm" leadingIcon={<Copy size={16} />} onClick={() => onCopyLink(link)}>
              Copy link
            </Button>
          )}
          {onSaveImage && (
            <Button size="sm" leadingIcon={<Download size={16} />} onClick={onSaveImage}>
              Save image
            </Button>
          )}
        </div>
      )}
    </figure>
  );
}
