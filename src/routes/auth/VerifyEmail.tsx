import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, X } from "lucide-react";
import { apiRaw, errorMessage } from "../../lib/api";
import { Spinner } from "../../ui";
import { AuthLayout } from "./AuthLayout";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This link is missing its token.");
      return;
    }
    apiRaw("POST /v1/auth/verify-email", { body: { token } })
      .then(() => setState("ok"))
      .catch((e) => {
        setState("error");
        setMessage(errorMessage(e));
      });
  }, [token]);

  return (
    <AuthLayout>
      <div className="auth-card auth-form">
        <h2 className="auth-title">Email verification</h2>
        {state === "working" && (
          <p className="muted auth-sub">
            <Spinner size={14} /> Confirming your email…
          </p>
        )}
        {state === "ok" && (
          <>
            <p className="avail avail-ok">
              <Check size={16} /> Your email is verified.
            </p>
            <Link to="/chats">Go to your chats</Link>
          </>
        )}
        {state === "error" && (
          <>
            <p className="avail avail-bad">
              <X size={16} /> {message || "That link is invalid or has expired."}
            </p>
            <Link to="/login">Back to sign in</Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
