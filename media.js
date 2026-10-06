import {
  Bytes,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { db } from "./firebase.js";

const CHUNK = 700 * 1024;
const MAX_AUDIO = 15 * 1024 * 1024;
const cache = new Map();

const id = (track, type, index) =>
  `${type}chunk-${track}-${String(index).padStart(4, "0")}`;

const join = (parts) => {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);

  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
};

async function gzip(bytes, decode = false) {
  const Stream = decode ? DecompressionStream : CompressionStream;

  if (typeof Stream !== "function") {
    throw new Error("Atualize o navegador para usar compressão GZIP.");
  }

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new Stream("gzip"));

  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function coverBytes(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("A capa precisa ser uma imagem.");
  }

  const url = URL.createObjectURL(file);
  const image = new Image();

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });

  URL.revokeObjectURL(url);

  const scale = Math.min(
    1,
    600 / Math.max(image.naturalWidth, image.naturalHeight),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  canvas
    .getContext("2d")
    .drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Falha ao comprimir a capa.")),
      "image/jpeg",
      0.72,
    );
  });

  return new Uint8Array(await blob.arrayBuffer());
}

async function save(track, type, bytes, progress = () => {}) {
  const zipped = await gzip(bytes);
  const parts = [];

  for (let index = 0; index < zipped.length; index += CHUNK) {
    parts.push(zipped.slice(index, index + CHUNK));
  }

  for (let index = 0; index < parts.length; index += 1) {
    await setDoc(doc(db, "tracks", id(track, type, index)), {
      kind: `${type}Chunk`,
      trackId: track,
      index,
      bytes: Bytes.fromUint8Array(parts[index]),
    });

    progress((index + 1) / parts.length);
  }

  return {
    count: parts.length,
    original: bytes.length,
    compressed: zipped.length,
  };
}

async function load(track, type, count, progress = () => {}) {
  const parts = [];

  for (let index = 0; index < count; index += 1) {
    const snapshot = await getDoc(
      doc(db, "tracks", id(track, type, index)),
    );

    if (!snapshot.exists()) {
      throw new Error("Arquivo incompleto no Firestore.");
    }

    parts.push(snapshot.data().bytes.toUint8Array());
    progress((index + 1) / count);
  }

  return gzip(join(parts), true);
}

export async function saveFiles(
  track,
  audio,
  cover,
  progress = () => {},
) {
  if (audio.size > MAX_AUDIO) {
    throw new Error("O MP3 pode ter no máximo 15 MB.");
  }

  const audioBytes = new Uint8Array(await audio.arrayBuffer());
  const savedAudio = await save(track, "audio", audioBytes, (value) => {
    progress(value * 0.8);
  });

  const coverData = await coverBytes(cover);
  const savedCover = await save(track, "cover", coverData, (value) => {
    progress(0.8 + value * 0.2);
  });

  return {
    audioChunkCount: savedAudio.count,
    coverChunkCount: savedCover.count,
    audioOriginalSize: savedAudio.original,
    audioCompressedSize: savedAudio.compressed,
    coverCompressedSize: savedCover.compressed,
  };
}

export async function audioUrl(track, progress = () => {}) {
  const key = `a:${track.id}`;

  if (cache.has(key)) {
    return cache.get(key);
  }

  const bytes = await load(
    track.id,
    "audio",
    track.audioChunkCount,
    progress,
  );

  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "audio/mpeg",
    }),
  );

  cache.set(key, url);
  return url;
}

export async function coverUrl(track) {
  const key = `c:${track.id}`;

  if (cache.has(key)) {
    return cache.get(key);
  }

  const bytes = await load(track.id, "cover", track.coverChunkCount);
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "image/jpeg",
    }),
  );

  cache.set(key, url);
  return url;
}

export async function removeFiles(track) {
  const files = [
    ["audio", track.audioChunkCount],
    ["cover", track.coverChunkCount],
  ];

  for (const [type, count] of files) {
    for (let index = 0; index < (count || 0); index += 1) {
      await deleteDoc(doc(db, "tracks", id(track.id, type, index)));
    }
  }

  for (const key of [`a:${track.id}`, `c:${track.id}`]) {
    const url = cache.get(key);

    if (url) {
      URL.revokeObjectURL(url);
    }

    cache.delete(key);
  }
}
