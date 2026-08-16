import { DurableObject } from "cloudflare:workers";
import type { NavigationRecord } from "../src/lib/store";

export class MovieNav extends DurableObject {
  async save(record: NavigationRecord): Promise<void> {
    await this.ctx.storage.put("nav", record);
    await this.ctx.storage.setAlarm(record.expiresAt);
  }

  async load(): Promise<NavigationRecord | null> {
    const record = (await this.ctx.storage.get<NavigationRecord>("nav")) ?? null;
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      await this.ctx.storage.deleteAll();
      return null;
    }
    return record;
  }

  async alarm(): Promise<void> {
    const record = await this.ctx.storage.get<NavigationRecord>("nav");
    if (!record || record.expiresAt <= Date.now()) {
      await this.ctx.storage.deleteAll();
    }
  }
}
