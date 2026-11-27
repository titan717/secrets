import { useState } from "react";
import { resolveApiUrl } from "../config";

const HUES = [268, 290, 248, 320, 200, 170, 340, 25];
function hueFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean;
  seed?: string;
  shape?: "circle" | "squircle";
  ring?: boolean;
  className?: string;
}

export function Avatar({ name, src, size = 40, online, seed, shape = "circle", ring, className = "" }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const url = resolveApiUrl(src);
  const hue = hueFor(seed ?? name);
  return (
    <span
      className={`avatar avatar-${shape} ${ring ? "avatar-ring" : ""} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38), ["--hue" as string]: hue }}
      aria-hidden={false}
      role="img"
      aria-label={name}
    >
      {url && !broken ? <img src={url} alt="" onError={() => setBroken(true)} draggable={false} /> : <span>{initials(name)}</span>}
      {online !== undefined && <span className={`presence ${online ? "is-online" : ""}`} style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }} />}
    </span>
  );
}

export function AvatarStack({ people, size = 28, max = 4 }: { people: { id: string; name: string; src?: string | null }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} src={p.src} seed={p.id} size={size} ring />
      ))}
      {extra > 0 && (
        <span className="avatar avatar-circle avatar-ring avatar-more" style={{ width: size, height: size, fontSize: size * 0.36 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Stacked avatar for group conversations without an image. */
export function GroupAvatar({ names, size = 44, src, seed }: { names: string[]; size?: number; src?: string | null; seed: string }) {
  if (src || names.length < 2) return <Avatar name={names[0] ?? "Group"} src={src} size={size} seed={seed} />;
  const s = Math.round(size * 0.68);
  return (
    <span className="group-avatar" style={{ width: size, height: size }}>
      <Avatar name={names[0]} size={s} seed={names[0]} className="ga-a" />
      <Avatar name={names[1]} size={s} seed={names[1]} className="ga-b" ring />
    </span>
  );
}
