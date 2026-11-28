import { Zap } from "lucide-react";
import { EmptyState } from "../../../ui";
import { ASSISTANT_NAME } from "../../../lib/ai/settings";
import { PageShell } from "./Shell";

export default function ApexPage() {
  return (
    <PageShell title="Apex">
      <EmptyState art={<Zap size={48} className="g-accent" />} title="Apex is coming" body={`Long-running ${ASSISTANT_NAME} agents that work across your projects in the background. This needs the ai.secrets bridge and arrives with the backend phase.`} />
    </PageShell>
  );
}
