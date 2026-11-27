import { useEffect, useRef, useState } from "react";
import { ImagePlus, Send, Smile, X, Reply, Pencil, Plus } from "lucide-react";
import type { Attachment, MessageBody } from "@secrets/shared";
import { uploadAttachment } from "../../lib/media";
import { useChat } from "../../stores/chat";
import { useSettings } from "../../stores/settings";
import { toast } from "../../stores/toast";
import { IconButton, Spinner } from "../../ui";
import type { DisplayMsg } from "./Bubble";
import { EMOJI_SET } from "./emoji";

interface Upload {
  key: string;
  file: File;
  preview: string;
  progress: number;
  att?: Attachment;
  error?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
const DRAFT_KEY = (id: string) => `secrets.draft.${id}`;

export interface ComposerProps {
  conversationId: string;
  replyTo: DisplayMsg | null;
  replyName?: string;
  onCancelReply: () => void;
  editing: DisplayMsg | null;
  onCancelEdit: () => void;
  disabled?: string | null;
  placeholder?: string;
}

export function Composer({ conversationId, replyTo, replyName, onCancelReply, editing, onCancelEdit, disabled, placeholder = "Type a message…" }: ComposerProps) {
  const [text, setText] = useState(() => sessionStorage.getItem(DRAFT_KEY(conversationId)) ?? "");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [emoji, setEmoji] = useState(false);
  const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const send = useChat((s) => s.send);
  const edit = useChat((s) => s.edit);
  const sendTyping = useChat((s) => s.sendTyping);
  const enterToSend = useSettings((s) => s.enterToSend);
  const typingPrivacy = useSettings((s) => s.privacy.typing);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY(conversationId), text);
  }, [text, conversationId]);

  useEffect(() => {
    if (editing) {
      setText(editing.body.text ?? "");
      ta.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    if (replyTo) ta.current?.focus();
  }, [replyTo]);

  // autosize
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(180, el.scrollHeight) + "px";
  }, [text]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name}: only images can be attached for now`);
        return false;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is over 8 MB`);
        return false;
      }
      return true;
    });
    if (!list.length) return;
    const next = list.slice(0, 10 - uploads.length).map<Upload>((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, preview: URL.createObjectURL(file), progress: 0 }));
    setUploads((u) => [...u, ...next]);
    for (const u of next) {
      uploadAttachment(u.file, (p) => setUploads((all) => all.map((x) => (x.key === u.key ? { ...x, progress: p } : x))))
        .then((att) => setUploads((all) => all.map((x) => (x.key === u.key ? { ...x, att, progress: 1 } : x))))
        .catch((e: Error) => setUploads((all) => all.map((x) => (x.key === u.key ? { ...x, error: e.message } : x))));
    }
  };

  const removeUpload = (key: string) =>
    setUploads((all) => {
      const u = all.find((x) => x.key === key);
      if (u) URL.revokeObjectURL(u.preview);
      return all.filter((x) => x.key !== key);
    });

  const uploading = uploads.some((u) => !u.att && !u.error);
  const ready = uploads.filter((u) => u.att).map((u) => u.att!);
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    if (editing) {
      if (editing.id && text.trim() !== (editing.body.text ?? "")) void edit(editing.id, { ...editing.body, text: text.trim() });
      onCancelEdit();
      setText("");
      return;
    }
    const body: MessageBody = { text: text.trim() || undefined, reply_to: replyTo?.id ?? null };
    if (ready.length) body.attachments = ready;
    send(conversationId, body);
    setText("");
    uploads.forEach((u) => URL.revokeObjectURL(u.preview));
    setUploads([]);
    setEmoji(false);
    onCancelReply();
    ta.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (enterToSend || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      if (editing) {
        onCancelEdit();
        setText("");
      } else if (replyTo) onCancelReply();
    }
  };

  if (disabled)
    return (
      <div className="composer composer-disabled">
        <span className="faint">{disabled}</span>
      </div>
    );

  return (
    <div
      className={`composer-wrap ${drag ? "is-drag" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {(replyTo || editing) && (
        <div className="composer-context">
          {editing ? <Pencil size={16} /> : <Reply size={16} />}
          <div className="grow">
            <div className="cc-title">{editing ? "Edit message" : `Replying to ${replyName ?? "message"}`}</div>
            <div className="cc-text truncate">{(editing ?? replyTo)!.body.text || ((editing ?? replyTo)!.body.attachments?.length ? "Photo" : "")}</div>
          </div>
          <IconButton
            label="Cancel"
            size="sm"
            onClick={() => {
              if (editing) {
                onCancelEdit();
                setText("");
              } else onCancelReply();
            }}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}
      {uploads.length > 0 && (
        <div className="composer-uploads">
          {uploads.map((u) => (
            <div key={u.key} className={`up-thumb ${u.error ? "is-error" : ""}`} title={u.error}>
              <img src={u.preview} alt="" />
              {!u.att && !u.error && (
                <span className="up-progress">
                  <Spinner size={16} />
                  <span className="up-bar" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </span>
              )}
              {u.error && <span className="up-err">Failed</span>}
              <button className="up-x" onClick={() => removeUpload(u.key)} aria-label="Remove attachment">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {emoji && (
        <div className="emoji-pop" role="dialog" aria-label="Emoji">
          {EMOJI_SET.map((e) => (
            <button
              key={e}
              onClick={() => {
                setText((t) => t + e);
                ta.current?.focus();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        <IconButton label="Attach photos" onClick={() => fileIn.current?.click()} variant="soft" disabled={!!editing}>
          <Plus size={20} />
        </IconButton>
        <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))} />
        <div className="composer-field">
          <textarea
            ref={ta}
            rows={1}
            value={text}
            placeholder={placeholder}
            aria-label="Message"
            onChange={(e) => {
              setText(e.target.value);
              if (typingPrivacy && e.target.value) sendTyping(conversationId);
            }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            maxLength={8000}
          />
          <IconButton label="Emoji" size="sm" onClick={() => setEmoji(!emoji)} active={emoji}>
            <Smile size={19} />
          </IconButton>
          <IconButton label="Photo" size="sm" onClick={() => fileIn.current?.click()} className="desktop-only" disabled={!!editing}>
            <ImagePlus size={19} />
          </IconButton>
        </div>
        <IconButton label={editing ? "Save" : "Send"} variant="accent" onClick={submit} disabled={!canSend} data-coach="send">
          {uploading ? <Spinner size={16} /> : <Send size={18} />}
        </IconButton>
      </div>
    </div>
  );
}
