import { browser } from "./browser";
import type { StoredSession } from "./session-types";

const SESSION_STORAGE_KEY = "ytm-party-session";

export class SessionStorage {
  async load(): Promise<StoredSession | null> {
    const stored = await browser.storage.local.get(SESSION_STORAGE_KEY);
    const session = stored[SESSION_STORAGE_KEY] as StoredSession | undefined;
    if (!session?.roomId || !session.participantId || !session.participantToken) {
      return null;
    }
    return session;
  }

  async save(session: StoredSession): Promise<void> {
    await browser.storage.local.set({
      [SESSION_STORAGE_KEY]: session,
    });
  }

  async clear(): Promise<void> {
    await browser.storage.local.remove(SESSION_STORAGE_KEY);
  }
}
