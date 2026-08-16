"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/protocol";

type Session =
  | { status: "loading" }
  | { status: "ready"; token: string; role: Role; occupied: number }
  | { status: "full" }
  | { status: "missing" }
  | { status: "error"; message: string };

function tokenKey(roomId: string) {
  return `mt:${roomId}:token`;
}

export function useRoomJoin(roomId: string): Session {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const token = sessionStorage.getItem(tokenKey(roomId)) || undefined;

    (async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.status === 404) {
          setSession({ status: "missing" });
          return;
        }
        if (res.status === 409) {
          setSession({ status: "full" });
          return;
        }
        if (!res.ok) {
          setSession({ status: "error", message: data.error || "Could not join room" });
          return;
        }
        sessionStorage.setItem(tokenKey(roomId), data.token);
        setSession({
          status: "ready",
          token: data.token,
          role: data.role,
          occupied: data.occupied,
        });
      } catch {
        if (!cancelled) setSession({ status: "error", message: "Could not join room" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return session;
}

export async function createRoom(): Promise<{ roomId: string; token: string; role: Role }> {
  const res = await fetch("/api/rooms", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not create room");
  sessionStorage.setItem(tokenKey(data.roomId), data.token);
  return data;
}
