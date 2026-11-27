/**
 * Tiny, safe Markdown → React renderer for notes (no HTML injection).
 * Blocks: # ## ###, - * + bullets, 1. ordered, - [ ] / - [x] checklists, > quotes, ``` code, ---, paragraphs.
 * Inline: bold, italic, strike, inline code, links, images, bare URLs.
 */
import { Fragment, type ReactNode } from "react";
import { Check } from "lucide-react";
import { AuthImage } from "../../ui";

type Block =
  | { k: "h"; level: 1 | 2 | 3; text: string }
  | { k: "p"; text: string }
  | { k: "quote"; text: string }
  | { k: "code"; text: string }
  | { k: "hr" }
  | { k: "ul" | "ol"; items: { text: string; indent: number }[] }
  | { k: "check"; items: { text: string; done: boolean; line: number; indent: number }[] };

const RE_CHECK = /^(\s*)[-*+]\s+\[( |x|X)\]\s?(.*)$/;
const RE_UL = /^(\s*)[-*+]\s+(.*)$/;
const RE_OL = /^(\s*)\d+[.)]\s+(.*)$/;

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      out.push({ k: "code", text: buf.join("\n") });
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      out.push({ k: "h", level: h[1].length as 1 | 2 | 3, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push({ k: "hr" });
      i++;
      continue;
    }
    if (RE_CHECK.test(l)) {
      const items: { text: string; done: boolean; line: number; indent: number }[] = [];
      while (i < lines.length && RE_CHECK.test(lines[i])) {
        const m = lines[i].match(RE_CHECK)!;
        items.push({ text: m[3], done: m[2] !== " ", line: i, indent: Math.min(3, Math.floor(m[1].length / 2)) });
        i++;
      }
      out.push({ k: "check", items });
      continue;
    }
    if (RE_UL.test(l) || RE_OL.test(l)) {
      const ordered = !RE_UL.test(l);
      const re = ordered ? RE_OL : RE_UL;
      const items: { text: string; indent: number }[] = [];
      while (i < lines.length && re.test(lines[i]) && !RE_CHECK.test(lines[i])) {
        const m = lines[i].match(re)!;
        items.push({ text: m[2], indent: Math.min(3, Math.floor(m[1].length / 2)) });
        i++;
      }
      out.push({ k: ordered ? "ol" : "ul", items });
      continue;
    }
    if (/^>\s?/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push({ k: "quote", text: buf.join("\n") });
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s|^```|^>\s?/.test(lines[i]) &&
      !RE_UL.test(lines[i]) &&
      !RE_OL.test(lines[i])
    )
      buf.push(lines[i++]);
    out.push({ k: "p", text: buf.join("\n") });
  }
  return out;
}

const safeUrl = (u: string) => (/^(https?:|mailto:|\/)/i.test(u.trim()) ? u.trim() : null);

const INLINE = /(!\[([^\]]*)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(~~([^~]+)~~)|(\*([^*\s][^*]*)\*)|(\b_([^_\s][^_]*)_\b)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

export function inline(text: string, keyBase = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const k = `${keyBase}-${n++}`;
    if (m[1]) {
      const src = safeUrl(m[3]);
      if (src?.startsWith("/v1/")) out.push(<AuthImage key={k} path={src} alt={m[2]} className="md-img" />);
      else if (src) out.push(<img key={k} src={src} alt={m[2]} className="md-img" loading="lazy" />);
      else out.push(m[0]);
    } else if (m[4]) {
      const href = safeUrl(m[6]);
      out.push(href ? <a key={k} href={href} target="_blank" rel="noreferrer noopener">{inline(m[5], k)}</a> : m[0]);
    } else if (m[7]) out.push(<code key={k}>{m[8]}</code>);
    else if (m[9]) out.push(<strong key={k}>{inline(m[10], k)}</strong>);
    else if (m[11]) out.push(<del key={k}>{inline(m[12], k)}</del>);
    else if (m[13]) out.push(<em key={k}>{inline(m[14], k)}</em>);
    else if (m[15]) out.push(<em key={k}>{inline(m[16], k)}</em>);
    else if (m[17]) out.push(<a key={k} href={m[17]} target="_blank" rel="noreferrer noopener">{m[17]}</a>);
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const withBreaks = (t: string, k: string) =>
  t.split("\n").map((ln, i, a) => (
    <Fragment key={`${k}-l${i}`}>
      {inline(ln, `${k}-l${i}`)}
      {i < a.length - 1 && <br />}
    </Fragment>
  ));

/** Render markdown. `onToggle(line)` makes checklist items clickable. */
export function Markdown({ src, onToggle }: { src: string; onToggle?: (line: number) => void }) {
  const blocks = parseBlocks(src);
  return (
    <div className="md">
      {blocks.map((b, bi) => {
        const k = `b${bi}`;
        switch (b.k) {
          case "h": {
            const H = (`h${b.level + 1}` as "h2" | "h3" | "h4");
            return <H key={k}>{inline(b.text, k)}</H>;
          }
          case "p":
            return <p key={k}>{withBreaks(b.text, k)}</p>;
          case "quote":
            return <blockquote key={k}>{withBreaks(b.text, k)}</blockquote>;
          case "code":
            return (
              <pre key={k}>
                <code>{b.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={k} />;
          case "ul":
          case "ol": {
            const L = b.k;
            return (
              <L key={k}>
                {b.items.map((it, ii) => (
                  <li key={ii} style={it.indent ? { marginLeft: it.indent * 20 } : undefined}>
                    {inline(it.text, `${k}-${ii}`)}
                  </li>
                ))}
              </L>
            );
          }
          case "check":
            return (
              <ul key={k} className="md-check">
                {b.items.map((it) => (
                  <li key={it.line} className={it.done ? "is-done" : ""} style={it.indent ? { marginLeft: it.indent * 22 } : undefined}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={it.done}
                      aria-label={it.text || "Checklist item"}
                      className="md-box"
                      disabled={!onToggle}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle?.(it.line);
                      }}
                    >
                      {it.done && <Check size={12} strokeWidth={3.5} />}
                    </button>
                    <span>{inline(it.text, `${k}-${it.line}`)}</span>
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}

/** Flip "- [ ]" ↔ "- [x]" on a given source line. */
export function toggleCheck(src: string, line: number): string {
  const lines = src.split("\n");
  const l = lines[line];
  if (l === undefined) return src;
  lines[line] = l.replace(/^(\s*[-*+]\s+\[)( |x|X)(\])/, (_m, a, c, b) => `${a}${c === " " ? "x" : " "}${b}`);
  return lines.join("\n");
}

/** Plain-text snippet for list previews. */
export function snippet(src: string, max = 140): string {
  return src
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+\[( |x|X)\]\s?/gm, "")
    .replace(/^\s*([-*+]|\d+[.)]|#{1,3}|>)\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function checklistProgress(src: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const l of src.split("\n")) {
    const m = l.match(RE_CHECK);
    if (m) {
      total++;
      if (m[2] !== " ") done++;
    }
  }
  return { done, total };
}
