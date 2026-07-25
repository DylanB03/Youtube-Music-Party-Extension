import { describe, expect, it } from "vitest";
import {
  findVideoIdInRendererData,
  videoIdFromThumbnailUrl,
} from "./selectors";

describe("YouTube Music selector fallbacks", () => {
  it("reads queue video IDs from nested renderer data", () => {
    expect(
      findVideoIdInRendererData({
        playlistPanelVideoRenderer: {
          menu: {},
          videoId: "queue-video",
        },
      }),
    ).toBe("queue-video");
  });

  it("reads song video IDs from play navigation endpoints", () => {
    expect(
      findVideoIdInRendererData({
        overlay: {
          content: {
            playNavigationEndpoint: {
              watchEndpoint: {
                videoId: "featured-video",
              },
            },
          },
        },
      }),
    ).toBe("featured-video");
  });

  it("safely handles cyclic renderer data", () => {
    const data: Record<string, unknown> = {};
    data.self = data;

    expect(findVideoIdInRendererData(data)).toBeNull();
  });

  it("extracts video IDs from native queue thumbnail URLs", () => {
    expect(
      videoIdFromThumbnailUrl(
        "https://i.ytimg.com/vi_webp/queue-video/mqdefault.webp",
      ),
    ).toBe("queue-video");
  });
});
