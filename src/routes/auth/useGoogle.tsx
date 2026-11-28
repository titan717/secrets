import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../stores/session";
import { toast } from "../../stores/toast";
import { GoogleChooser } from "./ob";

/** "Continue with Google" — opens the demo account chooser (p45) and signs in. */
export function useGoogleSignIn() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const setSession = useSession((s) => s.setSession);
  const pick = async (email: string) => {
    setOpen(false);
    try {
      const s = await api("POST /v1/auth/google", { body: { email } });
      setSession(s);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && !/^\/(welcome|login|signup)/.test(from) ? from : "/chats", { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const chooser = <GoogleChooser open={open} onClose={() => setOpen(false)} onPick={(e) => void pick(e)} onAdd={() => (setOpen(false), nav("/signup"))} />;
  return { start: () => setOpen(true), chooser };
}
