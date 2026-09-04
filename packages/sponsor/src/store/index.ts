import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import type { SponsorStore } from "./types";

export * from "./types";
export { MemoryStore } from "./memory";
export { PostgresStore } from "./postgres";

let singleton: SponsorStore | null = null;

/** Process-wide store. Postgres when DATABASE_URL is set, memory otherwise. */
export function getStore(databaseUrl?: string | undefined): SponsorStore {
  if (singleton) return singleton;
  singleton = databaseUrl ? new PostgresStore(databaseUrl) : new MemoryStore();
  return singleton;
}

/** Test hook. */
export function setStore(store: SponsorStore | null): void {
  singleton = store;
}
