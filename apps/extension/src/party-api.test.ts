import { afterEach, describe, expect, it, vi } from "vitest";
import { PartyApi, PartyApiError, PartyExpiredError } from "./party-api";

describe("party API session recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats rejected participant credentials as a terminal session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Participant is no longer active" },
          { status: 401 },
        ),
      ),
    );

    await expect(
      new PartyApi().createConnectionTicket(
        "room",
        "participant",
        "stale-token",
        "Listener",
      ),
    ).rejects.toBeInstanceOf(PartyExpiredError);
  });

  it("keeps temporary server failures retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Temporary failure" }, { status: 503 }),
      ),
    );

    await expect(
      new PartyApi().createConnectionTicket(
        "room",
        "participant",
        "token",
        "Listener",
      ),
    ).rejects.toBeInstanceOf(PartyApiError);
  });

  it("bounds connection-ticket and leave requests with abort signals", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ticket: "ticket", expiresAtMs: Date.now() + 30_000 }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new PartyApi();

    await api.createConnectionTicket("room", "participant", "token", "Listener");
    await api.leaveRoom("room", "participant", "token");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
