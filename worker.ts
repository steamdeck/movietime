// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

export { MovieRoom } from "./durable-objects/movie-room";
export { MovieNav } from "./durable-objects/movie-nav";

export default {
  async fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;
