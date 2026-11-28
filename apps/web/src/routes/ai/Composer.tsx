import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Mic, MicOff, Plus, Square } from "lucide-react";
import { useSettings } from "../../stores/settings";
import { useAiSettings, ASSISTANT_NAME } from "../../lib/ai/settings";
import { effortLabel } from "../../lib/ai/effort";
import { EffortGauge } from "./EffortGauge";
import { EffortSlider } from "./EffortSlider";
import { Popover } from "./Popover";
import { toast } from "../../stores/toast";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function speechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface ComposerProps {
  live: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  /** Contents of the "+" menu. Receives a close callback. */
  plusMenu?: (close: () => void) => ReactNode;
  onCustomEffort: () => void;
  autoFocusKey?: string;
  compact?: boolean;
  placeholder?: string;
}

/** Blueprint composer: [+] Ask Grace … [effort gauge] [mic] [send]. */
export function Composer({ live, onSend, onStop, plusMenu, onCustomEffort, autoFocusKey, compact, placeholder }: ComposerProps) {
  const [text, setText] = useState("");
  const [plus, setPlus] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const base = useRef("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const enterToSend = useSettings((s) => s.enterToSend);
  const effort = useAiSettings((s) => s.effort);
  const customSteps = useAiSettings((s) => s.customSteps);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
  }, [autoFocusKey]);

  useEffect(() => () => rec.current?.stop(), []);

  const send = () => {
    const t = text.trim();
    if (!t || live) return;
    rec.current?.stop();
    setText("");
    onSend(t);
  };

  const toggleMic = () => {
    if (listening) return rec.current?.stop();
    const Ctor = speechCtor();
    if (!Ctor) return toast.error("Voice input isn’t supported in this browser.");
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    base.current = text ? `${text.trimEnd()} ` : "";
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(base.current + s);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error !== "aborted" && e.error !== "no-speech") toast.error(e.error === "not-allowed" ? "Microphone permission was denied." : "Voice input stopped.");
    };
    rec.current = r;
    setListening(true);
    r.start();
  };

  const can = !!text.trim() && !live;

  return (
    <div className={`g-composer-wrap ${compact ? "is-compact" : ""}`}>
      <form
        className={`g-composer ${text.includes("\n") || text.length > 60 ? "is-tall" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {plusMenu && (
          <div className="g-plus-wrap">
            <button type="button" className="g-cbtn" aria-label="More options" aria-haspopup="menu" aria-expanded={plus} data-popover-anchor onClick={() => setPlus(!plus)}>
              <Plus size={24} strokeWidth={1.8} />
            </button>
            <Popover open={plus} onClose={() => setPlus(false)} label="Composer options" className="g-pop-up">
              {plusMenu(() => setPlus(false))}
            </Popover>
          </div>
        )}
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder ?? `Ask ${ASSISTANT_NAME}`}
          aria-label={`Message ${ASSISTANT_NAME}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && (enterToSend ? !e.shiftKey : e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="g-cbtn g-effort-btn" aria-label={`Effort: ${effortLabel(effort)}. Change effort`} title={`${effortLabel(effort)} effort`} onClick={() => setEffortOpen(true)}>
          <EffortGauge level={effort} customSteps={customSteps} size={26} />
        </button>
        <button type="button" className={`g-cbtn ${listening ? "is-rec" : ""}`} aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening} onClick={toggleMic}>
          {listening ? <MicOff size={22} /> : <Mic size={22} strokeWidth={1.8} />}
        </button>
        {live ? (
          <button type="button" className="g-send is-stop" aria-label="Stop" onClick={onStop}>
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className={`g-send ${can ? "is-ready" : ""}`} aria-label="Send" disabled={!can}>
            <ArrowUp size={22} />
          </button>
        )}
      </form>
      <div className="g-disclaimer">{ASSISTANT_NAME} can make mistakes.</div>
      <EffortSlider
        open={effortOpen}
        onClose={() => setEffortOpen(false)}
        onCustom={() => {
          setEffortOpen(false);
          onCustomEffort();
        }}
      />
    </div>
  );
}
