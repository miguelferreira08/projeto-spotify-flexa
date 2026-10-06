import { $ } from "./dom.js";
import { initAuth, openAuth } from "./auth.js";
import {
  configureLibraryHandlers,
  initLibrary,
  renderTracks,
  subscribeToTracks,
  unsubscribeFromTracks
} from "./library.js";
import { initPlayer, playTrack, resetPlayer, toggleTrack } from "./player.js";
import { initAdmin, removeTrack } from "./admin.js";

configureLibraryHandlers({
  onToggleTrack: toggleTrack,
  onPlayTrack: playTrack,
  onRemoveTrack: removeTrack
});

initLibrary();
initPlayer({
  onStateChange: renderTracks,
  openAuth
});
initAdmin({
  onCurrentTrackRemoved: resetPlayer
});

initAuth({
  onSignedIn: () => subscribeToTracks(),
  onSignedOut: () => {
    unsubscribeFromTracks();
    resetPlayer();
  }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    $(button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
  });
});
