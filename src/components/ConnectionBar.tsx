"use client";

type ConnectionBarProps = {
  roomId: string;
  connectionState: string;
  synced: boolean;
  occupiedHint: string;
  sharing: boolean;
  controlGranted: boolean;
  controlHeld: boolean;
  controlRequested: boolean;
  onCopyInvite: () => void;
  copied: boolean;
  onToggleShare: () => void;
  onToggleControl: () => void;
  onRequestControl: () => void;
  onRespondControl: (grant: boolean) => void;
};

function pill(state: string, synced: boolean) {
  if (synced) return { label: "Live", full: "DataChannel open", tone: "ok" as const };
  if (state === "connecting" || state === "signaling" || state === "reconnecting") {
    return { label: "Connecting", full: state, tone: "wait" as const };
  }
  if (state === "connected") return { label: "Peer on", full: "Peer connected", tone: "wait" as const };
  if (state === "failed" || state === "disconnected") {
    return { label: state, full: state, tone: "bad" as const };
  }
  return { label: state, full: state, tone: "wait" as const };
}

export function ConnectionBar(props: ConnectionBarProps) {
  const status = pill(props.connectionState, props.synced);

  return (
    <div className="border-b border-[var(--line)] bg-[var(--panel)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <span className={`status-dot ${status.tone}`} />
        <p className="min-w-0 truncate text-sm">
          <span className="text-[var(--muted)]">Room</span>{" "}
          <code className="font-[family-name:var(--font-geist-mono)] text-[13px]">{props.roomId}</code>
        </p>
        <p className="hidden truncate text-sm text-[var(--muted)] sm:block" title={status.full}>
          {status.full}
        </p>
        <p className="text-sm text-[var(--muted)] sm:hidden">{status.label}</p>
        <p className="hidden truncate text-sm text-[var(--muted)] lg:block">{props.occupiedHint}</p>
        <button type="button" className="bar-btn ml-auto" onClick={props.onCopyInvite}>
          <span className="sm:hidden">{props.copied ? "Copied" : "Invite"}</span>
          <span className="hidden sm:inline">{props.copied ? "Invite copied" : "Copy invite"}</span>
        </button>
      </div>

      {props.controlRequested ? (
        <div className="flex items-center justify-between gap-3 bg-[var(--gold-soft)] px-3 py-2 text-sm text-[var(--gold)] sm:px-4">
          <span>They want control of your page</span>
          <div className="flex gap-2">
            <button type="button" className="bar-btn on" onClick={() => props.onRespondControl(true)}>
              Allow
            </button>
            <button type="button" className="bar-btn" onClick={() => props.onRespondControl(false)}>
              Deny
            </button>
          </div>
        </div>
      ) : null}

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2 sm:flex-wrap sm:px-4 sm:pb-3">
        <button type="button" className="bar-btn" onClick={props.onRequestControl} disabled={props.controlHeld}>
          <span className="sm:hidden">{props.controlHeld ? "You control" : "Control"}</span>
          <span className="hidden sm:inline">
            {props.controlHeld ? "You can control their page" : "Request control"}
          </span>
        </button>
        <button type="button" className={`bar-btn ${props.controlGranted ? "on" : ""}`} onClick={props.onToggleControl}>
          <span className="sm:hidden">{props.controlGranted ? "Revoke" : "Give control"}</span>
          <span className="hidden sm:inline">
            {props.controlGranted ? "Revoke their control" : "Allow them to control"}
          </span>
        </button>
        <button type="button" className={`bar-btn ${props.sharing ? "danger" : ""}`} onClick={props.onToggleShare}>
          <span className="sm:hidden">{props.sharing ? "Stop share" : "Share"}</span>
          <span className="hidden sm:inline">{props.sharing ? "Stop sharing" : "Screen share"}</span>
        </button>
      </div>
    </div>
  );
}
