export const COMPRESSION_FORMAT = "gzip";

export function compressionSupported() {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

function assertCompressionSupport() {
  if (!compressionSupported()) {
    throw new Error("Seu navegador não suporta compressão GZIP nativa. Atualize o Chrome, Edge, Firefox ou Safari.");
  }
}

async function streamToUint8Array(stream) {
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function gzipCompress(input) {
  assertCompressionSupport();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const source = new Blob([bytes]).stream();
  return streamToUint8Array(source.pipeThrough(new CompressionStream(COMPRESSION_FORMAT)));
}

export async function gzipDecompress(input) {
  assertCompressionSupport();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const source = new Blob([bytes]).stream();
  return streamToUint8Array(source.pipeThrough(new DecompressionStream(COMPRESSION_FORMAT)));
}

export function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }

  return merged;
}

export function compressionRatio(originalBytes, compressedBytes) {
  if (!originalBytes) return 0;
  return compressedBytes / originalBytes;
}
