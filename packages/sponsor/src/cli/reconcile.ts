/**
 * Reconciliation CLI. Calls the running app's cron endpoint so the same store
 * (memory or Postgres) is used.
 *
 *   INCINERATOR_URL=http://localhost:3000 CRON_SECRET=... pnpm reconcile
 */
export {};

const base = (process.env.INCINERATOR_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET ?? process.env.ADMIN_TOKEN;
if (!secret) {
  console.error("CRON_SECRET (or ADMIN_TOKEN) is required");
  process.exit(1);
}
const res = await fetch(`${base}/api/cron/reconcile`, { headers: { authorization: `Bearer ${secret}` } });
const text = await res.text();
if (!res.ok) {
  console.error(`${res.status}: ${text}`);
  process.exit(1);
}
console.log(text);
