import type { AppController } from "./useAppController";
import { BusinessWorkspace } from "../BusinessWorkspace";
import { DraftEntry } from "./draft-entry";
import { DraftList } from "./draft-list";
import { DepartureDialog } from "./departure-dialog";
import { AccountTools } from "./account-tools";
import { UpdateBanner } from "./update-banner";

export function WorkspaceScreen(props: AppController) {
  const {
    user,
    repository,
    drafts,
    online,
    message,
    locked,
    text,
    setText,
    saveDraft,
    saving,
    exportPending,
    beginLogout,
    showAdmins,
    setShowAdmins,
    showPasswordChange,
    setShowPasswordChange,
    changePassword,
    departure,
    exportBeforeLogout,
    finishLogout,
    discardAndLogout,
    cancelDeparture,
    updateReady,
    applyUpdate,
    setMessage,
  } = props;
  return (
    <main className="page-shell" dir="rtl">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          Ø¯
        </div>
        <div>
          <p className="eyebrow">Ø¯ÙØªØ± Ø±ÙˆØ²Ø§Ù†Ù‡Ù” Ú©Ø§Ø±Ú¯Ø§Ù‡</p>
          <h1>ÛŒØ§Ø¯Ø¯Ø§Ø´Øª ØªØ§Ø²Ù‡</h1>
          <p className="workspace-user">
            {user?.displayName} Â· {user?.username}
          </p>
        </div>
        <span className={online ? "connection is-online" : "connection is-offline"} role="status">
          <span className="connection-dot" />
          {online ? "Ø¢Ù†Ù„Ø§ÛŒÙ†" : "Ø¢ÙÙ„Ø§ÛŒÙ†"}
        </span>
      </header>
      {message && (
        <p className={locked ? "feedback auth-warning" : "feedback"} role="status">
          {message}
        </p>
      )}
      <DraftEntry
        text={text}
        setText={setText}
        saveDraft={saveDraft}
        saving={saving}
        locked={locked}
      />
      <DraftList
        drafts={drafts}
        exportPending={exportPending}
        syncPending={() => void repository?.syncPending()}
        online={online}
        locked={locked}
      />
      {user && repository && (
        <BusinessWorkspace
          user={user}
          repository={repository}
          locked={locked}
          onStatus={setMessage}
        />
      )}
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
      <DepartureDialog
        departure={departure}
        exportBeforeLogout={exportBeforeLogout}
        finishLogout={finishLogout}
        discardAndLogout={discardAndLogout}
        cancelDeparture={cancelDeparture}
      />
      <UpdateBanner updateReady={updateReady} applyUpdate={applyUpdate} />
      <footer className="footer-note">
        <span className="footer-rule" />
        <span>
          ÛŒØ§Ø¯Ø¯Ø§Ø´Øªâ€ŒÙ‡Ø§ÛŒ Ø§Ø±Ø³Ø§Ù„â€ŒÙ†Ø´Ø¯Ù‡ Ø¯Ø± ÙØ¶Ø§ÛŒ Ø¬Ø¯Ø§Ú¯Ø§Ù†Ù‡Ù” Ù‡Ù…ÛŒÙ†
          Ø­Ø³Ø§Ø¨ Ø¨Ø§Ù‚ÛŒ Ù…ÛŒâ€ŒÙ…Ø§Ù†Ù†Ø¯.
        </span>
      </footer>
    </main>
  );
}
