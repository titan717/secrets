import { NotebookPen, ListChecks, Vault, Sparkle, Bell } from "lucide-react";
import { Badge, Ghost } from "../ui";
import { PageHeader } from "./PageHeader";

const COPY = {
  moments: { icon: Sparkle, title: "Moments", line: "Little stories from your people that fade after a day.", points: ["Share a photo or a thought with close friends", "See who viewed, privately", "Disappears after 24 hours"] },
  notes: { icon: NotebookPen, title: "Notes", line: "Private notes with folders, tags and checklists — synced across your devices.", points: ["Rich text with checklists and images", "Link notes to chats and docks", "Encrypted like your messages"] },
  tasks: { icon: ListChecks, title: "Tasks", line: "Lightweight to-dos you can assign right from a conversation.", points: ["Turn any message into a task", "Due dates and reminders", "Shared lists for groups and docks"] },
  vault: { icon: Vault, title: "Vault", line: "A locked drawer for the files and photos that matter most.", points: ["Biometric unlock", "Files you can share in one tap", "Never leaves your control"] },
  notifications: { icon: Bell, title: "Notifications", line: "Mentions, invites and reactions, all in one calm feed.", points: ["Mentions across docks", "Invites and join requests", "Quiet hours"] },
} as const;

export function ComingSoon({ kind }: { kind: keyof typeof COPY }) {
  const c = COPY[kind];
  return (
    <div className="page">
      <PageHeader title={c.title} />
      <div className="soon">
        <div className="soon-art">
          <div className="soon-orbit">
            <c.icon size={30} />
          </div>
          <Ghost size={130} float />
        </div>
        <Badge>Coming soon</Badge>
        <h2>{c.title} is on its way</h2>
        <p className="muted">{c.line}</p>
        <ul className="soon-points">
          {c.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
