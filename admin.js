import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { db, storage } from "./firebase.js";
import { els } from "./dom.js";
import { state } from "./state.js";
import { isAdmin } from "./permissions.js";
import { getAudioDuration, safeExtension } from "./utils.js";
import { setError, showToast } from "./ui.js";

let onCurrentTrackRemoved = () => {};

function uploadWithProgress(storageRef, file, onProgress, fallbackContentType = "application/octet-stream") {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || fallbackContentType
    });

    task.on("state_changed", (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      onProgress(percent);
    }, reject, () => resolve(task.snapshot));
  });
}

function updateUploadProgress(value) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  els.uploadProgress.value = progress;
  els.uploadPercent.textContent = `${progress}%`;
}

function resetTrackForm() {
  els.trackForm.reset();
  setError(els.adminError);
  els.coverPreview.src = "./assets/redbeat-logo.png";
  els.audioFileName.textContent = "Selecione um arquivo MP3";
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
  if (audio.size > 50 * 1024 * 1024) {
    setError(els.adminError, "O MP3 deve ter no máximo 50 MB.");
    return;
  }
  if (cover.size > 10 * 1024 * 1024) {
    setError(els.adminError, "A capa deve ter no máximo 10 MB.");
    return;
  }

  const trackRef = doc(collection(db, "tracks"));
  const trackId = trackRef.id;
  const audioPath = `audio/${trackId}/track.mp3`;
  const coverPath = `covers/${trackId}/cover.${safeExtension(cover, "jpg")}`;
  const audioRef = ref(storage, audioPath);
  const coverRef = ref(storage, coverPath);

  els.addTrackBtn.disabled = true;
  els.addTrackBtn.textContent = "Enviando...";
  els.uploadProgressWrap.classList.remove("hidden");

  try {
    els.uploadStatus.textContent = "Lendo o MP3...";
    const duration = await getAudioDuration(audio);

    els.uploadStatus.textContent = "Enviando áudio...";
    await uploadWithProgress(
      audioRef,
      audio,
      (percent) => updateUploadProgress(percent * 0.72),
      "audio/mpeg"
    );

    els.uploadStatus.textContent = "Enviando capa...";
    await uploadWithProgress(
      coverRef,
      cover,
      (percent) => updateUploadProgress(72 + percent * 0.23),
      cover.type || "image/jpeg"
    );

    const [audioURL, coverURL] = await Promise.all([
      getDownloadURL(audioRef),
      getDownloadURL(coverRef)
    ]);

    els.uploadStatus.textContent = "Salvando dados...";
    updateUploadProgress(98);

    await setDoc(trackRef, {
      title: els.trackTitle.value.trim(),
      artist: els.trackArtist.value.trim(),
      album: els.trackAlbum.value.trim(),
      genre: els.trackGenre.value.trim(),
      duration,
      audioURL,
      coverURL,
      audioPath,
      coverPath,
      createdBy: state.currentUser.uid,
      createdAt: serverTimestamp()
    });

    updateUploadProgress(100);
    showToast("Música adicionada ao RedBeat.");
    resetTrackForm();
    setTimeout(() => els.adminDialog.close(), 200);
  } catch (error) {
    console.error(error);
    try { await deleteObject(audioRef); } catch (_) {}
    try { await deleteObject(coverRef); } catch (_) {}

    const message = error?.code === "storage/unauthorized"
      ? "Upload bloqueado pelas regras do Storage. Confira o ADMIN_UID e publique storage.rules."
      : error?.code === "permission-denied"
        ? "Operação bloqueada pelas regras do Firestore. Confira o ADMIN_UID e publique firestore.rules."
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
    if (track.audioPath) {
      try {
        await deleteObject(ref(storage, track.audioPath));
      } catch (error) {
        if (error?.code !== "storage/object-not-found") throw error;
      }
    }

    if (track.coverPath) {
      try {
        await deleteObject(ref(storage, track.coverPath));
      } catch (error) {
        if (error?.code !== "storage/object-not-found") throw error;
      }
    }

    await deleteDoc(doc(db, "tracks", track.id));

    if (state.tracks[state.currentTrackIndex]?.id === track.id) {
      onCurrentTrackRemoved();
    }

    showToast("Música removida.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível remover a música. Confira as regras do Firebase.", "error");
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
    els.audioFileName.textContent = els.audioFile.files[0]?.name || "Selecione um arquivo MP3";
  });
}
