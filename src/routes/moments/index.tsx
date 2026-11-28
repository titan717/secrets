import { useEffect, useState } from "react";
import { Eye, Plus, Settings2, Shield } from "lucide-react";
import type { Moment, MomentGroup } from "@shared";
import { AuthImage, Avatar, Button, EmptyState, IconButton, Spinner } from "../../ui";
import { PageHeader } from "../PageHeader";
import { bgFor, timeAgo, useMoments } from "../../lib/features/moments";
import { useSession } from "../../stores/session";
import { MomentViewer } from "./MomentViewer";
import { MomentComposer } from "./MomentComposer";
import { MomentSettings } from "./MomentSettings";
import "./moments.css";

function Thumb({ m, size = "md" }: { m: Moment; size?: "md" | "lg" }) {
  return (
    <span className={`mthumb mthumb-${size}`} style={m.kind === "text" ? { background: bgFor(m.background) } : undefined}>
      {m.kind === "image" && m.attachment ? <AuthImage path={m.attachment.url} alt="" /> : <span className="mthumb-text">{m.text}</span>}
    </span>
  );
}

export default function MomentsPage() {
  const me = useSession((s) => s.user);
  const { groups, loaded, error, load } = useMoments();
  const [viewing, setViewing] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = groups.find((g) => g.user.id === me?.id);
  const others = groups.filter((g) => g.user.id !== me?.id);
  const fresh = others.filter((g) => g.has_unseen);
  const seen = others.filter((g) => !g.has_unseen);
  const totalViews = mine?.moments.reduce((n, m) => n + (m.view_count ?? 0), 0) ?? 0;

  return (
    <div className="page moments-page">
      <PageHeader
        title="Moments"
        subtitle="Share what's happening. Gone in 24 hours."
        actions={
          <>
            <IconButton label="Moment privacy" onClick={() => setSettings(true)}>
              <Settings2 size={18} />
            </IconButton>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => setComposing(true)}>
              New moment
            </Button>
          </>
        }
      />
      <div className="page-body mp-body">
        <section className="mp-mine">
          <button className="mp-mine-main" onClick={() => (mine ? setViewing(me!.id) : setComposing(true))}>
            <span className={`mring ${mine ? "is-seen is-mine" : "is-empty"}`}>
              <Avatar name={me?.display_name ?? "You"} src={me?.avatar_url} seed={me?.id} size={64} />
            </span>
            <span className="grow">
              <span className="mp-mine-title">Your moment</span>
              <span className="mp-mine-sub">
                {mine ? (
                  <>
                    {mine.moments.length} active · <Eye size={13} /> {totalViews} {totalViews === 1 ? "view" : "views"}
                  </>
                ) : (
                  "Tap to share a photo or a thought"
                )}
              </span>
            </span>
          </button>
          <div className="mp-mine-actions">
            <Button variant="secondary" size="sm" icon={<Shield size={15} />} onClick={() => setSettings(true)}>
              Privacy
            </Button>
          </div>
          {mine && (
            <div className="mp-strip">
              {mine.moments.map((m) => (
                <button key={m.id} className="mp-strip-item" onClick={() => setViewing(me!.id)} title={timeAgo(m.created_at)}>
                  <Thumb m={m} />
                  <span className="mp-strip-meta">
                    <Eye size={12} /> {m.view_count ?? 0}
                  </span>
                </button>
              ))}
              <button className="mp-strip-item mp-strip-add" onClick={() => setComposing(true)} aria-label="Add another moment">
                <Plus size={22} />
              </button>
            </div>
          )}
        </section>

        {!loaded ? (
          <div className="page-loading">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState compact title="Couldn't load moments" body={error} action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>} />
        ) : others.length === 0 ? (
          <EmptyState
            title="No moments yet"
            body="When friends share moments, they'll show up here and at the top of your chats."
            action={<Button onClick={() => setComposing(true)} icon={<Plus size={16} />}>Share the first one</Button>}
          />
        ) : (
          <>
            {fresh.length > 0 && <Grid title="New" groups={fresh} onOpen={setViewing} />}
            {seen.length > 0 && <Grid title="Viewed" groups={seen} onOpen={setViewing} />}
          </>
        )}
      </div>
      {viewing && <MomentViewer userId={viewing} onClose={() => setViewing(null)} />}
      <MomentComposer open={composing} onClose={() => setComposing(false)} />
      <MomentSettings open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function Grid({ title, groups, onOpen }: { title: string; groups: MomentGroup[]; onOpen: (id: string) => void }) {
  return (
    <section>
      <h3 className="mp-h">{title}</h3>
      <div className="mp-grid">
        {groups.map((g) => {
          const last = g.moments.at(-1)!;
          return (
            <button key={g.user.id} className={`mp-card ${g.has_unseen ? "is-new" : ""}`} onClick={() => onOpen(g.user.id)}>
              <Thumb m={last} size="lg" />
              <span className="mp-card-shade" />
              <span className="mp-card-av">
                <span className={`mring ${g.has_unseen ? "is-new" : "is-seen"}`}>
                  <Avatar name={g.user.display_name} src={g.user.avatar_url} seed={g.user.id} size={34} />
                </span>
              </span>
              <span className="mp-card-foot">
                <span className="mp-card-name truncate">{g.user.display_name}</span>
                <span className="mp-card-time">
                  {timeAgo(last.created_at)}
                  {g.moments.length > 1 ? ` · ${g.moments.length}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export { MomentsPage };
