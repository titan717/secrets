import { useState } from "react";
import { Bookmark, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, EmptyState, Input, ListGroup, ListItem, Toggle } from "../../../ui";
import { useAiMemory } from "../../../lib/ai/memory";
import { useAiSettings, ASSISTANT_NAME } from "../../../lib/ai/settings";
import { PageShell, relTime } from "./Shell";

export default function MemoryPage() {
  const facts = useAiMemory((s) => s.facts);
  const { add, remove, clear } = useAiMemory.getState();
  const enabled = useAiSettings((s) => s.memoryEnabled);
  const set = useAiSettings((s) => s.set);
  const [text, setText] = useState("");
  const approved = facts.filter((f) => f.status === "approved");
  const submit = () => {
    if (!text.trim()) return;
    add(text.trim(), "user");
    setText("");
  };
  return (
    <PageShell title="Memory">
      <ListGroup footer={`${ASSISTANT_NAME} only remembers facts you approve. It may suggest one after a chat; nothing is saved until you confirm.`}>
        <ListItem icon={<Bookmark size={18} />} title="Use memory" subtitle="Recall these facts in new chats" trailing={<Toggle label="Use memory" checked={enabled} onChange={(memoryEnabled) => set({ memoryEnabled })} />} />
      </ListGroup>
      <form className="row g-addrow" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something to remember, e.g. “I deploy on Fly.io”" aria-label="New memory" maxLength={280} />
        <Button type="submit" icon={<Plus size={16} />} disabled={!text.trim()}>Add</Button>
      </form>
      {approved.length === 0 ? (
        <EmptyState compact title="Nothing remembered yet" body="Add a fact, or approve one when it’s suggested in a chat." />
      ) : (
        <ul className="g-rows">
          {approved.map((f) => (
            <li key={f.id} className="g-row">
              {f.source === "assistant" ? <Sparkles size={16} className="g-accent" aria-label="Suggested by assistant" /> : <Bookmark size={16} className="faint" />}
              <span className="grow">{f.text}</span>
              <span className="g-meta">{relTime(f.createdAt)}</span>
              <button type="button" className="g-icon" aria-label={`Forget “${f.text}”`} onClick={() => remove(f.id)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {approved.length > 0 && (
        <div className="g-page-foot">
          <Button variant="ghost" onClick={() => confirm("Forget everything?") && clear()}>Clear all memory</Button>
        </div>
      )}
    </PageShell>
  );
}
