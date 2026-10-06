import {
  Bytes,
  deleteDoc,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase.js";
import {
  getAssetChunkId,
  getAudioChunkId,
  splitIntoChunks
} from "./chunk-utils.js";
import {
  concatUint8Arrays,
  gzipCompress,
  gzipDecompress
} from "./compression.js";
import { compressCoverToBlob } from "./file-utils.js";

const audioUrlCache = new Map();
const coverUrlCache = new Map();

async function saveCompressedAsset(trackId, assetType, sourceBytes, onProgress = () => {}) {
  onProgress(0.04);
  const compressed = await gzipCompress(sourceBytes);
  onProgress(0.18);
  const chunks = splitIntoChunks(compressed);
  const savedIds = [];

  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkId = getAssetChunkId(trackId, assetType, index);
      await setDoc(doc(db, "tracks", chunkId), {
        kind: assetType === "audio" ? "audioChunk" : "coverChunk",
        trackId,
        assetType,
        index,
        compression: "gzip",
        bytes: Bytes.fromUint8Array(chunks[index])
      });
      savedIds.push(chunkId);
      onProgress(0.18 + ((index + 1) / chunks.length) * 0.82);
    }
  } catch (error) {
    await Promise.allSettled(savedIds.map((id) => deleteDoc(doc(db, "tracks", id))));
    throw error;
  }

  return {
    chunkCount: chunks.length,
    compressedSize: compressed.byteLength,
    originalSize: sourceBytes.byteLength
  };
}

async function loadAssetChunks(trackId, assetType, count, onProgress = () => {}) {
  const chunkCount = Number(count) || 0;
  if (!chunkCount) throw new Error(`O arquivo de ${assetType === "audio" ? "áudio" : "capa"} não foi encontrado.`);

  const parts = new Array(chunkCount);
  let completed = 0;
  let cursor = 0;
  const concurrency = Math.min(4, chunkCount);

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= chunkCount) return;
      const id = getAssetChunkId(trackId, assetType, index);
      const snap = await getDoc(doc(db, "tracks", id));
      if (!snap.exists()) throw new Error(`Parte ${index + 1} de ${assetType} não encontrada.`);

      const field = snap.data()?.bytes;
      if (!field?.toUint8Array) throw new Error("Arquivo inválido no Firestore.");
      parts[index] = field.toUint8Array();
      completed += 1;
      onProgress(completed / chunkCount);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return concatUint8Arrays(parts);
}

async function loadLegacyAudioChunks(trackId, count, onProgress = () => {}) {
  const chunkCount = Number(count) || 0;
  const parts = new Array(chunkCount);
  for (let index = 0; index < chunkCount; index += 1) {
    const snap = await getDoc(doc(db, "tracks", getAudioChunkId(trackId, index)));
    if (!snap.exists()) throw new Error(`Trecho ${index + 1} do áudio não foi encontrado.`);
    const field = snap.data()?.bytes;
    if (!field?.toUint8Array) throw new Error("Trecho de áudio inválido no Firestore.");
    parts[index] = field.toUint8Array();
    onProgress((index + 1) / chunkCount);
  }
  return concatUint8Arrays(parts);
}

export async function saveAudioCompressed(trackId, file, onProgress = () => {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return saveCompressedAsset(trackId, "audio", bytes, onProgress);
}

export async function saveCoverCompressed(trackId, file, onProgress = () => {}) {
  const preparedBlob = await compressCoverToBlob(file);
  const bytes = new Uint8Array(await preparedBlob.arrayBuffer());
  const result = await saveCompressedAsset(trackId, "cover", bytes, onProgress);
  return {
    ...result,
    inputSize: file.size,
    mime: preparedBlob.type || "image/jpeg"
  };
}

export async function getAudioObjectUrl(track, onProgress = () => {}) {
  if (track.audioURL) return track.audioURL;
  const cached = audioUrlCache.get(track.id);
  if (cached) return cached;

  let audioBytes;
  if (track.storageMode === "firestore-gzip-chunks") {
    const compressed = await loadAssetChunks(track.id, "audio", track.audioChunkCount, (fraction) => {
      onProgress(fraction * 0.78);
    });
    onProgress(0.82);
    audioBytes = await gzipDecompress(compressed);
    onProgress(1);
  } else {
    // Compatibilidade com faixas gravadas antes da compressão GZIP.
    audioBytes = await loadLegacyAudioChunks(track.id, track.audioChunkCount, onProgress);
  }

  const blob = new Blob([audioBytes], { type: track.audioMime || "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  audioUrlCache.set(track.id, url);
  return url;
}

export async function getCoverObjectUrl(track) {
  if (track.coverDataUrl) return track.coverDataUrl;
  if (track.coverURL) return track.coverURL;
  const cached = coverUrlCache.get(track.id);
  if (cached) return cached;
  if (!track.coverChunkCount) return "./assets/redbeat-logo.png";

  const compressed = await loadAssetChunks(track.id, "cover", track.coverChunkCount);
  const bytes = track.storageMode === "firestore-gzip-chunks"
    ? await gzipDecompress(compressed)
    : compressed;
  const blob = new Blob([bytes], { type: track.coverMime || "image/jpeg" });
  const url = URL.createObjectURL(blob);
  coverUrlCache.set(track.id, url);
  return url;
}

async function deleteAssetChunks(trackId, assetType, chunkCount) {
  const count = Number(chunkCount) || 0;
  for (let index = 0; index < count; index += 1) {
    await deleteDoc(doc(db, "tracks", getAssetChunkId(trackId, assetType, index)));
  }
}

export async function deleteTrackAssets(track) {
  const tasks = [];
  if (track.audioChunkCount) tasks.push(deleteAssetChunks(track.id, "audio", track.audioChunkCount));
  if (track.coverChunkCount) tasks.push(deleteAssetChunks(track.id, "cover", track.coverChunkCount));
  await Promise.all(tasks);
  releaseTrackObjectUrls(track.id);
}

// Alias para compatibilidade com código antigo.
export async function deleteAudioChunks(trackId, chunkCount) {
  await deleteAssetChunks(trackId, "audio", chunkCount);
  releaseAudioObjectUrl(trackId);
}

export function releaseAudioObjectUrl(trackId) {
  const url = audioUrlCache.get(trackId);
  if (url) URL.revokeObjectURL(url);
  audioUrlCache.delete(trackId);
}

export function releaseTrackObjectUrls(trackId) {
  releaseAudioObjectUrl(trackId);
  const coverUrl = coverUrlCache.get(trackId);
  if (coverUrl) URL.revokeObjectURL(coverUrl);
  coverUrlCache.delete(trackId);
}

export function clearMediaObjectUrls() {
  for (const url of audioUrlCache.values()) URL.revokeObjectURL(url);
  for (const url of coverUrlCache.values()) URL.revokeObjectURL(url);
  audioUrlCache.clear();
  coverUrlCache.clear();
}

export const clearAudioObjectUrls = clearMediaObjectUrls;
