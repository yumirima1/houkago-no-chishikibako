export type EPaperSlot = 0 | 1;
export const EPAPER_DB = "observer-room-epaper-v1";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STORED_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export function validateImageFile(file: Pick<Blob, "type" | "size">) {
  if (!TYPES.includes(file.type)) throw new Error("PNG・JPEG・WebPの画像を選んでください。");
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("画像は10MB以下で選んでください。");
}

export function matchesImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function prepareEPaperImage(file: Blob): Promise<Blob> {
  validateImageFile(file);
  if (!matchesImageSignature(file.type, new Uint8Array(await file.slice(0, 16).arrayBuffer()))) throw new Error("画像の形式が正しくありません。");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("画像を読み込めませんでした。別の画像を選んでください。"); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24_000_000) throw new Error("画像は2400万画素以下で選んでください。");
    const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1500;
    const context = canvas.getContext("2d"); if (!context) throw new Error("画像を準備できませんでした。");
    context.fillStyle = "#e0dfd2"; context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale, height = bitmap.height * scale;
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const result = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("画像を変換できませんでした。")), "image/webp", 0.86));
    if (result.size > MAX_STORED_BYTES) throw new Error("画像を小さくしてから、もう一度選んでください。");
    return result;
  } finally { bitmap.close(); }
}

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(EPAPER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("別のタブを閉じてから再試行してください。")); };
  });
}

export async function readEPaperImages(): Promise<[Blob | null, Blob | null]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("images", "readonly"), store = transaction.objectStore("images");
      const requests = [store.get(0), store.get(1)];
      transaction.oncomplete = () => resolve(requests.map(request => {
        const value: unknown = request.result;
        return value instanceof Blob && TYPES.includes(value.type) && value.size > 0 && value.size <= MAX_STORED_BYTES ? value : null;
      }) as [Blob | null, Blob | null]);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function writeEPaperImage(slot: EPaperSlot, image: Blob | null) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("images", "readwrite"), store = transaction.objectStore("images");
      if (image) store.put(image, slot); else store.delete(slot);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
