"use client";

import { FormEvent, useEffect, useRef } from "react";

export type FrameEvent = {
  type: string;
  navigationId?: string;
  x?: number;
  y?: number;
  timestamp?: number;
  position?: number;
  rate?: number;
  scroll?: boolean;
  video?: boolean;
  // Vendor embed events (vidsrc landing relay): display-only, allowlisted.
  vendor?: string;
  etype?: string;
  title?: string;
  season?: number;
  episode?: number;
  visible?: boolean;
};

type BrowserPaneProps = {
  title: string;
  caption: string;
  local: boolean;
  urlValue?: string;
  onUrlChange?: (value: string) => void;
  onOpen?: () => void;
  onEmbed?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  onReload?: () => void;
  canBack?: boolean;
  canForward?: boolean;
  navigationId: string | null;
  /** Embed navigations render UNSANDBOXED: hardened video players refuse
   *  sandboxed frames. Isolation comes from the cross-origin boundary. */
  embed?: boolean;
  reloadToken: number;
  onFrameEvent?: (event: FrameEvent) => void;
  postToFrameRef?: React.MutableRefObject<((data: object) => void) | null>;
  screenStream?: MediaStream | null;
  sharingLabel?: string | null;
};

export function BrowserPane({
  title,
  caption,
  local,
  urlValue,
  onUrlChange,
  onOpen,
  onEmbed,
  onBack,
  onForward,
  onReload,
  canBack,
  canForward,
  navigationId,
  embed,
  reloadToken,
  onFrameEvent,
  postToFrameRef,
  screenStream,
  sharingLabel,
}: BrowserPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFrameEventRef = useRef(onFrameEvent);
  onFrameEventRef.current = onFrameEvent;

  useEffect(() => {
    if (!postToFrameRef) return;
    postToFrameRef.current = (data: object) => {
      // Sandboxed opaque-origin frame: any fixed origin would be wrong.
      // The BrowserPane always talks to its own iframe, so targetOrigin "*"
      // is safe here (the page cannot see these messages' contents anyway,
      // and the DOM/shim only acts on "movietime"-namespaced payloads).
      iframeRef.current?.contentWindow?.postMessage({ ns: "movietime", ...data }, "*");
    };
    return () => {
      postToFrameRef.current = null;
    };
  }, [postToFrameRef, navigationId, reloadToken]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Our proxied page runs in a sandboxed, opaque-origin frame, so its
      // messages arrive with origin "null". The source check below is the
      // real authentication: only our direct iframe may drive the shell.
      // Anything else (nested ad/tracker frames, stray senders) is ignored.
      if (event.origin !== window.location.origin && event.origin !== "null") return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as FrameEvent & { ns?: string };
      if (!data || data.ns !== "movietime") return;
      if (navigationId && data.navigationId && data.navigationId !== navigationId) return;
      onFrameEventRef.current?.(data);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigationId]);

  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onOpen?.();
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border-[var(--line)] bg-[var(--panel)] max-lg:border-0 lg:border">
      <header className="hidden items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 lg:flex">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{caption}</p>
        </div>
        {sharingLabel ? (
          <span className="rounded-full bg-[var(--danger-soft)] px-3 py-1 text-xs text-[var(--danger)]">
            {sharingLabel}
          </span>
        ) : null}
      </header>

      {sharingLabel ? (
        <p className="border-b border-[var(--line)] bg-[var(--danger-soft)] px-3 py-1.5 text-xs text-[var(--danger)] lg:hidden">
          {sharingLabel}
        </p>
      ) : null}

      <div className="flex items-center gap-1.5 border-b border-[var(--line)] px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
        {navigationId ? (
          <span
            className="hidden max-w-44 shrink-0 truncate font-mono text-[10px] text-[var(--muted)] sm:block"
            title={`view ${navigationId} · ${embed ? "embed" : "page"}`}
          >
            {navigationId.slice(0, 8)}·{embed ? "embed" : "page"}
          </span>
        ) : null}
        <button type="button" className="nav-btn" onClick={onBack} disabled={!local || !canBack} aria-label="Back">
          ←
        </button>
        <button
          type="button"
          className="nav-btn"
          onClick={onForward}
          disabled={!local || !canForward}
          aria-label="Forward"
        >
          →
        </button>
        <button type="button" className="nav-btn" onClick={onReload} disabled={!local || !navigationId} aria-label="Reload">
          ↻
        </button>
        {local ? (
          <form onSubmit={submit} className="flex min-w-0 flex-1 gap-1.5 sm:gap-2">
            <input
              value={urlValue}
              onChange={(e) => onUrlChange?.(e.target.value)}
              placeholder="Private URL"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              enterKeyHint="go"
              inputMode="url"
              className="url-input"
              aria-label="Private URL"
            />
            <button type="submit" className="open-btn">
              Open
            </button>
            <button
              type="button"
              className="open-btn"
              title="Embed directly: for video/bot-protected pages. Loads in both browsers without server fetching."
              onClick={onEmbed}
            >
              Embed
            </button>
          </form>
        ) : (
          <div className="url-input flex-1 cursor-default text-[var(--muted)]">
            URL kept private
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        {navigationId ? (
          embed ? (
            <iframe
              ref={iframeRef}
              key={`${navigationId}:${reloadToken}`}
              title={local ? "Your page" : "Other person's page"}
              src={`/api/view/${navigationId}`}
              className="absolute inset-0 h-full w-full bg-black"
              referrerPolicy="no-referrer"
              allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
            />
          ) : (
            <iframe
              ref={iframeRef}
              key={`${navigationId}:${reloadToken}`}
              title={local ? "Your page" : "Other person's page"}
              src={`/api/view/${navigationId}`}
              className="absolute inset-0 h-full w-full bg-white"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-forms allow-popups"
              allow="fullscreen"
            />
          )
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center sm:px-8">
            <p className="max-w-sm text-sm text-[var(--muted)] sm:text-base">
              {local
                ? "Enter a URL to open a page. The other person will see the page, not the address."
                : "Waiting for the other person to open a page."}
            </p>
          </div>
        )}

        {screenStream ? (
          <video
            ref={videoRef}
            className="absolute inset-0 z-10 h-full w-full bg-black object-contain"
            autoPlay
            playsInline
          />
        ) : null}
      </div>
    </section>
  );
}
