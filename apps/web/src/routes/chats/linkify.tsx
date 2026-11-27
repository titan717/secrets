import type { ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/g;
const MENTION_RE = /(^|\s)(@[a-z0-9_.]{3,24})/g;

export function extractLinks(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

/** Render text with clickable links and highlighted @mentions; emoji-only messages get big. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  text.replace(URL_RE, (m, _1, offset: number) => {
    if (offset > last) parts.push(...mentions(text.slice(last, offset), parts.length));
    parts.push(
      <a key={`l${offset}`} href={m} target="_blank" rel="noreferrer noopener" className="msg-link">
        {m}
      </a>,
    );
    last = offset + m.length;
    return m;
  });
  if (last < text.length) parts.push(...mentions(text.slice(last), parts.length));
  return <>{parts}</>;
}

function mentions(s: string, k: number): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  s.replace(MENTION_RE, (m, pre: string, name: string, offset: number) => {
    const start = offset + pre.length;
    if (start > last) out.push(s.slice(last, start));
    out.push(
      <span key={`m${k}-${offset}`} className="mention">
        {name}
      </span>,
    );
    last = start + name.length;
    return m;
  });
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 16) return false;
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(t) && !/^[0-9#*\s]+$/.test(t);
}
