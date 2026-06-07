import type {
  ExtensionRequest,
  ExtensionResponse,
  LocalPlaybackState,
  PartyPlaybackState,
  Track,
} from "@ytm-party/shared";
import { browser } from "./browser";
import type { PlaybackApplicationResult } from "./playback-application";

export class YouTubeMusicTabGateway {
  async getPlayback(): Promise<LocalPlaybackState> {
    const playback = await this.sendToActiveTab<LocalPlaybackState>({
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
  ): Promise<PlaybackApplicationResult> {
    const result = await this.sendToActiveTab<PlaybackApplicationResult>({
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
    return this.sendToActiveTab<Record<string, unknown>>({
      type: "content.getDiagnostics",
    });
  }

  private async sendToActiveTab<T>(request: ExtensionRequest): Promise<T | null> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return this.sendToTab<T>(tab?.id, request);
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
