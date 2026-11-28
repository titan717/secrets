import { lazy, Suspense } from "react";

const Panel = lazy(() => import("./AiDrawerPanel").then((m) => ({ default: m.AiDrawerPanel })));

/** Slide-in AI panel. The panel code loads on first open so the main bundle stays small. */
export function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Panel open={open} onClose={onClose} />
    </Suspense>
  );
}
