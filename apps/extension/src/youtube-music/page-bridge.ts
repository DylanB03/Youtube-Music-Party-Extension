import type { Track } from "@ytm-party/shared";
import {
  resolvePagePlayerTrack,
  type PagePlayerResponse,
  type PagePlayerVideoData,
} from "./player-metadata";

export const PAGE_BRIDGE_REQUEST_EVENT = "ytm-party-page-command";
export const PAGE_BRIDGE_RESPONSE_EVENT = "ytm-party-page-response";
const REQUEST_TIMEOUT_MS = 5_000;

type PageBridgeCommand =
  | {
      type: "getVideoId";
    }
  | {
      type: "getTrack";
    }
  | {
      type: "loadVideoById";
      videoId: string;
    }
  | {
      type: "setWatchUrl";
      videoId: string;
    }
  | {
      type: "pause";
    };

type PageBridgeResponse<T> = {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
};

let bridgeInstalled = false;

export async function getPagePlayerVideoId(): Promise<string | null> {
  return sendPageCommand<string | null>({ type: "getVideoId" });
}

export async function getPagePlayerTrack(): Promise<Track | null> {
  return sendPageCommand<Track | null>({ type: "getTrack" });
}

export async function loadPagePlayerVideo(videoId: string): Promise<void> {
  await sendPageCommand<null>({ type: "loadVideoById", videoId });
}

export async function setPageWatchUrl(videoId: string): Promise<void> {
  await sendPageCommand<null>({ type: "setWatchUrl", videoId });
}

export async function pausePagePlayer(): Promise<void> {
  await sendPageCommand<null>({ type: "pause" });
}

async function sendPageCommand<T>(command: PageBridgeCommand): Promise<T> {
  const id = crypto.randomUUID();

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener(PAGE_BRIDGE_RESPONSE_EVENT, onResponse);
      reject(new Error("Timed out waiting for YouTube Music page bridge."));
    }, REQUEST_TIMEOUT_MS);

    const onResponse = (event: Event) => {
      const response = (event as CustomEvent<PageBridgeResponse<T>>).detail;
      if (!response || response.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener(PAGE_BRIDGE_RESPONSE_EVENT, onResponse);
      if (response.ok) {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error ?? "YouTube Music page bridge failed."));
      }
    };

    window.addEventListener(PAGE_BRIDGE_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent(PAGE_BRIDGE_REQUEST_EVENT, {
        detail: { id, command },
      }),
    );
  });
}

export function installPageBridgeListener(): void {
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  type PageApp = HTMLElement & {
    playerApi?: {
      getVideoData?: () => PagePlayerVideoData;
      getPlayerResponse?: () => PagePlayerResponse;
      loadVideoById?: (videoId: string) => void;
      pauseVideo?: () => void;
    };
  };

  const getApp = (): PageApp | null => document.querySelector("ytmusic-app");
  const getTrack = (): Track | null => {
    const app = getApp();
    const videoData = app?.playerApi?.getVideoData?.();
    const playerResponse = app?.playerApi?.getPlayerResponse?.();
    return resolvePagePlayerTrack(
      videoData,
      playerResponse,
      new URL(location.href).searchParams.get("v"),
    );
  };
  const getVideoId = (): string | null => getTrack()?.videoId ?? null;
  const setWatchUrl = (videoId: string) => {
    const url = new URL("/watch", location.origin);
    url.searchParams.set("v", videoId);
    history.pushState(history.state, "", url);
  };

  window.addEventListener(PAGE_BRIDGE_REQUEST_EVENT, (event: Event) => {
    const detail = (
      event as CustomEvent<{
        id?: string;
        command?: { type?: string; videoId?: string };
      }>
    ).detail;
    const id = detail?.id;
    const command = detail?.command;
    if (!id || !command?.type) return;

    const respond = (ok: boolean, data?: unknown, error?: string) => {
      window.dispatchEvent(
        new CustomEvent(PAGE_BRIDGE_RESPONSE_EVENT, {
          detail: { id, ok, data, error },
        }),
      );
    };

    try {
      if (command.type === "getVideoId") {
        respond(true, getVideoId());
        return;
      }

      if (command.type === "getTrack") {
        respond(true, getTrack());
        return;
      }

      if (command.type === "loadVideoById" && command.videoId) {
        const app = getApp();
        if (!app?.playerApi?.loadVideoById) {
          throw new Error("YouTube Music player API is not ready.");
        }
        app.playerApi.loadVideoById(command.videoId);
        respond(true, null);
        return;
      }

      if (command.type === "setWatchUrl" && command.videoId) {
        setWatchUrl(command.videoId);
        respond(true, null);
        return;
      }

      if (command.type === "pause") {
        getApp()?.playerApi?.pauseVideo?.();
        document.querySelector("video")?.pause();
        respond(true, null);
        return;
      }

      throw new Error("Unknown YouTube Music page bridge command.");
    } catch (error) {
      respond(false, null, error instanceof Error ? error.message : String(error));
    }
  });
}
