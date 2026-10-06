import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { els } from "./dom.js";
import { state } from "./state.js";
import { isAdmin } from "./permissions.js";
import { getAudioDuration } from "./utils.js";
import { MAX_AUDIO_BYTES } from "./file-utils.js";
import {
  deleteTrackAssets,
  saveAudioCompressed,
  saveCoverCompressed
} from "./media.js";
import { compressionSupported } from "./compression.js";
import { setError, showToast } from "./ui.js";

let onCurrentTrackRemoved = () => {};

function updateUploadProgress(value) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  els.uploadProgress.value = progress;
  els.uploadPercent.textContent = `${progress}%`;
}

function resetTrackForm() {
  els.trackForm.reset();
  setError(els.adminError);
  els.coverPreview.src = "./assets/redbeat-logo.png";
  els.audioFileName.textContent = "Selecione um arquivo MP3 • máximo 15 MB";
  els.uploadProgressWrap.classList.add("hidden");
  updateUploadProgress(0);

  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }
}

export function openAdmin() {
  if (!isAdmin()) {
    showToast("Apenas o administrador pode adicionar músicas.", "error");
    return;
  }
  if (!compressionSupported()) {
    showToast("Atualize seu navegador: a compressão GZIP necessária não está disponível.", "error");
    return;
  }

  resetTrackForm();
  if (!els.adminDialog.open) els.adminDialog.showModal();
}

async function handleTrackSubmit(event) {
  event.preventDefault();
  setError(els.adminError);

  if (!isAdmin()) {
    setError(els.adminError, "Sua conta não tem permissão de administrador.");
    return;
  }
  if (!compressionSupported()) {
    setError(els.adminError, "Seu navegador não oferece compressão GZIP. Atualize-o para continuar.");
    return;
  }

  const cover = els.coverFile.files[0];
  const audio = els.audioFile.files[0];

  if (!cover || !audio) {
    setError(els.adminError, "Selecione a capa e o arquivo MP3.");
    return;
  }
  if (!audio.type.includes("mpeg") && !audio.name.toLowerCase().endsWith(".mp3")) {
    setError(els.adminError, "O arquivo de áudio precisa estar em formato MP3.");
    return;
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    setError(els.adminError, "Cada MP3 pode ter no máximo 15 MB.");
    return;
  }

  const title = els.trackTitle.value.trim();
  const artist = els.trackArtist.value.trim();
  const album = els.trackAlbum.value.trim();
  const genre = els.trackGenre.value.trim();
  if (!title || !artist || !album || !genre) {
    setError(els.adminError, "Preencha nome, artista, álbum e gênero.");
    return;
  }

  const trackRef = doc(collection(db, "tracks"));
  const trackId = trackRef.id;
  let savedAudio = null;
  let savedCover = null;

  els.addTrackBtn.disabled = true;
  els.addTrackBtn.textContent = "Salvando...";
  els.uploadProgressWrap.classList.remove("hidden");

  try {
    els.uploadStatus.textContent = "Analisando MP3...";
    updateUploadProgress(2);
    const duration = await getAudioDuration(audio);

    els.uploadStatus.textContent = "Comprimindo e salvando capa...";
    savedCover = await saveCoverCompressed(trackId, cover, (fraction) => {
      updateUploadProgress(5 + fraction * 20);
    });

    els.uploadStatus.textContent = "Comprimindo MP3 e salvando no Firestore...";
    savedAudio = await saveAudioCompressed(trackId, audio, (fraction) => {
      updateUploadProgress(25 + fraction * 68);
    });

    els.uploadStatus.textContent = "Salvando informações da música...";
    updateUploadProgress(96);

    await setDoc(trackRef, {
      kind: "track",
      storageMode: "firestore-gzip-chunks",
      compression: "gzip",
      title,
      artist,
      album,
      genre,
      duration,
      audioChunkCount: savedAudio.chunkCount,
      audioOriginalSize: savedAudio.originalSize,
      audioCompressedSize: savedAudio.compressedSize,
      audioMime: "audio/mpeg",
      coverChunkCount: savedCover.chunkCount,
      coverInputSize: savedCover.inputSize,
      coverPreparedSize: savedCover.originalSize,
      coverCompressedSize: savedCover.compressedSize,
      coverMime: savedCover.mime,
      createdBy: state.currentUser.uid,
      createdAt: serverTimestamp()
    });

    updateUploadProgress(100);
    showToast("Música comprimida e adicionada ao RedBeat.");
    resetTrackForm();
    setTimeout(() => els.adminDialog.close(), 200);
  } catch (error) {
    console.error(error);
    if (savedAudio || savedCover) {
      try {
        await deleteTrackAssets({
          id: trackId,
          audioChunkCount: savedAudio?.chunkCount || 0,
          coverChunkCount: savedCover?.chunkCount || 0
        });
      } catch (_) {}
    }

    const message = error?.code === "permission-denied"
      ? "Operação bloqueada pelas regras do Firestore. Confirme que seu UID de admin está publicado nas regras."
      : error?.message || "Falha ao adicionar a música.";

    setError(els.adminError, message);
  } finally {
    els.addTrackBtn.disabled = false;
    els.addTrackBtn.textContent = "Adicionar música";
  }
}

export async function removeTrack(track) {
  if (!isAdmin()) return;

  const confirmed = window.confirm(`Remover “${track.title}” de ${track.artist}?`);
  if (!confirmed) return;

  try {
    if (state.tracks[state.currentTrackIndex]?.id === track.id) onCurrentTrackRemoved();
    await deleteTrackAssets(track);
    await deleteDoc(doc(db, "tracks", track.id));
    showToast("Música removida.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível remover a música. Confira sua conexão e as regras do Firestore.", "error");
  }
}

export function initAdmin(options = {}) {
  onCurrentTrackRemoved = options.onCurrentTrackRemoved || onCurrentTrackRemoved;

  document
    .querySelectorAll("#openAdminBtn, #openAdminBtn2, #mobileAddBtn")
    .forEach((button) => button?.addEventListener("click", openAdmin));

  els.trackForm.addEventListener("submit", handleTrackSubmit);

  els.coverFile.addEventListener("change", () => {
    const file = els.coverFile.files[0];
    if (!file) return;
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = URL.createObjectURL(file);
    els.coverPreview.src = state.previewObjectUrl;
  });

  els.audioFile.addEventListener("change", () => {
    const file = els.audioFile.files[0];
    if (!file) {
      els.audioFileName.textContent = "Selecione um arquivo MP3 • máximo 15 MB";
      return;
    }
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    els.audioFileName.textContent = `${file.name} • ${mb} MB • será comprimido antes de salvar`;
  });
}
