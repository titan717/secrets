import { lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useCalls } from "../../stores/calls";

// livekit-client is large; load the call stage only once a call starts.
const CallStage = lazy(() => import("./CallStage").then((m) => ({ default: m.CallStage })));

/** Global call UI, mounted in App.tsx whenever signed in. */
export function CallOverlay() {
  const active = useCalls((s) => s.active);
  if (!active) return null;
  return createPortal(
    <Suspense fallback={<div className="call-overlay call-loading" aria-busy="true" />}>
      <CallStage key={active.id} />
    </Suspense>,
    document.body,
  );
}
