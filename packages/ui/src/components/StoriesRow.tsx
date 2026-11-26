import { Plus } from "lucide-react";
import { cx } from "../cx";
import type { StoryItem } from "../shared/types";
import { Avatar } from "./Avatar";

export interface StoriesRowProps {
  items: StoryItem[];
  onSelect?: (id: string) => void;
  label?: string;
  className?: string;
}

/** Optional Moments 24h tray. Hide the whole row when Stories are off. */
export function StoriesRow({ items, onSelect, label = "Stories", className }: StoriesRowProps) {
  return (
    <ul className={cx("s-stories", className)} aria-label={label}>
      {items.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className={cx("s-story", s.unseen && "is-unseen")}
            onClick={() => onSelect?.(s.id)}
            aria-label={s.isSelf ? "Your story, add" : `${s.name}${s.unseen ? ", new" : ""}`}
          >
            <span className="s-story__ring">
              <Avatar name={s.name} src={s.src} size="lg" decorative />
              {s.isSelf && (
                <span className="s-story__add" aria-hidden="true">
                  <Plus size={12} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="s-story__name" aria-hidden="true">{s.isSelf ? "Your story" : s.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
