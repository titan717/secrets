import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MessageCircle, QrCode, ArrowLeft, CalendarDays, UserX } from "lucide-react";
import type { User } from "@secrets/shared";
import { api, errorMessage, HttpError } from "../../lib/api";
import { useSession } from "../../stores/session";
import { useChat } from "../../stores/chat";
import { toast } from "../../stores/toast";
import { Avatar, Button, IconButton, Spinner, EmptyState, Wordmark } from "../../ui";
import { ShareProfileModal, bannerStyle } from "./ProfileCard";
import "./profile.css";

export function UserPage() {
  const { username = "" } = useParams();
  const token = useSession((s) => s.token);
  const me = useSession((s) => s.user);
  const presence = useChat((s) => s.presence);
  const nav = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error" | "locked">("loading");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    api("GET /v1/users/:username", { params: { username: username.toLowerCase() } })
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setState("ok");
        useChat.getState().rememberUsers([u]);
      })
      .catch((e) => alive && setState(e instanceof HttpError && e.status === 404 ? "missing" : e instanceof HttpError && e.status === 401 ? "locked" : "error"));
    return () => {
      alive = false;
    };
  }, [username]);

  const message = async () => {
    if (!user) return;
    if (!token) return nav("/login", { state: { from: `/u/${user.username}` } });
    setBusy(true);
    try {
      const c = await api("POST /v1/conversations/dm", { body: { user_id: user.id } });
      useChat.getState().upsertConversation(c);
      nav(`/chats/${c.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const isMe = me && user && me.id === user.id;

  return (
    <div className={`user-page ${token ? "" : "is-public"}`}>
      {!token && (
        <header className="user-page-top">
          <Link to="/welcome" aria-label="Secrets home">
            <Wordmark size={26} />
          </Link>
          <Link to="/login" className="btn btn-secondary btn-sm">
            Sign in
          </Link>
        </header>
      )}
      <div className="user-page-inner">
        {state === "loading" && (
          <div className="row" style={{ justifyContent: "center", padding: 80 }}>
            <Spinner />
          </div>
        )}
        {(state === "missing" || state === "error") && (
          <EmptyState
            art={<UserX size={40} />}
            title={state === "missing" ? `@${username} isn’t on Secrets` : "Couldn’t load this profile"}
            body={state === "missing" ? "Double-check the username, or invite them to join." : "Check your connection and try again."}
            action={
              <Link className="btn btn-secondary btn-md" to={token ? "/chats" : "/welcome"}>
                {token ? "Back to chats" : "Explore Secrets"}
              </Link>
            }
          />
        )}
        {state === "locked" && (
          <article className="user-card">
            <div className="profile-banner" style={bannerStyle(null)} />
            <div className="profile-id">
              <Avatar name={username} seed={username} size={104} ring />
              <div className="profile-names">
                <h1>@{username.toLowerCase()}</h1>
                <span className="profile-handle">is on Secrets</span>
              </div>
              <p className="user-about">Sign in or create a free account to see their profile and start a private chat.</p>
              <div className="row profile-cta">
                <Button size="lg" icon={<MessageCircle size={17} />} onClick={() => nav("/login", { state: { from: `/u/${username}` } })}>
                  Sign in to message
                </Button>
                <Link className="btn btn-secondary btn-lg" to="/signup">
                  Create account
                </Link>
              </div>
            </div>
          </article>
        )}
        {state === "ok" && user && (
          <article className="user-card">
            <div className="profile-banner" style={bannerStyle(user.accent)}>
              {token && (
                <IconButton label="Back" variant="soft" onClick={() => nav(-1)} className="user-back">
                  <ArrowLeft size={19} />
                </IconButton>
              )}
            </div>
            <div className="profile-id">
              <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={104} ring online={token ? !!presence[user.id] : undefined} />
              <div className="profile-names">
                <h1>{user.display_name}</h1>
                <span className="profile-handle">@{user.username}</span>
              </div>
              {user.about && <p className="user-about">{user.about}</p>}
              <span className="faint row" style={{ gap: 6, fontSize: "var(--text-sm)" }}>
                <CalendarDays size={14} /> On Secrets since {new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              <div className="row profile-cta">
                {isMe ? (
                  <Button variant="secondary" onClick={() => nav("/profile")}>
                    Edit your profile
                  </Button>
                ) : (
                  <Button icon={<MessageCircle size={17} />} onClick={() => void message()} loading={busy} size="lg">
                    {token ? "Message" : "Sign in to message"}
                  </Button>
                )}
                <Button variant="secondary" size="lg" icon={<QrCode size={17} />} onClick={() => setSharing(true)}>
                  Share
                </Button>
              </div>
            </div>
          </article>
        )}
        {!token && state !== "loading" && (
          <p className="faint user-page-foot">
            Secrets — your world, your people, your space. <Link to="/signup">Create an account</Link>
          </p>
        )}
      </div>
      {user && <ShareProfileModal user={user} open={sharing} onClose={() => setSharing(false)} />}
    </div>
  );
}
