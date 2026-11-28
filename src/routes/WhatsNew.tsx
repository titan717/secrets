import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useSettings } from "../stores/settings";
import { APP_VERSION } from "../lib/version";
import "./whats-new.css";

type Item = { title?: string; body: string };
type Section = { heading: string; items: Item[] };

/** Release notes, newest first. Items with a title render their body in the dim style (blueprint p35–37). */
export const RELEASE = {
  hero: `Secrets ${APP_VERSION.split(".").slice(0, 2).join(".")}`,
  title: "Make it yours",
  summary: "Share your profile with a QR card, new themes and accents, a friendlier first run and steadier chats.",
  sections: [
    {
      heading: "Share your profile",
      items: [
        { title: "A new profile card", body: "Open Share profile from Settings to show a QR code anyone can scan with their camera. Tap the card to change its colour." },
        { title: "Preview for signed-out visitors", body: "Choose whether people without Secrets see your name, photo and about text when they open your link." },
        { body: "Save the card as an image, or share your link straight from the card." },
      ],
    },
    {
      heading: "Appearance",
      items: [
        { title: "Themes and accents", body: "Pick System, Light, Dark or Black, then choose a solid, a gradient or your own custom accent with a live preview." },
        { title: "Fonts and app icon", body: "Choose the font Secrets uses everywhere, and switch to the glowing Ghost icon if you like." },
        { body: "Clock format and haptics now live in Appearance too." },
      ],
    },
    {
      heading: "Profile",
      items: [
        { title: "Name styles and banners", body: "Give your display name a style and add a banner behind it on your profile." },
        { body: "Your about text now fits 160 characters, with quick preset chips to get you started." },
      ],
    },
    {
      heading: "Stories",
      items: [
        { title: "Stories are optional", body: "Don't use them? Turn stories off in Settings → Stories and the row on Chats goes away." },
        { body: "Choose who can see your stories before you post." },
      ],
    },
    {
      heading: "Also new",
      items: [
        { body: "A short tour shows you around the first time you open Chats, Docks and your workspace." },
        { body: "Signing up asks for your name, birthday and a username, and tells you right away if the username is free." },
        { body: "Button text is no longer white on white in dark mode." },
      ],
    },
  ] as Section[],
};

/** What's new (blueprint p33–37): close X, hero art with title, version, headline, sections and a sticky Continue. */
export function WhatsNewPage() {
  const nav = useNavigate();
  const set = useSettings((s) => s.set);
  const done = () => {
    set({ whatsNewSeen: APP_VERSION });
    if (window.history.length > 1) nav(-1);
    else nav("/chats");
  };
  return (
    <div className="wn-screen" role="region" aria-label="What's new">
      <div className="wn-scroll">
        <button className="wn-x" aria-label="Close" onClick={done}>
          <X />
        </button>
        <div className="wn-hero" aria-hidden>
          <img src="/mascot.png" alt="" />
          <span>{RELEASE.hero}</span>
        </div>
        <div className="wn-body">
          <p className="wn-ver">Secrets {APP_VERSION}</p>
          <h1>{RELEASE.title}</h1>
          <p className="wn-sum">{RELEASE.summary}</p>
          {RELEASE.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.items.map((it, i) => (
                <div className="wn-item" key={i}>
                  {it.title && <h3>{it.title}</h3>}
                  <p className={it.title ? "dim" : ""}>{it.body}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
      <div className="wn-foot">
        <button className="wn-continue" onClick={done}>
          Continue
        </button>
      </div>
    </div>
  );
}
