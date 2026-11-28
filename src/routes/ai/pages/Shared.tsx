import { Link, useParams } from "react-router-dom";
import { Copy, ExternalLink, Link2Off } from "lucide-react";
import { Button, EmptyState } from "../../../ui";
import { useAiShares } from "../../../lib/ai/shares";
import { toast } from "../../../stores/toast";
import { AssistantMessage } from "../Message";
import { PageShell, relTime } from "./Shell";
import { TopBar } from "../TopBar";

export default function SharedPage() {
  const shares = useAiShares((s) => s.shares);
  const revoke = useAiShares((s) => s.revoke);
  return (
    <PageShell title="Shared links">
      {shares.length === 0 ? (
        <EmptyState compact title="No shared links" body="Share a chat from its ⋯ menu or the share button under a reply. Links are read-only and you can revoke them anytime." />
      ) : (
        <ul className="g-rows">
          {shares.map((s) => (
            <li key={s.id} className={`g-row ${s.revokedAt ? "is-off" : ""}`}>
              <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
                <span className="truncate">{s.title}</span>
                <span className="g-meta">
                  {s.revokedAt ? `Revoked ${relTime(s.revokedAt)}` : `Shared ${relTime(s.createdAt)}`}
                  {s.local && !s.revokedAt && " · this device only"}
                </span>
              </div>
              {!s.revokedAt && (
                <>
                  <button type="button" className="g-icon" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(s.url).then(() => toast.success("Link copied"))}>
                    <Copy size={16} />
                  </button>
                  <Link className="g-icon" aria-label="Open link" to={`/ai/s/${s.id}`}>
                    <ExternalLink size={16} />
                  </Link>
                  <Button size="sm" variant="ghost" icon={<Link2Off size={14} />} onClick={() => revoke(s.id)}>
                    Revoke
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

export function SharedView() {
  const { shareId } = useParams();
  const s = useAiShares((st) => st.shares.find((x) => x.id === shareId));
  return (
    <div className="g-thread">
      <TopBar title={s?.title ?? "Shared chat"} />
      <div className="g-scroll">
        {!s || s.revokedAt ? (
          <EmptyState title={s ? "This link was revoked" : "Link not found"} body={s ? "The owner stopped sharing this chat." : "It may have been shared from another device."} />
        ) : (
          <div className="g-msgs">
            <div className="g-readonly">Read-only · shared {relTime(s.createdAt)}</div>
            {s.items.map((it) =>
              it.kind === "user" ? (
                <div key={it.id} className="g-user">
                  <div className="g-bubble">{it.text}</div>
                </div>
              ) : (
                <AssistantMessage key={it.id} item={it} chatId={s.sessionId} readOnly />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
