import type {
  ExtensionRequest,
  ExtensionResponse,
  LocalPlaybackState,
  PartyPlaybackState,
  Track,
} from "@ytm-party/shared";
import { browser } from "./browser";
import type { PlaybackApplicationResult } from "./playback-application";

const YOUTUBE_MUSIC_URL_PREFIX = "https://music.youtube.com/";

export class YouTubeMusicTabGateway {
  async getPlayback(tabId?: number): Promise<LocalPlaybackState> {
    const targetTabId = await this.resolveTargetTabId(tabId);
    const playback = await this.sendToTab<LocalPlaybackState>(targetTabId, {
      type: "content.getPlayback",
    });
    if (playback) return playback;

    return {
      track: null,
      paused: true,
      positionSeconds: 0,
      buffering: false,
    };
  }

  async applyPlayback(
    playback: PartyPlaybackState,
    tabId?: number,
  ): Promise<PlaybackApplicationResult> {
    const targetTabId = await this.resolveTargetTabId(tabId);
    const result = await this.sendToTab<PlaybackApplicationResult>(targetTabId, {
      type: "content.applyPlayback",
      playback,
    });
    if (!result) throw new Error("YouTube Music did not accept the playback command.");
    return result;
  }

  async getContextSong(tabId?: number): Promise<Track | null> {
    return this.sendToTab<Track>(tabId, {
      type: "content.getContextSong",
    });
  }

  async getDiagnostics(): Promise<Record<string, unknown> | null> {
    const targetTabId = await this.resolveTargetTabId();
    return this.sendToTab<Record<string, unknown>>(targetTabId, {
      type: "content.getDiagnostics",
    });
  }

  async resolveActivePartyTabId(): Promise<number | null> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    return tab.url?.startsWith(YOUTUBE_MUSIC_URL_PREFIX) ? tab.id : null;
  }

  private async resolveTargetTabId(preferredTabId?: number): Promise<number | undefined> {
    if (preferredTabId != null && (await this.tabExists(preferredTabId))) {
      return preferredTabId;
    }
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url?.startsWith(YOUTUBE_MUSIC_URL_PREFIX)) return tab.id;
    const [musicTab] = await browser.tabs.query({ url: `${YOUTUBE_MUSIC_URL_PREFIX}*` });
    return musicTab?.id ?? tab?.id;
  }

  private async tabExists(tabId: number): Promise<boolean> {
    try {
      await browser.tabs.get(tabId);
      return true;
    } catch {
      return false;
    }
  }

  private async sendToTab<T>(
    tabId: number | undefined,
    request: ExtensionRequest,
  ): Promise<T | null> {
    if (!tabId) return null;

    let response: ExtensionResponse<T>;
    try {
      response = (await browser.tabs.sendMessage(tabId, request)) as ExtensionResponse<T>;
    } catch {
      return null;
    }

    if (!response.ok) throw new Error(response.error);
    return response.data;
  }
}
