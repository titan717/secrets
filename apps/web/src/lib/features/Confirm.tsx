import { useState, type ReactNode } from "react";
import { Button, Modal } from "../../ui";

/** In-app confirm dialog (native confirm() can be blocked in embedded previews). */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: ReactNode; action: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (title: string, opts: { body?: ReactNode; action?: string } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, body: opts.body, action: opts.action ?? "Delete", resolve }));
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal
      open={!!state}
      onClose={() => close(false)}
      title={state?.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => close(true)} autoFocus>
            {state?.action}
          </Button>
        </>
      }
    >
      {state?.body && <p className="muted">{state.body}</p>}
    </Modal>
  );
  return { confirm, dialog, open: !!state };
}
