import { els } from "./dom.js";
import { state } from "./state.js";
import { formatTime } from "./utils.js";
import { showToast } from "./ui.js";

let onStateChange = () => {};
let openAuth = () => {};

export function playTrack(index) {
  const track = state.tracks[index];
  if (!track) return;

  state.currentTrackIndex = index;
  els.audioPlayer.src = track.audioURL;
  els.playerCover.src = track.coverURL || "./assets/redbeat-logo.png";
  els.playerTitle.textContent = track.title || "Sem título";
  els.playerArtist.textContent = track.artist || "Artista desconhecido";
  els.player.classList.remove("hidden");
  els.audioPlayer.play().catch(() => {
    showToast("Clique em reproduzir para iniciar o áudio.", "error");
  });
  onStateChange();
}

export function toggleTrack(index) {
  if (state.currentTrackIndex === index) {
    if (els.audioPlayer.paused) els.audioPlayer.play();
    else els.audioPlayer.pause();
    return;
  }
  playTrack(index);
}

export function changeTrack(direction) {
  if (!state.tracks.length) return;
  const next = state.currentTrackIndex < 0
    ? 0
    : (state.currentTrackIndex + direction + state.tracks.length) % state.tracks.length;
  playTrack(next);
}

export function resetPlayer() {
  els.audioPlayer.pause();
  els.audioPlayer.removeAttribute("src");
  els.audioPlayer.load();
  state.currentTrackIndex = -1;
  els.player.classList.add("hidden");
  els.currentTime.textContent = "0:00";
  els.durationTime.textContent = "0:00";
  els.seekBar.value = "0";
  onStateChange();
}

export function initPlayer(options = {}) {
  onStateChange = options.onStateChange || onStateChange;
  openAuth = options.openAuth || openAuth;

  els.heroPlayBtn.addEventListener("click", () => {
    if (!state.tracks.length) {
      showToast(state.currentUser ? "Ainda não há músicas no catálogo." : "Entre para ouvir as músicas.");
      if (!state.currentUser) openAuth("login");
      return;
    }

    if (state.currentTrackIndex >= 0 && els.audioPlayer.paused) {
      els.audioPlayer.play();
    } else {
      playTrack(state.currentTrackIndex >= 0 ? state.currentTrackIndex : 0);
    }
  });

  els.playPauseBtn.addEventListener("click", () => {
    if (!els.audioPlayer.src && state.tracks.length) return playTrack(0);
    if (els.audioPlayer.paused) els.audioPlayer.play();
    else els.audioPlayer.pause();
  });

  els.prevBtn.addEventListener("click", () => changeTrack(-1));
  els.nextBtn.addEventListener("click", () => changeTrack(1));

  els.audioPlayer.addEventListener("play", () => {
    els.playPauseBtn.textContent = "❚❚";
    els.playPauseBtn.setAttribute("aria-label", "Pausar");
    onStateChange();
  });

  els.audioPlayer.addEventListener("pause", () => {
    els.playPauseBtn.textContent = "▶";
    els.playPauseBtn.setAttribute("aria-label", "Tocar");
    onStateChange();
  });

  els.audioPlayer.addEventListener("ended", () => changeTrack(1));
  els.audioPlayer.addEventListener("loadedmetadata", () => {
    els.durationTime.textContent = formatTime(els.audioPlayer.duration);
  });

  els.audioPlayer.addEventListener("timeupdate", () => {
    const duration = els.audioPlayer.duration || 0;
    els.currentTime.textContent = formatTime(els.audioPlayer.currentTime);
    els.seekBar.value = duration
      ? String((els.audioPlayer.currentTime / duration) * 100)
      : "0";
  });

  els.seekBar.addEventListener("input", () => {
    const duration = els.audioPlayer.duration || 0;
    if (duration) {
      els.audioPlayer.currentTime = (Number(els.seekBar.value) / 100) * duration;
    }
  });

  els.volumeBar.addEventListener("input", () => {
    els.audioPlayer.volume = Number(els.volumeBar.value);
  });

  els.audioPlayer.volume = Number(els.volumeBar.value);
}
