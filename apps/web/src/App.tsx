import { useAppController } from "./app/useAppController";
import { LoginScreen, PasswordScreen } from "./app/application-screens";
import { WorkspaceScreen } from "./app/workspace-screen";

export default function App() {
  const app = useAppController();
  if (app.screen === "loading")
    return (
      <main className="page-shell" dir="rtl">
        <p role="status">در حال آماده‌سازی فضای کاری…</p>
      </main>
    );
  if (app.screen === "login") return <LoginScreen {...app} />;
  if (app.screen === "password") return <PasswordScreen {...app} />;
  return <WorkspaceScreen {...app} />;
}
