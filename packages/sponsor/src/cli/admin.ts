/**
 * Incinerator admin CLI. Talks to the running app's /api/admin endpoints.
 *
 *   INCINERATOR_URL=http://localhost:3000 ADMIN_TOKEN=... pnpm admin <command>
 *
 * Commands:
 *   status                       sponsor status + spend
 *   pause | resume               kill switch
 *   limits KEY=VALUE ...         override policy limits (VALUE "default" clears)
 *   denylist <address> [reason] [ttlHours]
 *   undeny <address>
 *   spend                        recent sponsored operations
 *   failures                     recent failed simulations
 *   refills                      refill history
 */
export {};

const base = (process.env.INCINERATOR_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("ADMIN_TOKEN is required");
  process.exit(1);
}

async function call(path: string, body?: unknown): Promise<unknown> {
  const init: RequestInit = {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${base}/api/admin/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const [cmd = "status", ...rest] = process.argv.slice(2);

const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));

try {
  switch (cmd) {
    case "status":
      out(await call("status"));
      break;
    case "pause":
      out(await call("pause", {}));
      break;
    case "resume":
      out(await call("resume", {}));
      break;
    case "limits": {
      const patch: Record<string, string> = {};
      for (const kv of rest) {
        const [k, v] = kv.split("=");
        if (!k || v === undefined) throw new Error(`bad KEY=VALUE: ${kv}`);
        patch[k] = v;
      }
      out(await call("limits", patch));
      break;
    }
    case "denylist": {
      const [address, reason, ttlHours] = rest;
      if (!address) throw new Error("address required");
      out(await call("denylist", { address, reason: reason ?? null, ttlHours: ttlHours ? Number(ttlHours) : null }));
      break;
    }
    case "undeny": {
      const [address] = rest;
      if (!address) throw new Error("address required");
      out(await call("undeny", { address }));
      break;
    }
    case "spend": {
      const r = (await call("inspect")) as { sponsored: unknown; spend: unknown };
      out({ spend: r.spend, sponsored: r.sponsored });
      break;
    }
    case "failures":
      out(((await call("inspect")) as { failedSimulations: unknown }).failedSimulations);
      break;
    case "refills":
      out(((await call("inspect")) as { refills: unknown }).refills);
      break;
    default:
      console.error(`unknown command ${cmd}`);
      process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
