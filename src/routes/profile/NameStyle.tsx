/** Display-name styles (blueprint p55) and name banners (p56). Stored per device in the settings store. */
import { useEffect, useState, type CSSProperties } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { DEFAULT_NAME_STYLE, useSettings, type NameStyle } from "../../stores/settings";
import { useSession } from "../../stores/session";
import { Avatar } from "../../ui";
import { GRADIENT_ACCENTS, SOLID_ACCENTS } from "../../lib/theme";
import "./namestyle.css";

export const NAME_FONTS: { id: string; name: string; stack: string; upper?: boolean }[] = [
  { id: "inter", name: "Default", stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  { id: "archivo", name: "Bold", stack: "'Archivo Black', 'Inter', sans-serif" },
  { id: "playfair", name: "Serif", stack: "'Playfair Display', Georgia, serif" },
  { id: "spacemono", name: "Mono", stack: "'Space Mono', ui-monospace, monospace" },
  { id: "pacifico", name: "Script", stack: "'Pacifico', cursive" },
  { id: "silkscreen", name: "Pixel", stack: "'Silkscreen', ui-monospace, monospace", upper: true },
  { id: "rubikmono", name: "Wide", stack: "'Rubik Mono One', 'Archivo Black', sans-serif", upper: true },
  { id: "comfortaa", name: "Round", stack: "'Comfortaa', 'Inter', sans-serif" },
];
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Comfortaa:wght@700&family=Pacifico&family=Playfair+Display:wght@700&family=Rubik+Mono+One&family=Silkscreen:wght@700&family=Space+Mono:wght@700&display=swap";

let fontsLoaded = false;
export function loadNameFonts() {
  if (fontsLoaded || typeof document === "undefined") return;
  fontsLoaded = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = FONT_HREF;
  document.head.appendChild(l);
}

const NAME_COLORS = SOLID_ACCENTS.filter((a) => !a.mono).map((a) => a.c1);

export function nameCss(style: NameStyle): CSSProperties {
  const f = NAME_FONTS.find((x) => x.id === style.font) ?? NAME_FONTS[0];
  const css: CSSProperties = { fontFamily: f.stack };
  if (f.upper) css.textTransform = "uppercase";
  if (style.color === "solid") css.color = style.c1;
  if (style.color === "gradient") {
    css.backgroundImage = `linear-gradient(90deg, ${style.c1}, ${style.c2})`;
    css.WebkitBackgroundClip = "text";
    css.backgroundClip = "text";
    css.color = "transparent";
  }
  return css;
}

/** The signed-in user's name, drawn with their chosen style. */
export function StyledName({ name, style }: { name: string; style?: NameStyle }) {
  const own = useSettings((s) => s.nameStyle);
  const st = style ?? own;
  useEffect(() => {
    if (st.font !== "inter") loadNameFonts();
  }, [st.font]);
  return (
    <span className="styled-name" style={nameCss(st)}>
      {name}
    </span>
  );
}

/* -------------------------------------------------------------- style sheet */

export function NameStyleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const saved = useSettings((s) => s.nameStyle);
  const [draft, setDraft] = useState<NameStyle>(saved);
  useEffect(() => {
    if (open) {
      setDraft(saved);
      loadNameFonts();
    }
  }, [open, saved]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || !user) return null;
  const set = (p: Partial<NameStyle>) => setDraft((d) => ({ ...d, ...p }));
  const surprise = () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const mode = pick<NameStyle["color"]>(["solid", "gradient"]);
    const g = pick(GRADIENT_ACCENTS);
    set({ font: pick(NAME_FONTS).id, color: mode, c1: mode === "gradient" ? g.c1 : pick(NAME_COLORS), c2: g.c2 });
  };
  return (
    <div className="bp-sheet-scrim" onClick={onClose}>
      <div className="ns-sheet" role="dialog" aria-modal="true" aria-labelledby="ns-title" onClick={(e) => e.stopPropagation()}>
        <div className="ns-head">
          <h2 id="ns-title">Display name style</h2>
          <button className="ns-x" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="ns-scroll">
          <div className="ns-preview-msg">
            <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={52} ring />
            <div>
              <div className="ns-line">
                <span className="ns-pname" style={nameCss(draft)}>{user.display_name}</span>
                <span className="ns-time">now</span>
              </div>
              <div className="ns-text">does anyone read this?</div>
            </div>
          </div>
          <div className="ns-preview-member">
            <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={36} ring />
            <span className="ns-pname" style={nameCss(draft)}>{user.display_name}</span>
          </div>
          <p className="ns-help">
            In a dock, a role colour beats yours, but your font stays. On a profile card with a theme colour, your name turns white (dark on a light theme) so it stays readable.
          </p>

          <div className="ns-label">Choose font</div>
          <div className="ns-fonts" role="radiogroup" aria-label="Font">
            {NAME_FONTS.map((f) => (
              <button key={f.id} role="radio" aria-checked={draft.font === f.id} aria-label={f.name} className={`ns-tile ${draft.font === f.id ? "is-on" : ""}`} style={{ fontFamily: f.stack }} onClick={() => set({ font: f.id })}>
                {f.upper ? "GG" : "Gg"}
              </button>
            ))}
          </div>

          <div className="ns-label">Choose colour</div>
          <div className="ns-modes" role="radiogroup" aria-label="Colour">
            {(["none", "solid", "gradient"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={draft.color === m} className={`ns-mode ${draft.color === m ? "is-on" : ""}`} onClick={() => set({ color: m, ...(m === "gradient" && draft.c1 === draft.c2 ? { c2: GRADIENT_ACCENTS[0].c1 } : {}) })}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {draft.color === "solid" && (
            <div className="ns-swatches" role="radiogroup" aria-label="Solid colour">
              {NAME_COLORS.map((c) => (
                <button key={c} role="radio" aria-checked={draft.c1 === c} aria-label={c} className={`ns-sw ${draft.c1 === c ? "is-on" : ""}`} style={{ background: c }} onClick={() => set({ c1: c })} />
              ))}
            </div>
          )}
          {draft.color === "gradient" && (
            <div className="ns-swatches" role="radiogroup" aria-label="Gradient">
              {GRADIENT_ACCENTS.map((g) => (
                <button
                  key={g.id}
                  role="radio"
                  aria-checked={draft.c1 === g.c1 && draft.c2 === g.c2}
                  aria-label={g.name}
                  className={`ns-sw ${draft.c1 === g.c1 && draft.c2 === g.c2 ? "is-on" : ""}`}
                  style={{ background: `linear-gradient(90deg, ${g.c1}, ${g.c2})` }}
                  onClick={() => set({ c1: g.c1, c2: g.c2 })}
                />
              ))}
            </div>
          )}
        </div>
        <div className="ns-foot">
          <button className="ns-ghost" onClick={surprise}>
            <Sparkles aria-hidden /> Surprise me
          </button>
          <button className="ns-ghost" onClick={() => setDraft(DEFAULT_NAME_STYLE)}>
            Reset
          </button>
          <button
            className="ns-apply"
            onClick={() => {
              useSettings.getState().set({ nameStyle: draft });
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- banners */

export interface NameBanner {
  id: string;
  name: string;
  group: "soft" | "glow";
  isNew?: boolean;
  css: string;
  /** Name colour on top of the banner. */
  ink?: string;
}

export const NAME_BANNERS: NameBanner[] = [
  {
    id: "candy",
    name: "Candy",
    group: "soft",
    css: "radial-gradient(circle at 92% 50%, #ffd1ec 0 6%, transparent 30%), radial-gradient(1.5px 1.5px at 20px 10px, rgba(255,255,255,.55), transparent) 0 0 / 26px 18px, linear-gradient(90deg, #1a0712 0%, #5b1f45 45%, #d9529d 80%, #f7b2d9 100%)",
  },
  {
    id: "sakura",
    name: "Sakura Night",
    group: "soft",
    isNew: true,
    css: "radial-gradient(circle at 86% 32%, #e9dde6 0 13%, transparent 14%), radial-gradient(2px 2px at 14px 12px, #ffb7d5, transparent) 0 0 / 30px 22px, linear-gradient(90deg, #0b0608 0%, #2a0f1d 55%, #4a1631 100%)",
  },
  {
    id: "royal",
    name: "Royal",
    group: "soft",
    isNew: true,
    ink: "#ffe38a",
    css: "repeating-linear-gradient(45deg, rgba(255,215,120,.16) 0 1px, transparent 1px 16px), repeating-linear-gradient(-45deg, rgba(255,215,120,.16) 0 1px, transparent 1px 16px), linear-gradient(90deg, #0b0710 0%, #2b1238 55%, #5b2a78 100%)",
  },
  {
    id: "nebula",
    name: "Nebula",
    group: "glow",
    css: "radial-gradient(circle at 80% 40%, rgba(214,111,255,.8), transparent 45%), radial-gradient(circle at 60% 80%, rgba(143,134,255,.7), transparent 40%), linear-gradient(90deg, #07060f, #1b1340)",
  },
  {
    id: "aurora",
    name: "Aurora",
    group: "glow",
    isNew: true,
    css: "linear-gradient(100deg, transparent 30%, rgba(30,231,165,.55) 55%, rgba(5,224,247,.45) 70%, transparent 90%), linear-gradient(90deg, #031014, #06222a)",
  },
  {
    id: "ember",
    name: "Ember",
    group: "glow",
    css: "radial-gradient(circle at 88% 70%, rgba(255,165,22,.85), transparent 40%), radial-gradient(1.5px 1.5px at 10px 10px, rgba(255,200,120,.7), transparent) 0 0 / 22px 16px, linear-gradient(90deg, #0d0503, #3a1205)",
  },
];
const GROUPS: { id: NameBanner["group"]; label: string }[] = [
  { id: "soft", label: "Soft & Fancy" },
  { id: "glow", label: "Space & Glow" },
];

export function bannerById(id: string | null | undefined) {
  return NAME_BANNERS.find((b) => b.id === id) ?? null;
}

export function NameBannerStrip({ banner, compact }: { banner: NameBanner; compact?: boolean }) {
  const user = useSession((s) => s.user);
  if (!user) return null;
  return (
    <div className={`nb-strip ${compact ? "compact" : ""}`} style={{ background: banner.css }}>
      <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={compact ? 28 : 40} ring />
      <span className="nb-name" style={{ color: banner.ink ?? "#fff" }}>
        {user.username}
      </span>
    </div>
  );
}

export function NameBannerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useSettings((s) => s.nameBanner);
  const [pick, setPick] = useState<string | null>(saved);
  const [tab, setTab] = useState<"secrets" | "community" | "mine">("secrets");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) {
      setPick(saved);
      setQ("");
    }
  }, [open, saved]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  const query = q.trim().toLowerCase();
  const list = tab === "secrets" ? NAME_BANNERS.filter((b) => !query || b.name.toLowerCase().includes(query)) : [];
  return (
    <div className="bp-sheet-scrim" onClick={onClose}>
      <div className="ns-sheet" role="dialog" aria-modal="true" aria-labelledby="nb-title" onClick={(e) => e.stopPropagation()}>
        <div className="ns-head">
          <h2 id="nb-title">Change name banner</h2>
        </div>
        <div className="ns-scroll">
          <input className="nb-search" placeholder="Search by name or artist" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search banners" />
          <button className="nb-make" onClick={() => setTab("mine")}>
            Make a name banner
          </button>
          <div className="nb-tabs" role="tablist">
            {(
              [
                ["secrets", "Secrets"],
                ["community", "Community"],
                ["mine", "Mine"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "secrets" &&
            GROUPS.map((g) => {
              const items = list.filter((b) => b.group === g.id);
              if (!items.length) return null;
              return (
                <div key={g.id}>
                  <div className="ns-label">{g.label}</div>
                  <div className="nb-list" role="radiogroup" aria-label={g.label}>
                    {items.map((b) => (
                      <button key={b.id} role="radio" aria-checked={pick === b.id} className={`nb-item ${pick === b.id ? "is-on" : ""}`} onClick={() => setPick(pick === b.id ? null : b.id)}>
                        <span className="nb-art">
                          <NameBannerStrip banner={b} />
                          {pick === b.id && (
                            <span className="nb-check" aria-hidden>
                              <Check strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span className="nb-meta">
                          <span className="nb-title">{b.name}</span>
                          {b.isNew && <span className="nb-new">New</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          {tab === "secrets" && list.length === 0 && <p className="nb-empty">No banners match “{q}”.</p>}
          {tab === "community" && <p className="nb-empty">Community banners arrive soon. Banners made by people on Secrets will show up here.</p>}
          {tab === "mine" && <p className="nb-empty">Banners you make will show up here. Making your own banner is coming soon.</p>}
        </div>
        <div className="ns-foot two">
          <button className="ns-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ns-apply wide"
            onClick={() => {
              useSettings.getState().set({ nameBanner: pick });
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
