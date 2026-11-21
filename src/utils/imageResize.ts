export interface SquareCropRect {
  sx: number;
  sy: number;
  sSize: number;
  targetSize: number;
}

export function computeSquareCropRect(
  width: number,
  height: number,
  targetSize = 512
): SquareCropRect {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const sSize = Math.min(safeW, safeH);
  const sx = Math.floor((safeW - sSize) / 2);
  const sy = Math.floor((safeH - sSize) / 2);
  return {
    sx,
    sy,
    sSize,
    targetSize: Math.max(64, Math.min(1024, Math.round(targetSize))),
  };
}

export async function resizeImageFileToCoverDataUrl(
  file: File,
  targetSize = 512
): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)) {
    throw new Error('Выберите изображение (JPG, PNG, WebP)');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      el.src = objectUrl;
    });

    const crop = computeSquareCropRect(img.naturalWidth || img.width, img.naturalHeight || img.height, targetSize);
    const canvas = document.createElement('canvas');
    canvas.width = crop.targetSize;
    canvas.height = crop.targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D недоступен');
    }
    ctx.drawImage(
      img,
      crop.sx,
      crop.sy,
      crop.sSize,
      crop.sSize,
      0,
      0,
      crop.targetSize,
      crop.targetSize
    );

    let dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    if (dataUrl.length > 180_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.74);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
