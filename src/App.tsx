import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { configureApi, api } from "./lib/api";
import { applyAppearance } from "./lib/theme";
import { useSession } from "./stores/session";
import { useSettings } from "./stores/settings";
import { useFlags } from "./lib/flags";
import { startChat, stopChat } from "./stores/chat";
import { Toaster, Spinner } from "./ui";
import { Shell } from "./routes/Shell";
import { Welcome } from "./routes/auth/Welcome";
import { Login } from "./routes/auth/Login";
import { Signup } from "./routes/auth/Signup";
import { ForgotPassword, ResetPassword } from "./routes/auth/PasswordReset";
import { VerifyEmail } from "./routes/auth/VerifyEmail";
import { ChatsPage } from "./routes/chats/ChatsPage";
import { HomePage } from "./routes/HomePage";
import { ComingSoon } from "./routes/ComingSoon";
import { UserPage } from "./routes/profile/UserPage";

const MomentsPage = lazy(() => import("./routes/moments"));
const NotesPage = lazy(() => import("./routes/notes"));
const TasksPage = lazy(() => import("./routes/tasks"));
const VaultPage = lazy(() => import("./routes/vault"));
const DocksPage = lazy(() => import("./routes/docks/DocksPage").then((m) => ({ default: m.DocksPage })));
const AiPage = lazy(() => import("./routes/ai/AiPage").then((m) => ({ default: m.AiPage })));
const CallsPage = lazy(() => import("./routes/calls/CallsPage").then((m) => ({ default: m.CallsPage })));
const ShareProfilePage = lazy(() => import("./routes/profile/ShareProfile").then((m) => ({ default: m.ShareProfilePage })));
const SettingsPage = lazy(() => import("./routes/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const CallOverlay = lazy(() => import("./routes/calls/CallOverlay").then((m) => ({ default: m.CallOverlay })));

function useAppearance() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const font = useSettings((s) => s.font);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  useEffect(() => {
    applyAppearance({ theme, accent, font });
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => applyAppearance({ theme, accent, font });
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme, accent, font, reduceMotion]);
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useSession((s) => s.token);
  const ready = useSession((s) => s.ready);
  const loc = useLocation();
  if (!ready)
    return (
      <div className="page-loading">
        <Spinner size={22} />
      </div>
    );
  if (!token) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />;
  return children;
}

export function App() {
  useAppearance();
  const token = useSession((s) => s.token);
  const navigate = useNavigate();
  const flags = useFlags((s) => s.flags);
  const loadFlags = useFlags((s) => s.load);
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    configureApi({
      getToken: () => useSession.getState().token,
      onUnauthorized: () => {
        useSession.getState().clear();
        navigate("/welcome", { replace: true });
      },
    });
  }, [navigate]);

  useEffect(() => {
    if (!token) {
      stopChat();
      return;
    }
    startChat();
    void loadFlags();
    api("GET /v1/me")
      .then((u) => useSession.getState().setUser(u))
      .catch(() => {});
  }, [token]);

  const fallback = (
    <div className="page-loading">
      <Spinner size={22} />
    </div>
  );

  return (
    <>
      <Suspense fallback={fallback}>
        <Routes>
          <Route path="/welcome" element={token ? <Navigate to="/chats" replace /> : <Welcome />} />
          <Route path="/login" element={token ? <Navigate to="/chats" replace /> : <Login />} />
          <Route path="/signup" element={token ? <Navigate to="/chats" replace /> : <Signup />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/chats" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/chats" element={<ChatsPage />} />
            <Route path="/chats/:id" element={<ChatsPage />} />
            <Route path="/calls" element={flags.calls ? <CallsPage /> : <Navigate to="/chats" replace />} />
            <Route path="/docks" element={flags.docks ? <DocksPage /> : <Navigate to="/chats" replace />} />
            <Route path="/docks/:id" element={flags.docks ? <DocksPage /> : <Navigate to="/chats" replace />} />
            <Route path="/docks/:id/:channelId" element={flags.docks ? <DocksPage /> : <Navigate to="/chats" replace />} />
            <Route path="/ai/*" element={flags.ai ? <AiPage /> : <Navigate to="/chats" replace />} />
            <Route path="/share" element={<ShareProfilePage />} />
            <Route path="/profile" element={<SettingsPage />} />
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route path="/moments" element={flags.experimental ? <MomentsPage /> : <Navigate to="/home" replace />} />
            <Route path="/notes" element={flags.experimental ? <NotesPage /> : <Navigate to="/home" replace />} />
            <Route path="/notes/:id" element={flags.experimental ? <NotesPage /> : <Navigate to="/home" replace />} />
            <Route path="/tasks" element={flags.experimental ? <TasksPage /> : <Navigate to="/home" replace />} />
            <Route path="/vault" element={flags.experimental ? <VaultPage /> : <Navigate to="/home" replace />} />
            <Route path="/notifications" element={<ComingSoon kind="notifications" />} />
          </Route>
          <Route path="/u/:username" element={<UserPage />} />
          <Route path="*" element={<Navigate to={token ? "/chats" : "/welcome"} replace />} />
        </Routes>
        {token && <CallOverlay />}
      </Suspense>
      <Toaster />
    </>
  );
}
