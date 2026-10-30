import { Navigate, Route, Routes } from "react-router-dom";
import type { AppController } from "./useAppController";
import { BusinessWorkspace } from "../BusinessWorkspace";
import { AccountTools } from "./account-tools";
import { WorkspaceSidebar } from "./workspace-navigation";
import { WorkspaceHeader } from "./workspace-header";

export function WorkspaceScreen(props: AppController) {
  const {
    user,
    repository,
    online,
    message,
    locked,
    saving,
    beginLogout,
    showAdmins,
    setShowAdmins,
    showPasswordChange,
    setShowPasswordChange,
    changePassword,
    setMessage,
  } = props;
  const businessProps =
    user && repository ? { user, repository, locked, online, onStatus: setMessage } : undefined;

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]" dir="rtl">
      <WorkspaceSidebar user={user} online={online} />
      <main className="min-w-0">
        <WorkspaceHeader user={user} online={online} />
        {message && (
          <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
            <p
              className={`rounded-xl border px-4 py-3 text-sm leading-7 ${
                locked
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-border bg-card text-foreground"
              }`}
              role="status"
            >
              {message}
            </p>
          </div>
        )}
        {businessProps && (
          <Routes>
            <Route index element={<Navigate to="/projects" replace />} />
            <Route
              path="projects"
              element={<BusinessWorkspace {...businessProps} page="projects" />}
            />
            <Route
              path="projects/:projectId"
              element={<BusinessWorkspace {...businessProps} page="project" />}
            />
            <Route
              path="people"
              element={<BusinessWorkspace {...businessProps} page="contacts" />}
            />
            <Route
              path="engagements"
              element={<BusinessWorkspace {...businessProps} page="engagements" />}
            />
            <Route
              path="workforce"
              element={<BusinessWorkspace {...businessProps} page="workforce" />}
            />
            <Route
              path="procurement"
              element={<BusinessWorkspace {...businessProps} page="procurement" />}
            />
            <Route
              path="analytics"
              element={<BusinessWorkspace {...businessProps} page="analytics" />}
            />
            <Route
              path="account"
              element={
                <section className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 sm:px-6 lg:py-8">
                  <AccountTools
                    user={user}
                    showAdmins={showAdmins}
                    setShowAdmins={setShowAdmins}
                    showPasswordChange={showPasswordChange}
                    setShowPasswordChange={setShowPasswordChange}
                    changePassword={changePassword}
                    saving={saving}
                    locked={locked}
                    online={online}
                    beginLogout={beginLogout}
                  />
                </section>
              }
            />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
