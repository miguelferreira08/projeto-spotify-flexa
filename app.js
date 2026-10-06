import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { db } from "./firebase.js";
import { initAuth, isAdmin, openAuth } from "./auth.js";
import { audioUrl, coverUrl, removeFiles, saveFiles } from "./media.js";

const $ = (id) => document.getElementById(id);
const audio = $("audio");

let user = null;
let tracks = [];
let filtered = [];
let current = -1;
let unsubscribe = null;
let request = 0;

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const time = (seconds) =>
  `${Math.floor((seconds || 0) / 60)}:${String(
    Math.floor((seconds || 0) % 60),
  ).padStart(2, "0")}`;

function toast(text, bad = false) {
  const element = $("toast");

  element.textContent = text;
  element.className = `toast${bad ? " error" : ""}`;

  clearTimeout(toast.t);
  toast.t = setTimeout(() => element.classList.add("hidden"), 3200);
}

function duration(file) {
  return new Promise((resolve, reject) => {
    const preview = new Audio();
    const url = URL.createObjectURL(file);

    preview.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(preview.duration) || 0);
    };

    preview.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("MP3 inválido."));
    };

    preview.src = url;
  });
}

async function setCover(img, track) {
  img.src = "";

  try {
    img.src = await coverUrl(track);
  } catch {
    img.removeAttribute("src");
  }
}

function filter() {
  const queryText = $("search").value.trim().toLowerCase();

  filtered = !queryText
    ? tracks
    : tracks.filter((track) =>
        [track.title, track.artist, track.album, track.genre].some((value) =>
          String(value || "").toLowerCase().includes(queryText),
        ),
      );

  render();
}

function render() {
  $("tracks").innerHTML = "";
  $("empty").classList.toggle("hidden", !!filtered.length);
  $("count").textContent = `${tracks.length} ${
    tracks.length === 1 ? "música" : "músicas"
  }`;

  filtered.forEach((track) => {
    const index = tracks.findIndex((item) => item.id === track.id);
    const row = document.createElement("div");

    row.className = `track${index === current ? " active" : ""}`;
    row.innerHTML = `
      <button class="rowPlay">
        ${index === current && !audio.paused ? "❚❚" : "▶"}
      </button>

      <div class="track-title">
        <img class="cover" alt="">
        <div class="meta">
          <strong>${esc(track.title)}</strong>
          <span>${esc(track.artist)}</span>
        </div>
      </div>

      <span class="cell">${esc(track.album || "—")}</span>
      <span class="cell">${esc(track.genre || "—")}</span>
      <span class="cell">${time(track.duration)}</span>

      ${
        isAdmin()
          ? '<button class="delete" title="Remover">×</button>'
          : "<span></span>"
      }
    `;

    setCover(row.querySelector("img"), track);

    row.querySelector(".rowPlay").onclick = () => toggle(index);
    row.querySelector(".track-title").onclick = () => toggle(index);
    row
      .querySelector(".delete")
      ?.addEventListener("click", () => remove(track));

    $("tracks").append(row);
  });
}

function subscribe() {
  unsubscribe?.();

  unsubscribe = onSnapshot(
    query(collection(db, "tracks"), orderBy("createdAt", "desc")),
    (snapshot) => {
      tracks = snapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data(),
        }))
        .filter((track) => track.kind === "track" || track.title);

      filter();
    },
    () => toast("Não foi possível carregar as músicas.", true),
  );
}

async function play(index) {
  const track = tracks[index];

  if (!track) return;

  const currentRequest = ++request;
  current = index;

  $("player").classList.remove("hidden");
  $("playerTitle").textContent = track.title;
  $("playerArtist").textContent = "Carregando...";

  setCover($("playerCover"), track);
  render();

  try {
    const url = await audioUrl(track, (progress) => {
      if (currentRequest === request) {
        $("playerArtist").textContent = `Carregando ${Math.round(
          progress * 100,
        )}%`;
      }
    });

    if (currentRequest !== request) return;

    $("playerArtist").textContent = track.artist;

    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }

    await audio.play();
  } catch (error) {
    toast(error.message || "Falha ao abrir o áudio.", true);
  }
}

function toggle(index) {
  if (index === current && audio.src) {
    audio.paused ? audio.play() : audio.pause();
    return;
  }

  play(index);
}

function step(direction) {
  if (!tracks.length) return;

  const next = current < 0 ? 0 : (current + direction + tracks.length) % tracks.length;
  play(next);
}

async function remove(track) {
  if (!confirm(`Remover “${track.title}”?`)) return;

  try {
    if (tracks[current]?.id === track.id) {
      audio.pause();
      audio.removeAttribute("src");
      current = -1;
      $("player").classList.add("hidden");
    }

    await removeFiles(track);
    await deleteDoc(doc(db, "tracks", track.id));

    toast("Música removida.");
  } catch {
    toast("Falha ao remover.", true);
  }
}

function adminError(text = "") {
  $("adminError").textContent = text;
  $("adminError").classList.toggle("hidden", !text);
}

async function addTrack(event) {
  event.preventDefault();
  adminError();

  if (!isAdmin()) {
    adminError("Apenas o administrador pode adicionar músicas.");
    return;
  }

  const audioFile = $("audioFile").files[0];
  const coverFile = $("coverFile").files[0];

  if (!audioFile || !coverFile) return;

  const reference = doc(collection(db, "tracks"));

  $("saveBtn").disabled = true;
  $("progress").classList.remove("hidden");
  $("progress").value = 0;

  try {
    const trackDuration = await duration(audioFile);
    const files = await saveFiles(
      reference.id,
      audioFile,
      coverFile,
      (progress) => {
        $("progress").value = Math.round(progress * 100);
      },
    );

    await setDoc(reference, {
      kind: "track",
      storageMode: "firestore-gzip-chunks",
      compression: "gzip",
      title: $("title").value.trim(),
      artist: $("artist").value.trim(),
      album: $("album").value.trim(),
      genre: $("genre").value.trim(),
      duration: trackDuration,
      audioMime: "audio/mpeg",
      coverMime: "image/jpeg",
      ...files,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });

    $("trackForm").reset();
    $("adminDialog").close();

    toast("Música adicionada.");
  } catch (error) {
    adminError(error.message || "Falha ao adicionar a música.");
  } finally {
    $("saveBtn").disabled = false;
    $("progress").classList.add("hidden");
  }
}

function authChanged(nextUser) {
  user = nextUser;

  const logged = !!user;
  const admin = isAdmin(user);

  $("authBtn").classList.toggle("hidden", logged);
  $("logoutBtn").classList.toggle("hidden", !logged);
  $("addBtn").classList.toggle("hidden", !admin);
  $("adminBadge").classList.toggle("hidden", !admin);
  $("loginNotice").classList.toggle("hidden", logged);
  $("library").classList.toggle("hidden", !logged);

  if (logged) {
    subscribe();
    return;
  }

  unsubscribe?.();
  unsubscribe = null;
  tracks = [];
  filtered = [];
  current = -1;

  audio.pause();
  audio.removeAttribute("src");

  $("player").classList.add("hidden");
  $("count").textContent = "Entre para carregar as músicas.";
}

$("search").oninput = filter;

$("addBtn").onclick = () => $("adminDialog").showModal();
$("trackForm").onsubmit = addTrack;

$("playAllBtn").onclick = () =>
  user
    ? tracks.length
      ? toggle(current >= 0 ? current : 0)
      : toast("Nenhuma música no catálogo.")
    : openAuth();

$("playBtn").onclick = () =>
  current < 0 ? step(1) : audio.paused ? audio.play() : audio.pause();

$("prevBtn").onclick = () => step(-1);
$("nextBtn").onclick = () => step(1);

audio.onplay = () => {
  $("playBtn").textContent = "❚❚";
  render();
};

audio.onpause = () => {
  $("playBtn").textContent = "▶";
  render();
};

audio.onended = () => step(1);

audio.ontimeupdate = () => {
  const total = audio.duration || 0;

  $("current").textContent = time(audio.currentTime);
  $("duration").textContent = time(total);
  $("seek").value = total ? (audio.currentTime / total) * 100 : 0;
};

$("seek").oninput = () => {
  if (audio.duration) {
    audio.currentTime = (audio.duration * $("seek").value) / 100;
  }
};

document.querySelectorAll("[data-close]").forEach((button) => {
  button.onclick = () => button.closest("dialog").close();
});

initAuth(authChanged);

