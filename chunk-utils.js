// Fica com folga abaixo do limite de ~1 MiB por documento do Firestore.
export const FIRESTORE_CHUNK_BYTES = 700 * 1024;

export function getChunkCount(size) {
  if (!Number.isFinite(size) || size <= 0) return 0;
  return Math.ceil(size / FIRESTORE_CHUNK_BYTES);
}

export function getAssetChunkId(trackId, assetType, index) {
  const prefix = assetType === "cover" ? "coverchunk" : "audiochunk";
  return `${prefix}-${trackId}-${String(index).padStart(4, "0")}`;
}

export function splitIntoChunks(bytes) {
  const chunks = [];
  for (let start = 0; start < bytes.byteLength; start += FIRESTORE_CHUNK_BYTES) {
    chunks.push(bytes.slice(start, Math.min(bytes.byteLength, start + FIRESTORE_CHUNK_BYTES)));
  }
  return chunks;
}

// Compatibilidade com músicas gravadas pela versão anterior.
export const AUDIO_CHUNK_BYTES = FIRESTORE_CHUNK_BYTES;
export const getAudioChunkCount = getChunkCount;
export function getAudioChunkId(trackId, index) {
  return getAssetChunkId(trackId, "audio", index);
}
export function getAudioChunkRange(fileSize, index) {
  const start = index * FIRESTORE_CHUNK_BYTES;
  return { start, end: Math.min(fileSize, start + FIRESTORE_CHUNK_BYTES) };
}
