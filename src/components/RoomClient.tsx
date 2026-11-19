"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BrowserPane, type FrameEvent } from "@/components/BrowserPane";
import { ConnectionBar } from "@/components/ConnectionBar";
import { CoWatchBar } from "@/components/CoWatchBar";
import { usePeerSession } from "@/hooks/usePeerSession";
import { useCoWatch } from "@/hooks/useCoWatch";
import { useRoomJoin } from "@/hooks/useRoomJoin";
import type { SyncMessage } from "@/lib/protocol";

type HistoryEntry = { navigationId: string; url?: string; kind: "page" | "embed" };

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
  const [mobilePane, setMobilePane] = useState<"you" | "them">("you");

  const applyingLocal = useRef(false);
  const applyingRemote = useRef(false);
  const postLocal = useRef<((data: object) => void) | null>(null);
  const postRemote = useRef<((data: object) => void) | null>(null);

  const localNavId = localIndex >= 0 ? localHistory[localIndex]?.navigationId ?? null : null;
  const localNavKind: "page" | "embed" =
    localIndex >= 0 ? localHistory[localIndex]?.kind ?? "page" : "page";
  const [remoteNavKind, setRemoteNavKind] = useState<"page" | "embed">("page");
  const [localSync, setLocalSync] = useState<{ scroll: boolean; video: boolean } | null>(null);
  const [remoteSync, setRemoteSync] = useState<{ scroll: boolean; video: boolean } | null>(null);
  const [playerTitle, setPlayerTitle] = useState<string | null>(null);
  const [playerEp, setPlayerEp] = useState<{ season?: number; episode?: number } | null>(null);
  const coWatch = useCoWatch({
    sendSync: (message) => peerRef.current?.sendSync(message as SyncMessage) ?? false,
    onNotice: setNotice,
  });
  const coWatchRef = useRef(coWatch);
  coWatchRef.current = coWatch;

  const onSyncMessage = useCallback((message: SyncMessage) => {
    if (message.type === "sync:state") {
      setRemoteSync({ scroll: message.scroll, video: message.video });
      return;
    }
    if (message.type === "embed:event") {
      // Vendor display state from the peer's player landing (title/episode).
      // Display only — the local wrapper already shows its own copy.
      if (message.vendor !== "vidsrc") return;
      if (
        message.navigationId &&
        remoteNavId &&
        message.navigationId !== remoteNavId
      ) {
        return;
      }
      if (
        (message.etype === "PLAYER_TITLE" || message.etype === "MEDIA_NOT_FOUND") &&
        typeof message.title === "string"
      ) {
        setPlayerTitle(message.title.slice(0, 200));
      }
      if (
        (message.etype === "TV_INFO" || message.etype === "TV_STATE") &&
        (typeof message.season === "number" || typeof message.episode === "number")
      ) {
        setPlayerEp({ season: message.season, episode: message.episode });
      }
      return;
    }
    if (
      message.type === "cowatch:start" ||
      message.type === "cowatch:pause" ||
      message.type === "cowatch:seek" ||
      message.type === "cowatch:stop"
    ) {
      coWatchRef.current.applyRemote(message);
      return;
    }
    if (message.type === "ping") {
      peerRef.current?.sendSync({ type: "pong", t: message.t });
      return;
    }
    if (message.type === "pong") return;
    if (message.type === "navigate") {
      applyingRemote.current = true;
      setRemoteNavId(message.navigationId);
      setRemoteNavKind("kind" in message && message.kind === "embed" ? "embed" : "page");
      setTimeout(() => {
        applyingRemote.current = false;
      }, 250);
      return;
    }
    if (message.type === "history") {
      applyingRemote.current = true;
      if (message.action === "reload") setRemoteReload((n) => n + 1);
      if (message.navigationId) {
        setRemoteNavId(message.navigationId);
        setRemoteNavKind("kind" in message && message.kind === "embed" ? "embed" : "page");
      }
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
  const peerRef = useRef(peer);
  peerRef.current = peer;

  const { sendSync, synced } = peer;

  useEffect(() => {
    if (!synced) return;
    const id = window.setInterval(() => {
      sendSync({ type: "ping", t: Date.now() });
    }, 15000);
    return () => window.clearInterval(id);
  }, [sendSync, synced]);

  useEffect(() => {
    if (!synced || !token) return;
    setLocalHistory((history) => {
      if (!history.length) return history;
      for (const entry of history) {
        peer.sendSync({
          type: "navigate",
          navigationId: entry.navigationId,
          kind: entry.kind ?? "page",
        });
      }
      return history;
    });
    // Resync our latest page when the DataChannel (re)opens: messages sent
    // while closed are dropped by sendSync (it returns false), so the joiner
    // or a reconnecting peer would otherwise stay on a blank pane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced]);

  const occupiedHint = useMemo(() => {
    if (session.status !== "ready") return "Joining…";
    return role === "a" ? "You created this room" : "You joined as the second person";
  }, [role, session.status]);

  useEffect(() => {
    if (peerSharing) setMobilePane("them");
  }, [peerSharing]);

  function notifySyncDropped() {
    setNotice("Sync channel is not open yet — your peer will catch up when it connects.");
  }

  async function openUrl(raw: string, mode: "page" | "embed" = "page") {
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
        body: JSON.stringify({ roomId, url: withProtocol, token, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(
          (data.error || "Could not open that page.") +
            (data.hint ? ` ${data.hint}` : "")
        );
        return;
      }
      const entry: HistoryEntry = {
        navigationId: data.navigationId,
        url: withProtocol,
        kind: data.mode === "embed" ? "embed" : "page",
      };
      setLocalHistory((history) => [...history.slice(0, localIndex + 1), entry]);
      setLocalIndex((index) => index + 1);
      if (
        !peer.sendSync({
          type: "navigate",
          navigationId: data.navigationId,
          kind: entry.kind,
        })
      ) {
        notifySyncDropped();
      }
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
    if (
      !peer.sendSync({
        type: "history",
        action: direction < 0 ? "back" : "forward",
        navigationId: entry.navigationId,
        kind: entry.kind,
      })
    ) {
      notifySyncDropped();
    }
  }

  function reload() {
    if (!localNavId) return;
    setLocalReload((n) => n + 1);
    if (
      !peer.sendSync({
        type: "history",
        action: "reload",
        navigationId: localNavId,
        kind: localNavKind,
      })
    ) {
      notifySyncDropped();
    }
  }

  function onLocalFrame(event: FrameEvent) {
    if (event.type === "sync:state" && !applyingLocal.current) {
      setLocalSync({
        scroll: event.scroll ?? false,
        video: event.video ?? false,
      });
      return;
    }
    if (event.type === "embed:event" && !applyingLocal.current) {
      // Our own player's display state: show it AND forward to the peer so
      // their CoWatchBar reads the same title/episode. Allowlisted only —
      // parseSyncMessage enforces the vendor/etype shape on receipt.
      if (event.vendor !== "vidsrc") return;
      if (typeof event.title === "string") setPlayerTitle(event.title.slice(0, 200));
      if (
        event.etype === "TV_INFO" ||
        event.etype === "TV_STATE" ||
        typeof event.season === "number" ||
        typeof event.episode === "number"
      ) {
        setPlayerEp({ season: event.season, episode: event.episode });
      }
      peer.sendSync({
        type: "embed:event",
        vendor: "vidsrc",
        etype: (event.etype || "PLAYER_TITLE") as
          | "PLAYER_TITLE"
          | "TV_INFO"
          | "TV_STATE"
          | "PLAYER_UI"
          | "MEDIA_NOT_FOUND"
          | "VS_EXPIRED"
          | "VS_DEVTOOLS",
        navigationId: localNavId ?? undefined,
        ...(typeof event.title === "string" ? { title: event.title.slice(0, 200) } : {}),
        ...(typeof event.season === "number" ? { season: event.season } : {}),
        ...(typeof event.episode === "number" ? { episode: event.episode } : {}),
        ...(typeof event.visible === "boolean" ? { visible: event.visible } : {}),
      });
      return;
    }
    if (event.type === "navigate" && event.navigationId && !applyingLocal.current) {
      setLocalHistory((history) => [
        ...history.slice(0, localIndex + 1),
        { navigationId: event.navigationId!, kind: "page" as const },
      ]);
      setLocalIndex((index) => index + 1);
      peer.sendSync({
        type: "navigate",
        navigationId: event.navigationId,
        kind: "page",
      });
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
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-[var(--bg)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-[var(--fg)]">
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
        <p className="border-b border-[var(--line)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)] sm:px-4">
          {notice}
        </p>
      ) : null}

      {synced ? (
        <SyncStatus local={localSync} remote={remoteSync} remoteKind={remoteNavKind} />
      ) : null}

      <CoWatchBar
        role={coWatch.role}
        state={coWatch.state}
        countdown={coWatch.countdown}
        embedActive={localNavKind === "embed" || remoteNavKind === "embed"}
        synced={synced}
        playerTitle={playerTitle}
        playerEp={playerEp}
        onStart={coWatch.startHosting}
        onStop={coWatch.stop}
        onPlay={coWatch.hostPlay}
        onPause={coWatch.hostPause}
        onSeek={coWatch.hostSeek}
      />

      <div
        className="grid grid-cols-2 border-b border-[var(--line)] bg-[var(--panel)] lg:hidden"
        role="tablist"
        aria-label="Whose page to show"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "you"}
          className={`min-h-11 px-3 text-sm ${
            mobilePane === "you"
              ? "border-b-2 border-[var(--gold)] text-[var(--gold)]"
              : "text-[var(--muted)]"
          }`}
          onClick={() => setMobilePane("you")}
        >
          You
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "them"}
          className={`relative min-h-11 px-3 text-sm ${
            mobilePane === "them"
              ? "border-b-2 border-[var(--gold)] text-[var(--gold)]"
              : "text-[var(--muted)]"
          }`}
          onClick={() => setMobilePane("them")}
        >
          Other person
          {remoteNavId || peerSharing ? (
            <span className="absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[var(--gold)]" />
          ) : null}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 lg:flex">
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col max-lg:absolute max-lg:inset-0 ${
            mobilePane === "you" ? "z-10" : "z-0 max-lg:invisible max-lg:pointer-events-none"
          }`}
        >
          <BrowserPane
            title="You"
            caption="Your URL stays on this device."
            local
            urlValue={urlValue}
            onUrlChange={setUrlValue}
            onOpen={() => openUrl(urlValue)}
            onEmbed={() => openUrl(urlValue, "embed")}
            onBack={() => goHistory(-1)}
            onForward={() => goHistory(1)}
            onReload={reload}
            canBack={localIndex > 0}
            canForward={localIndex >= 0 && localIndex < localHistory.length - 1}
            navigationId={localNavId}
            embed={localNavKind === "embed"}
            reloadToken={localReload}
            onFrameEvent={onLocalFrame}
            postToFrameRef={postLocal}
            sharingLabel={peer.sharing ? "Screen sharing active" : null}
          />
        </div>
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col max-lg:absolute max-lg:inset-0 ${
            mobilePane === "them" ? "z-10" : "z-0 max-lg:invisible max-lg:pointer-events-none"
          }`}
        >
          <BrowserPane
            title="Other person"
            caption="Their address is never shown here."
            local={false}
            navigationId={remoteNavId}
            embed={remoteNavKind === "embed"}
            reloadToken={remoteReload}
            onFrameEvent={onRemoteFrame}
            postToFrameRef={postRemote}
            screenStream={peer.remoteStream}
            sharingLabel={peerSharing ? "Screen sharing active" : null}
          />
        </div>
      </div>

      <footer className="hidden border-t border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)] lg:block">
        Pages are fetched by this app’s server so the other person never receives the raw URL.
        Sites that block fetching still require explicit screen sharing. Browser security rules
        are not bypassed.
      </footer>
    </div>
  );
}

function SyncStatus({
  local,
  remote,
  remoteKind,
}: {
  local: { scroll: boolean; video: boolean } | null;
  remote: { scroll: boolean; video: boolean } | null;
  remoteKind: "page" | "embed";
}) {
  function dot(ok: boolean | null, label: string) {
    const tone =
      ok === null ? "bg-[var(--muted)]" : ok ? "bg-emerald-400" : "bg-[var(--danger)]";
    return (
      <span className="inline-flex items-center gap-1.5" title={label}>
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--muted)] sm:px-4">
      <span className="uppercase tracking-[0.18em] text-[var(--gold)]">Sync</span>
      <span className="inline-flex items-center gap-1.5">
        you {dot(local?.scroll ?? null, "scroll")} {dot(local?.video ?? null, "video")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        them {dot(remote?.scroll ?? null, "scroll")} {dot(remote?.video ?? null, "video")}
      </span>
      {remoteKind === "embed" ? (
        <span title="Embeds load directly in each browser; playback cannot be observed or driven.">
          embeds: independent playback
        </span>
      ) : null}
      {local && !local.scroll ? (
        <span title="This page has nothing to scroll, so scroll sync has nothing to do.">
          page not scrollable
        </span>
      ) : null}
    </div>
  );
}

function Centered({ message, href }: { message: string; href?: string }) {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--bg)] px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center text-[var(--fg)]">
      <div>
        <p className="text-lg leading-snug">{message}</p>
        {href ? (
          <Link href={href} className="mt-5 inline-flex min-h-11 items-center text-sm text-[var(--gold)] underline">
            Back to start
          </Link>
        ) : null}
      </div>
    </div>
  );
}
