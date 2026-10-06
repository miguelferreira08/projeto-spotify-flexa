export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const MAX_COVER_INPUT_BYTES = 10 * 1024 * 1024;
export const COVER_TARGET_BYTES = 220 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível processar a capa."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível comprimir a capa."));
    }, "image/jpeg", quality);
  });
}

export async function compressCoverToBlob(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("A capa precisa ser uma imagem JPG, PNG ou WEBP.");
  }
  if (file.size > MAX_COVER_INPUT_BYTES) {
    throw new Error("A imagem original deve ter no máximo 10 MB.");
  }

  const image = await loadImage(file);
  const maxDimension = 640;
  const baseScale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));

  let width = Math.max(1, Math.round(image.naturalWidth * baseScale));
  let height = Math.max(1, Math.round(image.naturalHeight * baseScale));
  let quality = 0.84;
  let bestBlob = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Seu navegador não conseguiu preparar a capa.");

    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, quality);
    bestBlob = blob;
    if (blob.size <= COVER_TARGET_BYTES) break;

    if (quality > 0.56) quality -= 0.08;
    else {
      width = Math.max(240, Math.round(width * 0.82));
      height = Math.max(240, Math.round(height * 0.82));
    }
  }

  if (!bestBlob || bestBlob.size > 360 * 1024) {
    throw new Error("A capa ficou grande demais mesmo após a compressão. Tente outra imagem.");
  }

  return bestBlob;
}
