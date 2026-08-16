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
};

type BrowserPaneProps = {
  title: string;
  caption: string;
  local: boolean;
  urlValue?: string;
  onUrlChange?: (value: string) => void;
  onOpen?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  onReload?: () => void;
  canBack?: boolean;
  canForward?: boolean;
  navigationId: string | null;
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
  onBack,
  onForward,
  onReload,
  canBack,
  canForward,
  navigationId,
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
      iframeRef.current?.contentWindow?.postMessage({ ns: "movietime", ...data }, "*");
    };
    return () => {
      postToFrameRef.current = null;
    };
  }, [postToFrameRef, navigationId, reloadToken]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border border-[var(--line)] bg-[var(--panel)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
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

      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
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
          <form onSubmit={submit} className="flex min-w-0 flex-1 gap-2">
            <input
              value={urlValue}
              onChange={(e) => onUrlChange?.(e.target.value)}
              placeholder="Enter a private URL"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="url-input"
              aria-label="Private URL"
            />
            <button type="submit" className="open-btn">
              Open
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
          <iframe
            ref={iframeRef}
            key={`${navigationId}:${reloadToken}`}
            title={local ? "Your page" : "Other person's page"}
            src={`/api/view/${navigationId}`}
            className="absolute inset-0 h-full w-full bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            referrerPolicy="no-referrer"
            allow="fullscreen"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center px-8 text-center">
            <p className="max-w-sm text-[var(--muted)]">
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
