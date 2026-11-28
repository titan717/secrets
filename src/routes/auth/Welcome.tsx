import { Link, useNavigate } from "react-router-dom";
import { GoogleG, ObScreen } from "./ob";
import { useGoogleSignIn } from "./useGoogle";

/** Welcome (blueprint p46): mark, headline, Continue with Google, Create account, Log in, terms. */
export function Welcome() {
  const nav = useNavigate();
  const g = useGoogleSignIn();
  return (
    <ObScreen
      label="Welcome to Secrets"
      className="ob-welcome"
      foot={
        <>
          <button type="button" className="ob-google" onClick={g.start}>
            <GoogleG /> Continue with Google
          </button>
          <button type="button" className="ob-pill" onClick={() => nav("/signup")}>
            Create account
          </button>
          <p className="ob-have">
            Have an account already? <Link to="/login">Log in</Link>
          </p>
          <p className="ob-fine">
            By continuing, you agree to the <strong>Terms of Service</strong> and <strong>Privacy Policy</strong>.
          </p>
        </>
      }
    >
      <img className="ob-welcome-mark" src="/logo-mark.png" alt="Secrets" />
      <h1>The chat app that thinks with you.</h1>
      {g.chooser}
    </ObScreen>
  );
}
