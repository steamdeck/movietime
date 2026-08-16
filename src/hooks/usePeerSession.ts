"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers } from "@/lib/ice";
import type { Role, SignalEnvelope, SyncMessage } from "@/lib/protocol";
import { parseSyncMessage } from "@/lib/protocol";
import { SignalingClient } from "@/lib/signaling-client";

type ConnectionState = RTCPeerConnectionState | "signaling" | "reconnecting";

export function usePeerSession(options: {
  roomId: string;
  role: Role | null;
  enabled: boolean;
  onSyncMessage: (message: SyncMessage) => void;
}) {
  const { roomId, role, enabled, onSyncMessage } = options;
  const [connectionState, setConnectionState] = useState<ConnectionState>("new");
  const [channelState, setChannelState] = useState<RTCDataChannelState | "unavailable">(
    "unavailable"
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const localShareRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const onSyncRef = useRef(onSyncMessage);
  onSyncRef.current = onSyncMessage;

  const attachChannel = useCallback((channel: RTCDataChannel) => {
    dcRef.current = channel;
    channel.onopen = () => setChannelState(channel.readyState);
    channel.onclose = () => setChannelState(channel.readyState);
    channel.onerror = () => setChannelState(channel.readyState);
    channel.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message = parseSyncMessage(event.data);
      if (message) onSyncRef.current(message);
    };
    setChannelState(channel.readyState);
  }, []);

  const createPeer = useCallback(async () => {
    pcRef.current?.close();
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    pcRef.current = pc;
    setConnectionState(pc.connectionState || "new");

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
        setConnectionState("reconnecting");
      }
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStream(stream);
      event.track.onended = () => {
        setRemoteStream((current) => {
          if (!current) return null;
          const tracks = current.getTracks().filter((t) => t.id !== event.track.id);
          return tracks.length ? new MediaStream(tracks) : null;
        });
      };
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingRef.current?.send({
          type: "ice",
          candidate: event.candidate.toJSON(),
        });
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          await signalingRef.current?.send({
            type: "offer",
            sdp: pc.localDescription.sdp,
          });
        }
      } catch {
        setConnectionState("reconnecting");
      } finally {
        makingOfferRef.current = false;
      }
    };
    pc.ondatachannel = (event) => attachChannel(event.channel);

    if (role === "a") {
      attachChannel(pc.createDataChannel("sync", { ordered: true }));
    }

    return pc;
  }, [attachChannel, role]);

  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* candidate may be outdated after renegotiation */
      }
    }
  }, []);

  const handleSignal = useCallback(
    async (envelope: SignalEnvelope) => {
      const pc = pcRef.current;
      if (!pc || !role) return;
      const polite = role === "b";
      const payload = envelope.payload;

      if (payload.type === "peer-joined" && role === "a") {
        if (pc.signalingState === "stable") {
          try {
            makingOfferRef.current = true;
            await pc.setLocalDescription();
            if (pc.localDescription) {
              await signalingRef.current?.send({
                type: "offer",
                sdp: pc.localDescription.sdp,
              });
            }
          } finally {
            makingOfferRef.current = false;
          }
        }
        return;
      }

      if (payload.type === "offer") {
        const collision = makingOfferRef.current || pc.signalingState !== "stable";
        ignoreOfferRef.current = !polite && collision;
        if (ignoreOfferRef.current) return;
        if (collision) {
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch {
            /* rollback is optional */
          }
        }
        await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        await flushIce(pc);
        await pc.setLocalDescription();
        if (pc.localDescription) {
          await signalingRef.current?.send({
            type: "answer",
            sdp: pc.localDescription.sdp,
          });
        }
        return;
      }

      if (payload.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
        await flushIce(pc);
        return;
      }

      if (payload.type === "ice") {
        if (!pc.remoteDescription) {
          pendingIceRef.current.push(payload.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          if (!ignoreOfferRef.current) {
            setConnectionState("reconnecting");
          }
        }
        return;
      }

      if (payload.type === "peer-left") {
        setChannelState("closed");
        setRemoteStream(null);
        setConnectionState("signaling");
      }
    },
    [flushIce, role]
  );

  useEffect(() => {
    if (!enabled || !role) return;
    let cancelled = false;
    const signaling = new SignalingClient(roomId, role, (envelope) => {
      handleSignal(envelope);
    });
    signalingRef.current = signaling;

    (async () => {
      await createPeer();
      if (cancelled) return;
      signaling.start();
      setConnectionState("signaling");
    })();

    const onUnload = () => {
      signaling.send({ type: "peer-left" });
    };
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onUnload);
      signaling.send({ type: "peer-left" });
      signaling.stop();
      localShareRef.current?.getTracks().forEach((track) => track.stop());
      pcRef.current?.close();
      pcRef.current = null;
      dcRef.current = null;
    };
  }, [createPeer, enabled, handleSignal, role, roomId]);

  const sendSync = useCallback((message: SyncMessage) => {
    const channel = dcRef.current;
    if (!channel || channel.readyState !== "open") return false;
    channel.send(JSON.stringify(message));
    return true;
  }, []);

  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    localShareRef.current?.getTracks().forEach((track) => track.stop());
    localShareRef.current = stream;
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
      track.onended = () => {
        setSharing(false);
        sendSync({ type: "screenshare:stop" });
      };
    }
    setSharing(true);
    sendSync({ type: "screenshare:start" });
  }, [sendSync]);

  const stopScreenShare = useCallback(() => {
    const pc = pcRef.current;
    localShareRef.current?.getTracks().forEach((track) => {
      track.stop();
      pc?.getSenders().forEach((sender) => {
        if (sender.track === track) pc.removeTrack(sender);
      });
    });
    localShareRef.current = null;
    setSharing(false);
    sendSync({ type: "screenshare:stop" });
  }, [sendSync]);

  return {
    connectionState,
    channelState,
    remoteStream,
    sharing,
    sendSync,
    startScreenShare,
    stopScreenShare,
    synced: channelState === "open",
  };
}
