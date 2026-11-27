import { Link } from "react-router-dom";
import { Ghost, Wordmark } from "../../ui";
import { AuthLayout } from "./AuthLayout";

export function Welcome() {
  return (
    <AuthLayout>
      <div className="auth-card welcome-card">
        <div className="auth-mobile-brand">
          <Wordmark size={28} />
        </div>
        <Ghost size={168} float className="welcome-ghost" />
        <div className="welcome-copy">
          <h2>
            Say it in <span className="grad-text">Secrets</span>.
          </h2>
          <p className="muted">Chats, calls and docks for the people who matter. Pick a username and you’re in — no phone number needed.</p>
        </div>
        <div className="welcome-actions">
          <Link to="/signup" className="btn btn-primary btn-lg btn-block">
            Create account
          </Link>
          <Link to="/login" className="btn btn-outline btn-lg btn-block">
            I already have an account
          </Link>
        </div>
        <p className="auth-fine faint">Secure. Private. Together.</p>
      </div>
    </AuthLayout>
  );
}
