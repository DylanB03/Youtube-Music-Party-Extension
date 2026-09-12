import { describe, expect, it, vi } from "vitest";
import { emptyPlayback } from "@ytm-party/shared";
import { apiWorker } from "./api-worker";
import type { Env } from "./types";

function harness() {
  const roomFetch = vi.fn(async () => new Response(null, { status: 201 }));
  const inviteGet = vi.fn(async () => "room");
  const invitePut = vi.fn(async () => undefined);
  const limiter = { limit: async () => ({ success: true }) };
  const env = {
    CREATE_ROOM_RATE_LIMITER: limiter,
    JOIN_ROOM_RATE_LIMITER: limiter,
    API_RATE_LIMITER: limiter,
    INVITES: { get: inviteGet, put: invitePut },
    PARTY_ROOMS: { idFromName: (name: string) => name, get: () => ({ fetch: roomFetch }) },
  } as unknown as Env;
  const post = (path: string, body: unknown) => apiWorker.fetch(new Request(`https://party.example${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  }), env);
  return { post, roomFetch, inviteGet, invitePut };
}

describe("API request validation", () => {
  it.each([null, [], 42, "invalid"].map((body) => ({ body })))("rejects non-object JSON $body without creating a room", async ({ body }) => {
    const { post, roomFetch, invitePut } = harness();
    expect((await post("/rooms", body)).status).toBe(400);
    expect(roomFetch).not.toHaveBeenCalled();
    expect(invitePut).not.toHaveBeenCalled();
  });

  it.each([{}, { ...emptyPlayback(0), track: { videoId: 123 } }])("rejects malformed initial playback %j before persisting it", async (initialPlayback) => {
    const { post, roomFetch, invitePut } = harness();
    expect((await post("/rooms", { initialPlayback })).status).toBe(400);
    expect(roomFetch).not.toHaveBeenCalled();
    expect(invitePut).not.toHaveBeenCalled();
  });

  it("rejects non-string invite codes before looking them up", async () => {
    const { post, inviteGet } = harness();
    expect((await post("/rooms/join", { inviteCode: 123 })).status).toBe(400);
    expect(inviteGet).not.toHaveBeenCalled();
  });

  it("does not publish an invite when room initialization fails", async () => {
    const { post, roomFetch, invitePut } = harness();
    roomFetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect((await post("/rooms", { initialPlayback: emptyPlayback(0) })).status).toBe(503);
    expect(invitePut).not.toHaveBeenCalled();
  });

  it("still creates rooms with valid or omitted initial playback", async () => {
    const { post, invitePut } = harness();
    expect((await post("/rooms", { initialPlayback: emptyPlayback(0) })).status).toBe(201);
    expect((await post("/rooms", {})).status).toBe(201);
    expect(invitePut).toHaveBeenCalledTimes(2);
  });
});
