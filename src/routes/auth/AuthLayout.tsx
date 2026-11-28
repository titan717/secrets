import type { ReactNode } from "react";
import { Lock, MessageCircle, Users, Sparkles } from "lucide-react";
import { Ghost, Wordmark } from "../../ui";

export function AuthLayout({ children, hero = true }: { children: ReactNode; hero?: boolean }) {
  return (
    <div className="auth">
      <div className="auth-aura" aria-hidden />
      <aside className="auth-hero" aria-hidden={!hero}>
        <Wordmark size={34} />
        <div className="auth-hero-copy">
          <h1>
            Your world.
            <br />
            Your people.
            <br />
            <span className="grad-text">Your space.</span>
          </h1>
          <ul className="auth-points">
            <li>
              <MessageCircle size={18} /> Messaging and calls that stay between you
            </li>
            <li>
              <Users size={18} /> Docks for your communities and crews
            </li>
            <li>
              <Sparkles size={18} /> A ghost assistant that keeps your keys on your device
            </li>
          </ul>
        </div>
        <div className="auth-hero-foot">
          <Lock size={14} /> Secure. Private. Together.
        </div>
        <Ghost size={300} float className="auth-hero-ghost" />
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
