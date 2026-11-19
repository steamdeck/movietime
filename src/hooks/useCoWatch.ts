"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CoWatchState =
  | { status: "off" }
  | { status: "playing"; position: number; rate: number }
  | { status: "paused"; position: number };

export type CoWatchRole = "host" | "follower" | "off";

/**
 * Shared-clock co-watch. Both browsers load the same embed URL directly
 * (no re-encode, no host CPU cost). The host's play/pause/seek intents are
 * broadcast as data-only messages; each side shows a countdown/position
 * overlay and the humans press play on their own players at the count's end.
 *
 * This is deliberately NOT programmatic control: cross-origin players cannot
 * be driven, so the protocol synchronizes intent + a shared target position
 * and the users execute it. Drift stays within human reaction time (~0.5s),
 * which is fine for movies and infinitely smoother than screen share.
 */
export function useCoWatch(options: {
  sendSync: (message: object) => boolean;
  onNotice: (message: string | null) => void;
}) {
  const { sendSync, onNotice } = options;
  const [role, setRole] = useState<CoWatchRole>("off");
  const [state, setState] = useState<CoWatchState>({ status: "off" });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [peerState, setPeerState] = useState<CoWatchState>({ status: "off" });
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(null);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const broadcast = useCallback(
    (message: object) => {
      if (!sendSync(message)) {
        onNotice("Sync channel is not open — co-watch needs the Live connection.");
        return false;
      }
      return true;
    },
    [sendSync, onNotice]
  );

  const startHosting = useCallback(() => {
    clearTimer();
    setRole("host");
    setState({ status: "paused", position: 0 });
    broadcast({ type: "cowatch:seek", at: 0, t: Date.now() });
  }, [broadcast, clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    setRole("off");
    setState({ status: "off" });
    broadcast({ type: "cowatch:stop" });
  }, [broadcast, clearTimer]);

  const hostPlay = useCallback(
    (position: number) => {
      // 3-2-1 countdown, then both sides press play on their own players.
      setState({ status: "playing", position, rate: 1 });
      let remaining = 3;
      setCountdown(remaining);
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) {
          timerRef.current = null;
          setCountdown(null);
          broadcast({ type: "cowatch:start", at: position, t: Date.now() });
        } else {
          setCountdown(remaining);
          timerRef.current = window.setTimeout(tick, 1000);
        }
      };
      timerRef.current = window.setTimeout(tick, 1000);
    },
    [broadcast]
  );

  const hostPause = useCallback(
    (position: number) => {
      clearTimer();
      setState({ status: "paused", position });
      broadcast({ type: "cowatch:pause", at: position, t: Date.now() });
    },
    [broadcast, clearTimer]
  );

  const hostSeek = useCallback(
    (position: number) => {
      clearTimer();
      setState({ status: "paused", position });
      broadcast({ type: "cowatch:seek", at: position, t: Date.now() });
    },
    [broadcast, clearTimer]
  );

  const applyRemote = useCallback(
    (message: { type: string; at?: number }) => {
      if (message.type === "cowatch:stop") {
        clearTimer();
        setRole((r) => (r === "host" ? r : "off"));
        setPeerState({ status: "off" });
        return;
      }
      const at = typeof message.at === "number" ? message.at : 0;
      if (message.type === "cowatch:start") {
        setPeerState({ status: "playing", position: at, rate: 1 });
        // Follower counts down to the shared start.
        setRole((r) => (r === "host" ? r : "follower"));
        let remaining = 3;
        setCountdown(remaining);
        const tick = () => {
          remaining -= 1;
          if (remaining <= 0) {
            timerRef.current = null;
            setCountdown(null);
          } else {
            setCountdown(remaining);
            timerRef.current = window.setTimeout(tick, 1000);
          }
        };
        timerRef.current = window.setTimeout(tick, 1000);
        return;
      }
      if (message.type === "cowatch:pause") {
        clearTimer();
        setPeerState({ status: "paused", position: at });
        setRole((r) => (r === "host" ? r : "follower"));
        return;
      }
      if (message.type === "cowatch:seek") {
        clearTimer();
        setPeerState({ status: "paused", position: at });
        setRole((r) => (r === "host" ? r : "follower"));
      }
    },
    [clearTimer]
  );

  return {
    role,
    state: role === "host" ? state : peerState,
    countdown,
    startHosting,
    stop,
    hostPlay,
    hostPause,
    hostSeek,
    applyRemote,
  };
}

export function formatPosition(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
