import { useEffect, useRef, useState } from "react";
import { ImagePlus, Lock, Type, X } from "lucide-react";
import type { MomentSettings as Settings } from "@shared";
import { Button, IconButton, Modal, Tabs } from "../../ui";
import { BACKGROUNDS, useMoments } from "../../lib/features/moments";
import { momentsApi } from "../../lib/features/api";
import { uploadAttachment } from "../../lib/media";
import { errorMessage } from "../../lib/api";
import { toast } from "../../stores/toast";
import { MomentSettings, visibilityLabel } from "./MomentSettings";

const MAX = 700;

/** Create a text or photo moment. Audience defaults to My Moment settings. */
export function MomentComposer({ open, onClose, initialFile }: { open: boolean; onClose: () => void; initialFile?: File | null }) {
  const [mode, setMode] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [bg, setBg] = useState("aurora");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addLocal = useMoments((s) => s.addLocal);

  useEffect(() => {
    if (!open) return;
    setText("");
    setProgress(null);
    if (initialFile) pick(initialFile);
    else {
      setMode("text");
      setFile(null);
    }
    momentsApi.settings().then(setSettings, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Moments support photos only");
    if (f.size > 8 * 1024 * 1024) return toast.error("Photos must be 8 MB or smaller");
    setFile(f);
    setMode("photo");
  }

  const canPost = mode === "text" ? text.trim().length > 0 : !!file;
  const post = async () => {
    if (!canPost || progress !== null) return;
    try {
      setProgress(0);
      let attachment_id: string | undefined;
      if (mode === "photo" && file) attachment_id = (await uploadAttachment(file, setProgress)).id;
      const m = await momentsApi.create({ text: text.trim() || undefined, attachment_id, background: mode === "text" ? bg : null });
      addLocal({ ...m, viewed: true });
      toast.success("Moment shared");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Modal
        open={open && !settingsOpen}
        onClose={onClose}
        title="New moment"
        size="md"
        className="mc-modal"
        footer={
          <>
            <button className="mc-aud" onClick={() => setSettingsOpen(true)}>
              <Lock size={14} /> {visibilityLabel(settings)}
            </button>
            <span className="grow" />
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={post} disabled={!canPost} loading={progress !== null}>
              {progress !== null && progress < 1 && mode === "photo" ? `Uploading ${Math.round(progress * 100)}%` : "Share"}
            </Button>
          </>
        }
      >
        <Tabs
          variant="pill"
          value={mode}
          onChange={(m) => {
            setMode(m);
            if (m === "photo" && !file) fileRef.current?.click();
          }}
          items={[
            { id: "text", label: <span className="row"><Type size={15} /> Text</span> },
            { id: "photo", label: <span className="row"><ImagePlus size={15} /> Photo</span> },
          ]}
        />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
        {mode === "text" ? (
          <>
            <div className="mc-canvas" style={{ background: BACKGROUNDS[bg] }}>
              <textarea
                className="mc-text"
                placeholder="What's on your mind?"
                value={text}
                maxLength={MAX}
                onChange={(e) => setText(e.target.value)}
                autoFocus
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && void post()}
              />
              <span className="mc-count">{MAX - text.length}</span>
            </div>
            <div className="mc-swatches" role="radiogroup" aria-label="Background">
              {Object.entries(BACKGROUNDS).map(([id, css]) => (
                <button key={id} role="radio" aria-checked={bg === id} aria-label={id} className={`mc-swatch ${bg === id ? "is-on" : ""}`} style={{ background: css }} onClick={() => setBg(id)} />
              ))}
            </div>
          </>
        ) : (
          <>
            {preview ? (
              <div className="mc-photo">
                <img src={preview} alt="Selected" />
                <IconButton label="Remove photo" variant="soft" size="sm" className="mc-photo-x" onClick={() => setFile(null)}>
                  <X size={16} />
                </IconButton>
              </div>
            ) : (
              <button
                className="mc-drop"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pick(e.dataTransfer.files[0]);
                }}
              >
                <ImagePlus size={28} />
                <span>Choose a photo or drop it here</span>
                <span className="faint">JPG, PNG, GIF or WebP · up to 8 MB</span>
              </button>
            )}
            <input className="mc-caption input-box input" placeholder="Add a caption…" value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        <p className="faint mc-fine">Moments disappear after 24 hours.</p>
      </Modal>
      <MomentSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={setSettings} />
    </>
  );
}
