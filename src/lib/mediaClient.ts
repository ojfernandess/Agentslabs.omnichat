import imageCompression from 'browser-image-compression';

/** Compressão no browser antes de enviar à Edge `process-media`. */
export async function compressImageFileForUpload(file: File): Promise<string> {
  const options = {
    maxSizeMB: 1.2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  };
  const compressed = await imageCompression(file, options);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}
