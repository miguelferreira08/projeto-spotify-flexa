export function initials(value = "R") {
  return (value.trim()[0] || "R").toUpperCase();
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export function formatLibraryDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.max(1, Math.round((seconds % 3600) / 60));
  return hours ? `${hours}h ${minutes}min` : `${minutes} min`;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;"
  }[char]));
}

export function safeExtension(file, fallback) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(ext || "") ? ext : fallback;
}

export function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(duration) ? Math.round(duration) : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler a duração do MP3."));
    };
    audio.src = objectUrl;
  });
}
