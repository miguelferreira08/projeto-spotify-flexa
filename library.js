import {
  collection,
  onSnapshot,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { els } from "./dom.js";
import { state } from "./state.js";
import { isAdmin } from "./permissions.js";
import { getCoverObjectUrl } from "./media.js";
import { escapeHtml, formatLibraryDuration, formatTime } from "./utils.js";
import { showToast } from "./ui.js";

let handlers = {
  onToggleTrack: null,
  onPlayTrack: null,
  onRemoveTrack: null
};

export function configureLibraryHandlers(nextHandlers = {}) {
  handlers = { ...handlers, ...nextHandlers };
}

async function loadCover(img, track) {
  if (!img || !track) return;
  img.src = track.coverDataUrl || track.coverURL || "./assets/redbeat-logo.png";
  img.dataset.coverTrackId = track.id;
  if (track.coverDataUrl || track.coverURL || !track.coverChunkCount) return;

  try {
    const url = await getCoverObjectUrl(track);
    if (img.isConnected && img.dataset.coverTrackId === track.id) img.src = url;
  } catch (error) {
    console.error("Falha ao abrir capa:", error);
    if (img.isConnected && img.dataset.coverTrackId === track.id) img.src = "./assets/redbeat-logo.png";
  }
}

export function subscribeToTracks() {
  state.unsubscribeTracks?.();
  const tracksQuery = query(collection(db, "tracks"), orderBy("createdAt", "desc"));

  state.unsubscribeTracks = onSnapshot(tracksQuery, (snapshot) => {
    state.tracks = snapshot.docs
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .filter((track) => track.kind === "track" || (!track.kind && track.title));
    applyFilter();
    updateHero();
  }, (error) => {
    console.error(error);
    showToast("Não foi possível carregar as músicas. Confira as regras do Firestore.", "error");
  });
}

export function unsubscribeFromTracks() {
  state.unsubscribeTracks?.();
  state.unsubscribeTracks = null;
  state.tracks = [];
  state.filteredTracks = [];
  renderTracks();
  updateHero();
}

export function applyFilter() {
  const term = els.searchInput.value.trim().toLocaleLowerCase("pt-BR");
  state.filteredTracks = !term
    ? [...state.tracks]
    : state.tracks.filter((track) =>
      [track.title, track.artist, track.album, track.genre]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term))
    );
  renderTracks();
}

export function renderTracks() {
  els.trackList.innerHTML = "";
  const hasTracks = state.filteredTracks.length > 0;
  els.emptyTracksState.classList.toggle("hidden", hasTracks);

  if (!hasTracks) {
    els.emptyTracksText.textContent = state.tracks.length
      ? "Nenhuma faixa corresponde à sua busca."
      : isAdmin()
        ? "Use “Adicionar música” para enviar a primeira faixa."
        : "O administrador ainda não adicionou faixas.";
    return;
  }

  state.filteredTracks.forEach((track, visibleIndex) => {
    const actualIndex = state.tracks.findIndex((item) => item.id === track.id);
    const row = document.createElement("div");
    row.className = `track-row ${actualIndex === state.currentTrackIndex ? "playing" : ""}`;
    row.dataset.trackId = track.id;
    row.innerHTML = `
      <div class="track-index">
        <span class="track-index-number">${visibleIndex + 1}</span>
        <button class="row-play" type="button" aria-label="Tocar ${escapeHtml(track.title)}">${actualIndex === state.currentTrackIndex && !els.audioPlayer.paused ? "❚❚" : "▶"}</button>
      </div>
      <div class="track-title-cell">
        <img class="track-cover" alt="" loading="lazy" />
        <div class="track-title-copy">
          <strong>${escapeHtml(track.title || "Sem título")}</strong>
          <span>${escapeHtml(track.artist || "Artista desconhecido")}</span>
        </div>
      </div>
      <div class="truncate">${escapeHtml(track.album || "—")}</div>
      <div class="truncate">${escapeHtml(track.genre || "—")}</div>
      <div>${formatTime(Number(track.duration) || 0)}</div>
      <div class="track-action">${isAdmin()
        ? `<button class="icon-btn delete-btn" type="button" aria-label="Remover ${escapeHtml(track.title)}" title="Remover música">×</button>`
        : `<button class="icon-btn" type="button" aria-label="Mais opções" title="Mais opções">•••</button>`}</div>
    `;

    loadCover(row.querySelector(".track-cover"), track);
    row.querySelector(".row-play").addEventListener("click", () => handlers.onToggleTrack?.(actualIndex));
    row.querySelector(".track-title-cell").addEventListener("dblclick", () => handlers.onPlayTrack?.(actualIndex));
    row.querySelector(".track-title-cell").style.cursor = "pointer";

    const deleteBtn = row.querySelector(".delete-btn");
    if (deleteBtn) deleteBtn.addEventListener("click", () => handlers.onRemoveTrack?.(track));

    els.trackList.appendChild(row);
  });
}

export function updateHero() {
  const count = state.tracks.length;
  els.trackCount.textContent = `${count} ${count === 1 ? "música" : "músicas"}`;
  const total = state.tracks.reduce((sum, track) => sum + (Number(track.duration) || 0), 0);
  els.totalDuration.textContent = formatLibraryDuration(total);

  [...els.coverGrid.querySelectorAll("img")].forEach((img, index) => {
    const track = state.tracks[index];
    if (track) {
      img.alt = `Capa de ${track.title}`;
      loadCover(img, track);
    } else {
      img.removeAttribute("data-cover-track-id");
      img.src = "./assets/redbeat-logo.png";
      img.alt = "RedBeat";
    }
  });
}

export function initLibrary() {
  els.searchInput.addEventListener("input", applyFilter);
  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      els.searchInput.value = "";
      els.searchInput.closest(".search-box")?.classList.remove("mobile-open");
      applyFilter();
    }
  });

  els.mobileSearchBtn.addEventListener("click", () => {
    const box = els.searchInput.closest(".search-box");
    box.classList.toggle("mobile-open");
    if (box.classList.contains("mobile-open")) setTimeout(() => els.searchInput.focus(), 80);
  });
}
