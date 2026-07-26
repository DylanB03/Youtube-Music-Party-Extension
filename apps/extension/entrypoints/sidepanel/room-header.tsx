import { useEffect, useRef, useState } from "react";
import type { SyncStatus } from "@ytm-party/shared";
import { presentSyncStatus } from "./room-presentation";

type RoomHeaderProps = {
  inviteCode: string;
  listenerCount: number | null;
  localSyncStatus: SyncStatus;
  pendingAction: string | null;
  onLeave: () => void;
};

export function RoomHeader({
  inviteCode,
  listenerCount,
  localSyncStatus,
  pendingAction,
  onLeave,
}: RoomHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const syncStatus = presentSyncStatus(localSyncStatus);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnOutsideClick(event: PointerEvent): void {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const listenerLabel =
    listenerCount === null
      ? "Connecting"
      : `${listenerCount} ${listenerCount === 1 ? "listener" : "listeners"}`;

  return (
    <header className="app-header">
      <div className="app-header-topline">
        <p className="brand-mark">
          TogetherTune<span className="brand-dot" aria-hidden="true">.</span>
        </p>
        <div className="room-menu-container" ref={menuRef}>
          <button
            className="header-menu-button"
            type="button"
            aria-label="Open room menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="room-menu" role="menu">
              <button
                className="room-menu-danger"
                type="button"
                role="menuitem"
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  setMenuOpen(false);
                  onLeave();
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M10 5H6.75A2.75 2.75 0 0 0 4 7.75v8.5A2.75 2.75 0 0 0 6.75 19H10M14.5 8.5 18 12l-3.5 3.5M9 12h9" />
                </svg>
                {pendingAction === "leave" ? "Leaving..." : "Leave party"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="app-header-details">
        <p className="room-meta">
          Room <code>{inviteCode}</code>
          <span aria-hidden="true">·</span>
          {listenerLabel}
        </p>
        <span className={`sync-pill tone-${syncStatus.tone}`}>
          <span className="status-dot" aria-hidden="true" />
          {syncStatus.label}
        </span>
      </div>
    </header>
  );
}
