import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QrCode, ChevronLeft, ChevronRight, CalendarDays, UserX, UserPlus, Images, PenLine } from "lucide-react";
import type { User } from "@shared";
import { api, errorMessage, HttpError } from "../../lib/api";
import { useSession } from "../../stores/session";
import { useChat } from "../../stores/chat";
import { toast } from "../../stores/toast";
import { Avatar, Spinner, EmptyState } from "../../ui";
import { bannerStyle } from "./ProfileCard";
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

  const isMe = !!(me && user && me.id === user.id);
  const back = () => (window.history.length > 1 ? nav(-1) : nav(token ? "/chats" : "/welcome"));
  const joined = user ? new Date(user.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";

  return (
    <div className={`up ${token ? "" : "is-public"}`}>
      {state === "loading" && (
        <div className="row" style={{ justifyContent: "center", padding: 80 }}>
          <Spinner />
        </div>
      )}
      {(state === "missing" || state === "error") && (
        <div className="up-empty">
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
        </div>
      )}
      {(state === "ok" || state === "locked") && (
        <article className="up-card" aria-label={user ? `${user.display_name}'s profile` : `@${username}`}>
          <div className="up-cover" style={bannerStyle(user?.accent ?? null)}>
            <button type="button" className="up-fab up-back" aria-label="Back" onClick={back}>
              <ChevronLeft />
            </button>
            <button type="button" className="up-fab up-qr" aria-label="Share profile" onClick={() => nav(`/share?u=${encodeURIComponent(user?.username ?? username)}`)} disabled={!user}>
              <QrCode />
            </button>
          </div>
          <div className="up-sheet">
            <div className="up-avatar">
              <Avatar name={user?.display_name ?? username} src={user?.avatar_url} seed={user?.id ?? username} size={116} online={token && user ? !!presence[user.id] : undefined} />
            </div>
            {user ? (
              <>
                <h1 className="up-name">{user.display_name}</h1>
                <p className="up-handle">@{user.username}</p>
                {user.about && <p className="up-about">{user.about}</p>}
                <p className="up-meta">
                  <span>
                    <CalendarDays aria-hidden /> Joined {joined}
                  </span>
                </p>
              </>
            ) : (
              <>
                <h1 className="up-name">@{username.toLowerCase()}</h1>
                <p className="up-handle">is on Secrets</p>
                <p className="up-about">Sign in or create a free account to see their profile and start a private chat.</p>
              </>
            )}
            {isMe ? (
              <button type="button" className="up-primary" onClick={() => nav("/settings/profile")}>
                <PenLine aria-hidden /> Edit profile
              </button>
            ) : (
              <button type="button" className="up-primary" onClick={() => (user ? void message() : nav("/login", { state: { from: `/u/${username}` } }))} disabled={busy}>
                <UserPlus aria-hidden /> Add Friend
              </button>
            )}
            {token && user && !isMe && (
              <button type="button" className="up-row" onClick={() => void message()}>
                <Images aria-hidden />
                <span>Media, files and links</span>
                <ChevronRight aria-hidden />
              </button>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
