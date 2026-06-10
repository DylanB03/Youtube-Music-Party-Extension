import { describe, expect, it } from "vitest";
import { expiredInvitePage, inviteLandingPage } from "./invite-page";

describe("invite landing page", () => {
  it("links valid invites into YouTube Music", async () => {
    const response = inviteLandingPage("ABC123");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("https://music.youtube.com/?ytm_party=ABC123");
    expect(html).toContain("ABC123");
  });

  it("returns a clear unavailable page", async () => {
    const response = expiredInvitePage();
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("no longer available");
  });
});
