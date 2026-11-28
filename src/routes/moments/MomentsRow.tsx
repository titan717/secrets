import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Avatar } from "../../ui";
import { useMoments } from "../../lib/features/moments";
import { useSession } from "../../stores/session";
import { MomentViewer } from "./MomentViewer";
import { MomentComposer } from "./MomentComposer";
import { useMomentsEnabled } from "./prefs";
import "./moments.css";

/** Stories tray for the top of the chat list. Self-contained (no props). */
export function MomentsRow({ heading = false }: { heading?: boolean } = {}) {
  const nav = useNavigate();
  const me = useSession((s) => s.user);
  const groups = useMoments((s) => s.groups);
  const load = useMoments((s) => s.load);
  const [enabled] = useMomentsEnabled();
  const [viewing, setViewing] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  if (!enabled || !me) return null;
  const mine = groups.find((g) => g.user.id === me.id);
  const others = groups.filter((g) => g.user.id !== me.id);

  return (
    <>
      {heading && <h2 className="mrow-heading">Stories</h2>}
      <div className="mrow" aria-label="Stories">
        <div className="mrow-item">
          <button className="mrow-btn" onClick={() => (mine ? setViewing(me.id) : setComposing(true))} aria-label={mine ? "View your story" : "Add to your story"}>
            <span className={`mring ${mine ? "is-seen is-mine" : "is-empty"}`}>
              <Avatar name={me.display_name} src={me.avatar_url} seed={me.id} size={54} />
            </span>
            <span className="mrow-name">Your Story</span>
          </button>
          <button className="mrow-add" onClick={() => setComposing(true)} aria-label="New story">
            <Plus size={12} strokeWidth={3} />
          </button>
        </div>
        {others.map((g) => (
          <button key={g.user.id} className="mrow-btn mrow-item" onClick={() => setViewing(g.user.id)}>
            <span className={`mring ${g.has_unseen ? "is-new" : "is-seen"}`}>
              <Avatar name={g.user.display_name} src={g.user.avatar_url} seed={g.user.id} size={54} />
            </span>
            <span className={`mrow-name truncate ${g.has_unseen ? "is-new" : ""}`}>{g.user.display_name.split(" ")[0]}</span>
          </button>
        ))}
        <button className="mrow-btn mrow-item" onClick={() => nav("/moments")}>
          <span className="mring is-more" aria-hidden>
            <Plus size={22} />
          </span>
          <span className="mrow-name">More</span>
        </button>
      </div>
      {viewing && <MomentViewer userId={viewing} onClose={() => setViewing(null)} />}
      <MomentComposer open={composing} onClose={() => setComposing(false)} />
    </>
  );
}
