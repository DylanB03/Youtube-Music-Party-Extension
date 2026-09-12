import { describe, expect, it, vi } from "vitest";
import { enforceRateLimit } from "./rate-limit";
import type { Env } from "../types";

function fixture() {
  const create = vi.fn(async (_options: { key: string }) => ({ success: true }));
  const join = vi.fn(async (_options: { key: string }) => ({ success: true }));
  const api = vi.fn(async (_options: { key: string }) => ({ success: true }));
  const env = {
    CREATE_ROOM_RATE_LIMITER: { limit: create },
    JOIN_ROOM_RATE_LIMITER: { limit: join },
    API_RATE_LIMITER: { limit: api },
  } as unknown as Env;
  return { env, create, join, api };
}

function request(): Request {
  return new Request("https://party.example/rooms", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.5" },
  });
}

describe("enforceRateLimit", () => {
  it("allows consecutive requests without writing a KV counter", async () => {
    const { env, join } = fixture();
    expect(await enforceRateLimit(request(), env, { scope: "join-room" })).toBeNull();
    expect(await enforceRateLimit(request(), env, { scope: "join-room" })).toBeNull();
    expect(join).toHaveBeenCalledTimes(2);
    expect(join).toHaveBeenCalledWith({ key: "ytm-party:join-room:203.0.113.5" });
  });

  it("selects the configured budget and keeps API scopes independent", async () => {
    const { env, create, join, api } = fixture();
    await enforceRateLimit(request(), env, { scope: "create-room" });
    await enforceRateLimit(request(), env, { scope: "connection-ticket" });
    await enforceRateLimit(request(), env, { scope: "leave-room" });

    expect(create).toHaveBeenCalledWith({ key: "ytm-party:create-room:203.0.113.5" });
    expect(join).not.toHaveBeenCalled();
    expect(api.mock.calls).toEqual([
      [{ key: "ytm-party:connection-ticket:203.0.113.5" }],
      [{ key: "ytm-party:leave-room:203.0.113.5" }],
    ]);
  });

  it("returns 429 when the platform reports an exhausted budget", async () => {
    const { env, create } = fixture();
    create.mockResolvedValue({ success: false });
    const response = await enforceRateLimit(request(), env, { scope: "create-room" });
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
  });
});
