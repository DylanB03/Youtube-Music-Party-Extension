import { describe, expect, it } from "vitest";
import { enforceRateLimit } from "./rate-limit";
import type { Env } from "../types";

class FakeKv {
  store = new Map<string, string>();
  puts: { key: string; value: string }[] = [];

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.puts.push({ key, value });
    this.store.set(key, value);
  }
}

function envWith(rateLimits: FakeKv): Env {
  return {
    RATE_LIMITS: rateLimits as unknown as KVNamespace,
    INVITES: new FakeKv() as unknown as KVNamespace,
    PARTY_ROOMS: {} as unknown as Env["PARTY_ROOMS"],
  };
}

function request(): Request {
  return new Request("https://party.example/rooms", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.5" },
  });
}

describe("enforceRateLimit", () => {
  it("allows requests under the limit and counts against a dedicated namespace", async () => {
    const rateLimits = new FakeKv();
    const env = envWith(rateLimits);

    const first = await enforceRateLimit(request(), env, {
      scope: "create-room",
      limit: 2,
      windowSeconds: 60,
    });
    const second = await enforceRateLimit(request(), env, {
      scope: "create-room",
      limit: 2,
      windowSeconds: 60,
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(rateLimits.puts).toHaveLength(2);
    // Counters must not collide with invite-code keys.
    expect(rateLimits.puts.every((entry) => entry.key.startsWith("create-room:"))).toBe(true);
  });

  it("returns 429 once the window limit is exceeded", async () => {
    const rateLimits = new FakeKv();
    const env = envWith(rateLimits);
    const options = { scope: "create-room", limit: 1, windowSeconds: 60 };

    const allowed = await enforceRateLimit(request(), env, options);
    const blocked = await enforceRateLimit(request(), env, options);

    expect(allowed).toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("60");
  });
});
