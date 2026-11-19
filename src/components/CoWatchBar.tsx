"use client";

import { useState } from "react";
import { formatPosition, type CoWatchRole, type CoWatchState } from "@/hooks/useCoWatch";

export function CoWatchBar(props: {
  role: CoWatchRole;
  state: CoWatchState;
  countdown: number | null;
  embedActive: boolean;
  synced: boolean;
  playerTitle?: string | null;
  playerEp?: { season?: number; episode?: number } | null;
  onStart: () => void;
  onStop: () => void;
  onPlay: (position: number) => void;
  onPause: (position: number) => void;
  onSeek: (position: number) => void;
}) {
  const [draft, setDraft] = useState("0:00");
  const position =
    props.state.status === "off" ? 0 : props.state.position;

  function parseDraft(): number | null {
    const parts = draft.trim().split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 1) return parts[0];
    return null;
  }

  if (!props.embedActive) return null;

  return (
    <div className="border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">
          Co-watch
        </span>
        {props.state.status === "off" ? (
          <span className="text-xs text-[var(--muted)]">
            Same video, both browsers — no host load. One of you hosts the clock.
          </span>
        ) : (
          <span className="text-xs text-[var(--muted)]">
            {props.role === "host" ? "You host" : "They host"} ·{" "}
            {props.state.status === "playing" ? "playing" : "paused"} @{" "}
            {formatPosition(position)}
            {props.playerTitle ? (
              <span className="ml-2 text-[var(--fg)]">· {props.playerTitle}</span>
            ) : null}
            {props.playerEp &&
            (typeof props.playerEp.season === "number" ||
              typeof props.playerEp.episode === "number") ? (
              <span className="ml-1">
                S{props.playerEp.season ?? "?"} E{props.playerEp.episode ?? "?"}
              </span>
            ) : null}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {props.role === "off" ? (
            <button
              type="button"
              className="bar-btn on"
              disabled={!props.synced}
              title={props.synced ? "Host the shared clock" : "Needs the Live connection"}
              onClick={props.onStart}
            >
              Host co-watch
            </button>
          ) : (
            <>
              {props.role === "host" ? (
                <>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="m:ss"
                    aria-label="Position"
                    className="w-20 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs"
                  />
                  <button
                    type="button"
                    className="bar-btn"
                    onClick={() => {
                      const at = parseDraft();
                      if (at !== null) props.onSeek(at);
                    }}
                  >
                    Seek both to
                  </button>
                  <button
                    type="button"
                    className="bar-btn"
                    title="Tell both sides to jump back 10s (each person seeks their own player), then use 3-2-1 Play"
                    onClick={() => props.onSeek(Math.max(0, position - 10))}
                  >
                    −10s both
                  </button>
                  <button
                    type="button"
                    className="bar-btn"
                    title="Tell both sides to jump forward 10s (each person seeks their own player), then use 3-2-1 Play"
                    onClick={() => props.onSeek(position + 10)}
                  >
                    +10s both
                  </button>
                  <button
                    type="button"
                    className="bar-btn on"
                    onClick={() => {
                      const at = parseDraft() ?? position;
                      props.onPlay(at);
                    }}
                  >
                    3-2-1 Play
                  </button>
                  <button
                    type="button"
                    className="bar-btn"
                    onClick={() => props.onPause(position)}
                  >
                    Pause both
                  </button>
                </>
              ) : null}
              <button type="button" className="bar-btn" onClick={props.onStop}>
                Leave
              </button>
            </>
          )}
        </div>
      </div>
      {props.countdown !== null ? (
        <p className="mt-1 text-center text-2xl font-semibold text-[var(--gold)]">
          Press play in {props.countdown}…
        </p>
      ) : null}
    </div>
  );
}
