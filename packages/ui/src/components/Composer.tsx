import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Mic, Paperclip, SendHorizontal, Smile, X } from "lucide-react";
import { cx } from "../cx";
import { IconButton } from "./Button";
import type { ReplyPreview } from "../shared/types";

export interface ComposerProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Inline notice above the field (slow mode, admins-only, blocked). */
  notice?: ReactNode;
  replyTo?: ReplyPreview;
  onCancelReply?: () => void;
  onAttach?: () => void;
  onEmoji?: () => void;
  onVoice?: () => void;
  maxRows?: number;
  className?: string;
  /** Accessible name for the textarea. */
  label?: string;
}

export function Composer({
  value,
  defaultValue = "",
  onChange,
  onSend,
  placeholder = "Type a message…",
  disabled,
  notice,
  replyTo,
  onCancelReply,
  onAttach,
  onEmoji,
  onVoice,
  maxRows = 6,
  className,
  label = "Message",
}: ComposerProps) {
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows)}px`;
  }, [text, maxRows]);

  const set = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };
  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    set("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };
  const empty = text.trim().length === 0;

  return (
    <form className={cx("s-composer", disabled && "is-disabled", className)} onSubmit={onSubmit}>
      {notice && <div className="s-composer__notice" role="note">{notice}</div>}
      {replyTo && (
        <div className="s-composer__reply">
          <div className="s-composer__reply-body">
            <span className="s-msg__reply-author">Replying to {replyTo.author}</span>
            <span className="s-msg__reply-text">{replyTo.text}</span>
          </div>
          {onCancelReply && <IconButton size="sm" label="Cancel reply" icon={<X size={16} />} onClick={onCancelReply} />}
        </div>
      )}
      <div className="s-composer__row">
        {onAttach && <IconButton label="Attach" icon={<Paperclip size={20} />} onClick={onAttach} disabled={disabled} />}
        <textarea
          ref={ref}
          rows={1}
          className="s-composer__input"
          aria-label={label}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {onEmoji && <IconButton label="Emoji" icon={<Smile size={20} />} onClick={onEmoji} disabled={disabled} />}
        {empty && onVoice ? (
          <IconButton label="Record voice message" icon={<Mic size={20} />} onClick={onVoice} disabled={disabled} />
        ) : (
          <IconButton
            type="submit"
            variant="primary"
            label="Send"
            icon={<SendHorizontal size={18} />}
            disabled={disabled || empty}
            className="s-composer__send"
          />
        )}
      </div>
    </form>
  );
}
