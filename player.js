import { els } from "./dom.js";
import { state } from "./state.js";
import { formatTime } from "./utils.js";
import { clearMediaObjectUrls, getAudioObjectUrl, getCoverObjectUrl } from "./media.js";
import { showToast } from "./ui.js";

let onStateChange = () => {};
let openAuth = () => {};
let playRequestId = 0;

function setLoading(loading) {
  els.playPauseBtn.disabled = loading;
  els.playPauseBtn.textContent = loading ? "…" : (els.audioPlayer.paused ? "▶" : "❚❚");
}

async function setPlayerCover(track, requestId) {
  els.playerCover.src = track.coverDataUrl || track.coverURL || "./assets/redbeat-logo.png";
  if (track.coverDataUrl || track.coverURL || !track.coverChunkCount) return;
  try {
    const url = await getCoverObjectUrl(track);
    if (requestId === playRequestId) els.playerCover.src = url;
  } catch (error) {
    console.error("Falha ao descomprimir capa:", error);
  }
}

export async function playTrack(index) {
  const track = state.tracks[index];
  if (!track) return;

  const requestId = ++playRequestId;
  state.currentTrackIndex = index;
  setPlayerCover(track, requestId);
  els.playerTitle.textContent = track.title || "Sem título";
  els.playerArtist.textContent = track.artist || "Artista desconhecido";
  els.player.classList.remove("hidden");
  setLoading(true);
  onStateChange();

  try {
    const source = await getAudioObjectUrl(track, (fraction) => {
      if (requestId === playRequestId && fraction < 1) {
        els.playerArtist.textContent = `Baixando e descomprimindo… ${Math.round(fraction * 100)}%`;
      }
    });

    if (requestId !== playRequestId) return;

    els.playerArtist.textContent = track.artist || "Artista desconhecido";
    if (els.audioPlayer.src !== source) {
      els.audioPlayer.src = source;
      els.audioPlayer.load();
    }

    try {
      await els.audioPlayer.play();
    } catch (_) {
      showToast("Áudio carregado. Clique em reproduzir para iniciar.");
    }
  } catch (error) {
    console.error(error);
    if (requestId === playRequestId) {
      els.playerArtist.textContent = track.artist || "Artista desconhecido";
      showToast(error?.message || "Não foi possível carregar o áudio.", "error");
    }
  } finally {
    if (requestId === playRequestId) setLoading(false);
    onStateChange();
  }
}

export function toggleTrack(index) {
  if (state.currentTrackIndex === index && els.audioPlayer.src) {
    if (els.audioPlayer.paused) els.audioPlayer.play().catch(() => {});
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

export function resetPlayer(clearCache = false) {
  playRequestId += 1;
  els.audioPlayer.pause();
  els.audioPlayer.removeAttribute("src");
  els.audioPlayer.load();
  state.currentTrackIndex = -1;
  els.player.classList.add("hidden");
  els.currentTime.textContent = "0:00";
  els.durationTime.textContent = "0:00";
  els.seekBar.value = "0";
  setLoading(false);
  if (clearCache) clearMediaObjectUrls();
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

    if (state.currentTrackIndex >= 0 && els.audioPlayer.src && els.audioPlayer.paused) {
      els.audioPlayer.play().catch(() => {});
    } else {
      playTrack(state.currentTrackIndex >= 0 ? state.currentTrackIndex : 0);
    }
  });

  els.playPauseBtn.addEventListener("click", () => {
    if (!els.audioPlayer.src && state.tracks.length) return playTrack(state.currentTrackIndex >= 0 ? state.currentTrackIndex : 0);
    if (els.audioPlayer.paused) els.audioPlayer.play().catch(() => {});
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
    els.seekBar.value = duration ? String((els.audioPlayer.currentTime / duration) * 100) : "0";
  });

  els.seekBar.addEventListener("input", () => {
    const duration = els.audioPlayer.duration || 0;
    if (duration) els.audioPlayer.currentTime = (Number(els.seekBar.value) / 100) * duration;
  });

  els.volumeBar.addEventListener("input", () => {
    els.audioPlayer.volume = Number(els.volumeBar.value);
  });

  els.audioPlayer.volume = Number(els.volumeBar.value);
}
