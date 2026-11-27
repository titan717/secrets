import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Eye, Pause, Play, Trash2, X } from "lucide-react";
import type { MomentGroup, User } from "@secrets/shared";
import { AuthImage, Avatar, IconButton, Modal, Spinner } from "../../ui";
import { bgFor, timeAgo, useMoments } from "../../lib/features/moments";
import { momentsApi } from "../../lib/features/api";
import { useConfirm } from "../../lib/features/Confirm";
import { errorMessage } from "../../lib/api";
import { toast } from "../../stores/toast";
import { myId } from "../../stores/session";

const DURATION_TEXT = 5000;
const DURATION_IMAGE = 6500;

/** Full-screen story viewer: progress bars, tap/arrow navigation, hold to pause. */
export function MomentViewer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const groups = useMoments((s) => s.groups);
  const markViewed = useMoments((s) => s.markViewed);
  const removeLocal = useMoments((s) => s.removeLocal);
  // Snapshot the order on open so groups don't jump while viewing.
  const [order] = useState(() => groups.map((g) => g.user.id));
  const [gi, setGi] = useState(() => Math.max(0, order.indexOf(userId)));
  const group: MomentGroup | undefined = groups.find((g) => g.user.id === order[gi]);
  const [mi, setMi] = useState(() => {
    const g = groups.find((x) => x.user.id === userId);
    const first = g?.moments.findIndex((m) => !m.viewed) ?? -1;
    return first >= 0 && g?.user.id !== myId() ? first : 0;
  });
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const { confirm, dialog, open: confirmOpen } = useConfirm();
  const moment = group?.moments[Math.min(mi, (group?.moments.length ?? 1) - 1)];
  const mine = group?.user.id === myId();
  const holdRef = useRef(false);

  const next = useCallback(() => {
    if (!group) return onClose();
    if (mi < group.moments.length - 1) setMi(mi + 1);
    else if (gi < order.length - 1) {
      setGi(gi + 1);
      setMi(0);
    } else onClose();
  }, [group, mi, gi, order.length, onClose]);
  const prev = useCallback(() => {
    if (mi > 0) setMi(mi - 1);
    else if (gi > 0) {
      const pg = groups.find((g) => g.user.id === order[gi - 1]);
      setGi(gi - 1);
      setMi(Math.max(0, (pg?.moments.length ?? 1) - 1));
    } else setProgress(0);
  }, [mi, gi, groups, order]);

  // Close if the group disappears (e.g. all moments deleted/expired).
  useEffect(() => {
    if (!group || !moment) {
      if (gi < order.length - 1) {
        setGi(gi + 1);
        setMi(0);
      } else onClose();
    }
  }, [group, moment, gi, order.length, onClose]);

  useEffect(() => {
    setProgress(0);
    if (moment) markViewed(moment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.id]);

  const stopped = paused || showViewers || !!confirmOpen;
  useEffect(() => {
    if (!moment || stopped) return;
    const total = moment.kind === "image" ? DURATION_IMAGE : DURATION_TEXT;
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      setProgress((p) => {
        const np = p + dt / total;
        if (np >= 1) {
          queueMicrotask(next);
          return 1;
        }
        return np;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [moment, stopped, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showViewers || confirmOpen) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, prev, onClose, showViewers, confirmOpen]);

  if (!group || !moment) return null;

  const del = async () => {
    if (!(await confirm("Delete this moment?", { body: "It will disappear for everyone who can see it." }))) return;
    try {
      await momentsApi.remove(moment.id);
      removeLocal(moment.id);
      toast.success("Moment deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return createPortal(
    <div className="mv" role="dialog" aria-modal="true" aria-label={`${group.user.display_name}'s moments`}>
      <div className="mv-backdrop" onClick={onClose} />
      <IconButton label="Previous" className="mv-side mv-side-l" variant="soft" onClick={prev} disabled={gi === 0 && mi === 0}>
        <ChevronLeft size={20} />
      </IconButton>
      <div className="mv-stage">
        <div className="mv-card" style={moment.kind === "text" ? { background: bgFor(moment.background) } : undefined}>
          {moment.kind === "image" && moment.attachment ? (
            <>
              <AuthImage path={moment.attachment.url} className="mv-blur" alt="" aria-hidden />
              <AuthImage path={moment.attachment.url} className="mv-img" alt={moment.text || "Moment"} />
            </>
          ) : null}
          {moment.kind === "text" && <p className={`mv-text ${moment.text.length > 140 ? "is-long" : ""}`}>{moment.text}</p>}
          {moment.kind === "image" && moment.text && <p className="mv-caption">{moment.text}</p>}

          <div className="mv-top">
            <div className="mv-bars">
              {group.moments.map((m, i) => (
                <span key={m.id} className="mv-bar">
                  <span style={{ transform: `scaleX(${i < mi ? 1 : i === mi ? progress : 0})` }} />
                </span>
              ))}
            </div>
            <div className="mv-head">
              <Avatar name={group.user.display_name} src={group.user.avatar_url} seed={group.user.id} size={34} />
              <div className="grow">
                <div className="mv-name truncate">{mine ? "Your moment" : group.user.display_name}</div>
                <div className="mv-time">{timeAgo(moment.created_at)}</div>
              </div>
              <IconButton label={paused ? "Play" : "Pause"} className="mv-ico" onClick={() => setPaused((p) => !p)}>
                {paused ? <Play size={18} /> : <Pause size={18} />}
              </IconButton>
              {mine && (
                <IconButton label="Delete moment" className="mv-ico" onClick={del}>
                  <Trash2 size={18} />
                </IconButton>
              )}
              <IconButton label="Close" className="mv-ico" onClick={onClose}>
                <X size={20} />
              </IconButton>
            </div>
          </div>

          <button
            className="mv-tap mv-tap-l"
            aria-label="Previous moment"
            onClick={() => !holdRef.current && prev()}
            onPointerDown={() => startHold(holdRef, setPaused)}
            onPointerUp={() => endHold(holdRef, setPaused)}
            onPointerLeave={() => endHold(holdRef, setPaused)}
          />
          <button
            className="mv-tap mv-tap-r"
            aria-label="Next moment"
            onClick={() => !holdRef.current && next()}
            onPointerDown={() => startHold(holdRef, setPaused)}
            onPointerUp={() => endHold(holdRef, setPaused)}
            onPointerLeave={() => endHold(holdRef, setPaused)}
          />

          {mine && (
            <button className="mv-views" onClick={() => setShowViewers(true)}>
              <Eye size={16} /> {moment.view_count ?? 0} {moment.view_count === 1 ? "view" : "views"}
            </button>
          )}
        </div>
      </div>
      <IconButton label="Next" className="mv-side mv-side-r" variant="soft" onClick={next}>
        <ChevronRight size={20} />
      </IconButton>
      {showViewers && <ViewersSheet momentId={moment.id} onClose={() => setShowViewers(false)} />}
      {dialog}
    </div>,
    document.body,
  );
}

let holdTimer: ReturnType<typeof setTimeout> | null = null;
function startHold(ref: { current: boolean }, setPaused: (v: boolean) => void) {
  ref.current = false;
  holdTimer = setTimeout(() => {
    ref.current = true;
    setPaused(true);
  }, 220);
}
function endHold(ref: { current: boolean }, setPaused: (v: boolean) => void) {
  if (holdTimer) clearTimeout(holdTimer);
  if (ref.current) {
    setPaused(false);
    setTimeout(() => (ref.current = false), 0);
  }
}

function ViewersSheet({ momentId, onClose }: { momentId: string; onClose: () => void }) {
  const [list, setList] = useState<{ user: User; viewed_at: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => momentsApi.viewers(momentId).then((v) => live && setList(v)).catch(() => live && setList([]));
    void load();
    const onView = (e: Event) => (e as CustomEvent).detail?.moment_id === momentId && void load();
    window.addEventListener("secrets:moment-view", onView);
    return () => {
      live = false;
      window.removeEventListener("secrets:moment-view", onView);
    };
  }, [momentId]);
  return (
    <Modal open onClose={onClose} title={list ? `Viewed by ${list.length}` : "Viewers"} size="sm">
      {!list ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <p className="muted">No views yet. Moments disappear after 24 hours.</p>
      ) : (
        <ul className="mv-viewers">
          {list.map((v) => (
            <li key={v.user.id} className="row">
              <Avatar name={v.user.display_name} src={v.user.avatar_url} seed={v.user.id} size={36} />
              <div className="grow">
                <div className="truncate">{v.user.display_name}</div>
                <div className="faint truncate">@{v.user.username}</div>
              </div>
              <span className="faint">{timeAgo(v.viewed_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
