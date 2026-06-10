export type YouTubeMusicSurfaceFixture = {
  name: string;
  rowTag: string;
  videoId: string;
  videoSource: "link" | "row";
  title: string;
  titleTag: string;
  artist: string;
  artistClass: string;
  triggerTag: string;
  triggerAttribute: {
    name: string;
    value: string;
  };
};

export const youtubeMusicSurfaceFixtures: YouTubeMusicSurfaceFixture[] = [
  {
    name: "search result",
    rowTag: "ytmusic-responsive-list-item-renderer",
    videoId: "search-track",
    videoSource: "link",
    title: "Search Track",
    titleTag: "a",
    artist: "Search Artist",
    artistClass: "subtitle",
    triggerTag: "button",
    triggerAttribute: { name: "aria-label", value: "More actions" },
  },
  {
    name: "album row",
    rowTag: "ytmusic-responsive-list-item-renderer",
    videoId: "album-track",
    videoSource: "row",
    title: "Album Track",
    titleTag: "yt-formatted-string",
    artist: "Album Artist",
    artistClass: "secondary-flex-columns",
    triggerTag: "tp-yt-paper-icon-button",
    triggerAttribute: { name: "aria-label", value: "More actions" },
  },
  {
    name: "playlist row",
    rowTag: "ytmusic-playlist-shelf-renderer",
    videoId: "playlist-track",
    videoSource: "link",
    title: "Playlist Track",
    titleTag: "a",
    artist: "Playlist Artist",
    artistClass: "subtitle",
    triggerTag: "button",
    triggerAttribute: { name: "class", value: "dropdown-trigger" },
  },
  {
    name: "queue item",
    rowTag: "ytmusic-player-queue-item",
    videoId: "queue-track",
    videoSource: "row",
    title: "Queue Track",
    titleTag: "span",
    artist: "Queue Artist",
    artistClass: "subtitle",
    triggerTag: "button",
    triggerAttribute: { name: "aria-haspopup", value: "true" },
  },
  {
    name: "recommendation card",
    rowTag: "ytmusic-two-row-item-renderer",
    videoId: "recommendation-track",
    videoSource: "link",
    title: "Recommendation Track",
    titleTag: "a",
    artist: "Recommendation Artist",
    artistClass: "subtitle",
    triggerTag: "yt-button-shape",
    triggerAttribute: { name: "aria-label", value: "More actions" },
  },
];
