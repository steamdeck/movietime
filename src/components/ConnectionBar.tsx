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
  if (synced) return { label: "DataChannel open", tone: "ok" as const };
  if (state === "connecting" || state === "signaling" || state === "reconnecting") {
    return { label: state, tone: "wait" as const };
  }
  if (state === "connected") return { label: "Peer connected", tone: "wait" as const };
  if (state === "failed" || state === "disconnected") return { label: state, tone: "bad" as const };
  return { label: state, tone: "wait" as const };
}

export function ConnectionBar(props: ConnectionBarProps) {
  const status = pill(props.connectionState, props.synced);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
      <div className="mr-auto flex min-w-0 flex-wrap items-center gap-3">
        <span className={`status-dot ${status.tone}`} />
        <p className="text-sm">
          <span className="text-[var(--muted)]">Room</span>{" "}
          <code className="font-[family-name:var(--font-geist-mono)] text-[13px]">{props.roomId}</code>
        </p>
        <span className="hidden text-[var(--line-strong)] sm:inline">/</span>
        <p className="text-sm text-[var(--muted)]">{status.label}</p>
        <p className="text-sm text-[var(--muted)]">{props.occupiedHint}</p>
        <p className="text-sm text-[var(--muted)]">
          Sync {props.synced ? "live" : "waiting"}
        </p>
      </div>

      {props.controlRequested ? (
        <div className="flex items-center gap-2 rounded-full bg-[var(--gold-soft)] px-3 py-1 text-xs text-[var(--gold)]">
          Control requested
          <button type="button" className="underline" onClick={() => props.onRespondControl(true)}>
            Allow
          </button>
          <button type="button" className="underline" onClick={() => props.onRespondControl(false)}>
            Deny
          </button>
        </div>
      ) : null}

      <button type="button" className="bar-btn" onClick={props.onCopyInvite}>
        {props.copied ? "Invite copied" : "Copy invite"}
      </button>
      <button type="button" className="bar-btn" onClick={props.onRequestControl} disabled={props.controlHeld}>
        {props.controlHeld ? "You can control their page" : "Request control"}
      </button>
      <button type="button" className={`bar-btn ${props.controlGranted ? "on" : ""}`} onClick={props.onToggleControl}>
        {props.controlGranted ? "Revoke their control" : "Allow them to control"}
      </button>
      <button type="button" className={`bar-btn ${props.sharing ? "danger" : ""}`} onClick={props.onToggleShare}>
        {props.sharing ? "Stop sharing" : "Screen share"}
      </button>
    </div>
  );
}
