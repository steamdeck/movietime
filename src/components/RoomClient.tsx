"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserPane, type FrameEvent } from "@/components/BrowserPane";
import { ConnectionBar } from "@/components/ConnectionBar";
import { usePeerSession } from "@/hooks/usePeerSession";
import { useRoomJoin } from "@/hooks/useRoomJoin";
import type { SyncMessage } from "@/lib/protocol";

type HistoryEntry = { navigationId: string; url?: string };

export function RoomClient({ roomId }: { roomId: string }) {
  const session = useRoomJoin(roomId);
  const token = session.status === "ready" ? session.token : null;
  const role = session.status === "ready" ? session.role : null;

  const [urlValue, setUrlValue] = useState("");
  const [localHistory, setLocalHistory] = useState<HistoryEntry[]>([]);
  const [localIndex, setLocalIndex] = useState(-1);
  const [localReload, setLocalReload] = useState(0);
  const [remoteNavId, setRemoteNavId] = useState<string | null>(null);
  const [remoteReload, setRemoteReload] = useState(0);
  const [copied, setCopied] = useState(false);
  const [controlGranted, setControlGranted] = useState(false);
  const [controlHeld, setControlHeld] = useState(false);
  const [controlRequested, setControlRequested] = useState(false);
  const [peerSharing, setPeerSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const applyingLocal = useRef(false);
  const applyingRemote = useRef(false);
  const postLocal = useRef<((data: object) => void) | null>(null);
  const postRemote = useRef<((data: object) => void) | null>(null);

  const localNavId = localIndex >= 0 ? localHistory[localIndex]?.navigationId ?? null : null;

  const onSyncMessage = useCallback((message: SyncMessage) => {
    if (message.type === "navigate") {
      applyingRemote.current = true;
      setRemoteNavId(message.navigationId);
      setTimeout(() => {
        applyingRemote.current = false;
      }, 250);
      return;
    }
    if (message.type === "history") {
      applyingRemote.current = true;
      if (message.action === "reload") setRemoteReload((n) => n + 1);
      if (message.navigationId) setRemoteNavId(message.navigationId);
      setTimeout(() => {
        applyingRemote.current = false;
      }, 250);
      return;
    }
    if (message.type === "scroll") {
      const target = message.control ? postLocal : postRemote;
      const flag = message.control ? applyingLocal : applyingRemote;
      if (message.control && !controlGranted) return;
      flag.current = true;
      target.current?.({ type: "scroll", x: message.x, y: message.y });
      setTimeout(() => {
        flag.current = false;
      }, 120);
      return;
    }
    if (message.type.startsWith("video:")) {
      const target = message.type && "control" in message && message.control ? postLocal : postRemote;
      const flag = "control" in message && message.control ? applyingLocal : applyingRemote;
      if ("control" in message && message.control && !controlGranted) return;
      flag.current = true;
      target.current?.({
        type: message.type,
        position: "position" in message ? message.position : 0,
        rate: message.type === "video:rate" ? message.rate : undefined,
        timestamp: "timestamp" in message ? message.timestamp : Date.now(),
      });
      setTimeout(() => {
        flag.current = false;
      }, 120);
      return;
    }
    if (message.type === "control:request") setControlRequested(true);
    if (message.type === "control:grant") setControlHeld(true);
    if (message.type === "control:deny") setControlHeld(false);
    if (message.type === "control:revoke") setControlHeld(false);
    if (message.type === "screenshare:start") setPeerSharing(true);
    if (message.type === "screenshare:stop") setPeerSharing(false);
  }, [controlGranted]);

  const peer = usePeerSession({
    roomId,
    role,
    enabled: session.status === "ready",
    onSyncMessage,
  });

  const { sendSync, synced } = peer;

  useEffect(() => {
    if (!synced) return;
    const id = window.setInterval(() => {
      sendSync({ type: "ping", t: Date.now() });
    }, 8000);
    return () => window.clearInterval(id);
  }, [sendSync, synced]);

  const occupiedHint = useMemo(() => {
    if (session.status !== "ready") return "Joining…";
    return role === "a" ? "You created this room" : "You joined as the second person";
  }, [role, session.status]);

  async function openUrl(raw: string) {
    if (!token || busy) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    setBusy(true);
    setNotice(null);
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const res = await fetch("/api/navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, url: withProtocol, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error || "Could not open that page.");
        return;
      }
      const entry: HistoryEntry = { navigationId: data.navigationId, url: withProtocol };
      setLocalHistory((history) => [...history.slice(0, localIndex + 1), entry]);
      setLocalIndex((index) => index + 1);
      peer.sendSync({ type: "navigate", navigationId: data.navigationId });
    } catch {
      setNotice("Could not open that page.");
    } finally {
      setBusy(false);
    }
  }

  function goHistory(direction: -1 | 1) {
    const next = localIndex + direction;
    const entry = localHistory[next];
    if (!entry) return;
    setLocalIndex(next);
    if (entry.url) setUrlValue(entry.url);
    peer.sendSync({
      type: "history",
      action: direction < 0 ? "back" : "forward",
      navigationId: entry.navigationId,
    });
  }

  function reload() {
    if (!localNavId) return;
    setLocalReload((n) => n + 1);
    peer.sendSync({ type: "history", action: "reload", navigationId: localNavId });
  }

  function onLocalFrame(event: FrameEvent) {
    if (event.type === "navigate" && event.navigationId && !applyingLocal.current) {
      setLocalHistory((history) => [...history.slice(0, localIndex + 1), { navigationId: event.navigationId! }]);
      setLocalIndex((index) => index + 1);
      peer.sendSync({ type: "navigate", navigationId: event.navigationId });
      return;
    }
    if (event.type === "scroll" && !applyingLocal.current) {
      peer.sendSync({
        type: "scroll",
        x: event.x || 0,
        y: event.y || 0,
        timestamp: event.timestamp || Date.now(),
      });
    }
    if (event.type?.startsWith("video:") && !applyingLocal.current) {
      const type = event.type as "video:play" | "video:pause" | "video:seek" | "video:rate";
      peer.sendSync({
        type,
        position: event.position || 0,
        timestamp: event.timestamp || Date.now(),
        ...(type === "video:rate" ? { rate: event.rate || 1 } : {}),
      } as SyncMessage);
    }
  }

  function onRemoteFrame(event: FrameEvent) {
    if (!controlHeld) return;
    if (event.type === "scroll" && !applyingRemote.current) {
      peer.sendSync({
        type: "scroll",
        x: event.x || 0,
        y: event.y || 0,
        timestamp: event.timestamp || Date.now(),
        control: true,
      });
    }
    if (event.type?.startsWith("video:") && !applyingRemote.current) {
      const type = event.type as "video:play" | "video:pause" | "video:seek" | "video:rate";
      peer.sendSync({
        type,
        position: event.position || 0,
        timestamp: event.timestamp || Date.now(),
        control: true,
        ...(type === "video:rate" ? { rate: event.rate || 1 } : {}),
      } as SyncMessage);
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function toggleShare() {
    try {
      if (peer.sharing) peer.stopScreenShare();
      else await peer.startScreenShare();
    } catch {
      setNotice("Screen sharing was not started. The browser permission prompt must be accepted.");
    }
  }

  if (session.status === "loading") {
    return <Centered message="Joining the private room…" />;
  }
  if (session.status === "missing") {
    return <Centered message="This room does not exist or has expired." href="/" />;
  }
  if (session.status === "full") {
    return <Centered message="This room already has two people." href="/" />;
  }
  if (session.status === "error") {
    return <Centered message={session.message} href="/" />;
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <ConnectionBar
        roomId={roomId}
        connectionState={peer.connectionState}
        synced={peer.synced}
        occupiedHint={occupiedHint}
        sharing={peer.sharing}
        controlGranted={controlGranted}
        controlHeld={controlHeld}
        controlRequested={controlRequested}
        onCopyInvite={copyInvite}
        copied={copied}
        onToggleShare={toggleShare}
        onToggleControl={() => {
          const next = !controlGranted;
          setControlGranted(next);
          peer.sendSync({ type: next ? "control:grant" : "control:revoke" });
        }}
        onRequestControl={() => peer.sendSync({ type: "control:request" })}
        onRespondControl={(grant) => {
          setControlRequested(false);
          setControlGranted(grant);
          peer.sendSync({ type: grant ? "control:grant" : "control:deny" });
        }}
      />

      {notice ? (
        <p className="border-b border-[var(--line)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {notice}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <BrowserPane
          title="You"
          caption="Your URL stays on this device."
          local
          urlValue={urlValue}
          onUrlChange={setUrlValue}
          onOpen={() => openUrl(urlValue)}
          onBack={() => goHistory(-1)}
          onForward={() => goHistory(1)}
          onReload={reload}
          canBack={localIndex > 0}
          canForward={localIndex >= 0 && localIndex < localHistory.length - 1}
          navigationId={localNavId}
          reloadToken={localReload}
          onFrameEvent={onLocalFrame}
          postToFrameRef={postLocal}
          sharingLabel={peer.sharing ? "Screen sharing active" : null}
        />
        <BrowserPane
          title="Other person"
          caption="Their address is never shown here."
          local={false}
          navigationId={remoteNavId}
          reloadToken={remoteReload}
          onFrameEvent={onRemoteFrame}
          postToFrameRef={postRemote}
          screenStream={peer.remoteStream}
          sharingLabel={peerSharing ? "Screen sharing active" : null}
        />
      </div>

      <footer className="border-t border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
        Pages are fetched by this app’s server so the other person never receives the raw URL.
        Sites that block fetching still require explicit screen sharing. Browser security rules
        are not bypassed.
      </footer>
    </div>
  );
}

function Centered({ message, href }: { message: string; href?: string }) {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--bg)] px-6 text-center text-[var(--fg)]">
      <div>
        <p className="text-lg">{message}</p>
        {href ? (
          <a href={href} className="mt-4 inline-block text-sm text-[var(--gold)] underline">
            Back to start
          </a>
        ) : null}
      </div>
    </div>
  );
}
