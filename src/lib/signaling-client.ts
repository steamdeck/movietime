import type { Role, SignalEnvelope, SignalPayload } from "./protocol";

export class SignalingClient {
  private after = 0;
  private aborted = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private roomId: string,
    private role: Role,
    private onMessage: (envelope: SignalEnvelope) => void
  ) {}

  start() {
    if (this.loopPromise) return;
    this.aborted = false;
    this.loopPromise = this.loop();
  }

  stop() {
    this.aborted = true;
  }

  async send(payload: SignalPayload) {
    await fetch(`/api/rooms/${this.roomId}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: this.role, payload }),
    });
  }

  private async loop() {
    while (!this.aborted) {
      try {
        const res = await fetch(
          `/api/rooms/${this.roomId}/signal?role=${this.role}&after=${this.after}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          await sleep(this.aborted ? 0 : 1200);
          continue;
        }
        const data = (await res.json()) as { messages?: SignalEnvelope[]; seq?: number };
        for (const message of data.messages || []) {
          this.after = Math.max(this.after, message.seq);
          if (message.from !== this.role) this.onMessage(message);
        }
        if (typeof data.seq === "number") this.after = Math.max(this.after, data.seq);
      } catch {
        if (!this.aborted) await sleep(1200);
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
