import { Fragment, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Tiny, dependency-free markdown → React renderer for AI replies.
 * Never uses innerHTML, so model output can't inject markup. Supports: headings, paragraphs,
 * fenced code, inline code, bold/italic/strike, links (http/https/mailto only), autolinks,
 * ordered/unordered/task lists, blockquotes, horizontal rules and simple pipe tables.
 */

const SAFE_URL = /^(https?:|mailto:)/i;

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  // order matters: code first so its contents aren't formatted
  const re = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|(?<![\w*])\*(?!\s)([\s\S]+?)(?<!\s)\*(?!\w)|(?<![\w])_(?!\s)([\s\S]+?)(?<!\s)_(?![\w])|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k}>{m[2].trim() || m[2]}</code>);
    else if (m[3] !== undefined) {
      const href = m[4];
      out.push(
        SAFE_URL.test(href) ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">
            {inline(m[3], k)}
          </a>
        ) : (
          <span key={k}>{m[3]}</span>
        ),
      );
    } else if (m[5] !== undefined || m[6] !== undefined) out.push(<strong key={k}>{inline(m[5] ?? m[6], k)}</strong>);
    else if (m[7] !== undefined) out.push(<del key={k}>{inline(m[7], k)}</del>);
    else if (m[8] !== undefined || m[9] !== undefined) out.push(<em key={k}>{inline(m[8] ?? m[9], k)}</em>);
    else if (m[10]) {
      out.push(
        <a key={k} href={m[10]} target="_blank" rel="noopener noreferrer">
          {m[10]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((line, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(line, `${key}-${i}`)] : inline(line, `${key}-${i}`)));
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          aria-label="Copy code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

type ListItem = { text: string; task?: boolean; done?: boolean; children: string[] };

function blocks(src: string, kp = "b"): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const key = () => `${kp}${n++}`;
  const isBlank = (l: string) => !l.trim();
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    // fenced code (unterminated fence while streaming → take the rest)
    const fence = /^\s*(```+|~~~+)\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push(<CodeBlock key={key()} code={body.join("\n")} lang={fence[2]} />);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = Math.min(h[1].length + 2, 6);
      const Tag = `h${level}` as "h3";
      out.push(<Tag key={key()}>{inline(h[2], key())}</Tag>);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={key()} />);
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={key()}>{blocks(body.join("\n"), key())}</blockquote>);
      continue;
    }
    // table: header | sep | rows
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !isBlank(lines[i])) rows.push(cells(lines[i++]));
      const k = key();
      out.push(
        <div className="md-table" key={k}>
          <table>
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{head.map((_, j) => <td key={j}>{inline(r[j] ?? "", `${k}r${ri}${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const lm = listRe.exec(line);
    if (lm) {
      const ordered = /\d/.test(lm[2]);
      const baseIndent = lm[1].length;
      const items: ListItem[] = [];
      const start = ordered ? parseInt(lm[2], 10) : undefined;
      while (i < lines.length) {
        const l = lines[i];
        const m = listRe.exec(l);
        if (m && m[1].length <= baseIndent + 1 && /\d/.test(m[2]) === ordered) {
          const task = /^\[([ xX])\]\s+(.*)$/.exec(m[3]);
          items.push(task ? { text: task[2], task: true, done: task[1] !== " ", children: [] } : { text: m[3], children: [] });
          i++;
        } else if (!isBlank(l) && items.length && (/^\s{2,}/.test(l) || (!m && !/^\s*(#|>|```)/.test(l)))) {
          items[items.length - 1].children.push(l.replace(/^\s{2,4}/, ""));
          i++;
        } else if (isBlank(l) && i + 1 < lines.length && (listRe.test(lines[i + 1]) || /^\s{2,}/.test(lines[i + 1]))) {
          i++;
        } else break;
      }
      const k = key();
      const lis = items.map((it, j) => {
        const nested = it.children.length ? blocks(it.children.join("\n"), `${k}c${j}`) : null;
        return (
          <li key={j} className={it.task ? "md-task" : undefined}>
            {it.task && <input type="checkbox" checked={it.done} readOnly tabIndex={-1} />}
            {inline(it.text, `${k}${j}`)}
            {nested}
          </li>
        );
      });
      out.push(ordered ? <ol key={k} start={start !== 1 ? start : undefined}>{lis}</ol> : <ul key={k}>{lis}</ul>);
      continue;
    }
    // paragraph
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) && !(para.length && listRe.test(lines[i]))) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]); // safety: always make progress
    const k = key();
    out.push(<p key={k}>{withBreaks(para.join("\n"), k)}</p>);
  }
  return out;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`md ${className}`}>{blocks(text).map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
