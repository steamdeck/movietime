import type { DurableBindings } from "./src/lib/durable-rpc";

declare global {
  interface CloudflareEnv extends DurableBindings {}
}

export {};
