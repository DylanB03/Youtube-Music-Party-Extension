export type YouTubeMusicSurfaceFixture = {
  name: string;
  rowTag: string;
  rowClass?: string;
  videoId: string;
  videoSource: "link" | "row" | "thumbnail";
  title: string;
  titleTag: string;
  titleClass?: string;
  boldTitle?: boolean;
  artist: string;
  artistClass: string;
  contentClass?: string;
  triggerTag: string;
  nestedMenuButton?: boolean;
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
    name: "native queue item",
    rowTag: "ytmusic-player-queue-item",
    videoId: "queue-track",
    videoSource: "thumbnail",
    title: "Queue Track",
    titleTag: "yt-formatted-string",
    titleClass: "",
    artist: "Queue Artist",
    artistClass: "",
    contentClass: "song-info",
    triggerTag: "ytmusic-menu-renderer",
    nestedMenuButton: true,
    triggerAttribute: { name: "aria-haspopup", value: "menu" },
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
  {
    name: "action-menu row",
    rowTag: "ytmusic-responsive-list-item-renderer",
    videoId: "action-menu-track",
    videoSource: "link",
    title: "Action Menu Track",
    titleTag: "a",
    artist: "Action Menu Artist",
    artistClass: "subtitle",
    triggerTag: "yt-button-shape",
    triggerAttribute: { name: "aria-label", value: "Action menu" },
  },
  {
    name: "featured search song",
    rowTag: "div",
    rowClass: "card-content-container",
    videoId: "featured-search-track",
    videoSource: "thumbnail",
    title: "Featured Search Track",
    titleTag: "yt-formatted-string",
    titleClass: "title",
    boldTitle: true,
    artist: "Featured Search Artist",
    artistClass: "subtitle",
    triggerTag: "ytmusic-menu-renderer",
    nestedMenuButton: true,
    triggerAttribute: { name: "aria-haspopup", value: "menu" },
  },
];
