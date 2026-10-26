import * as THREE from "three";

/**
 * プロシージャルPBRテクスチャジェネレーター
 * 外部画像のダウンロード失敗リスクを排除し、オフラインでも最高品質のPBR質感を提供します。
 */

// 木目テクスチャ（床・家具用）
export function createWoodTexture(
  baseHex = "#5a3d28",
  grainHex = "#3d2717",
  width = 512,
  height = 512
): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    return new THREE.CanvasTexture({} as HTMLCanvasElement);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    // ベースカラー
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, width, height);

    // 木目の年輪・筋
    ctx.strokeStyle = grainHex;
    ctx.lineWidth = 1.5;

    for (let i = 0; i < 180; i++) {
      const y = Math.random() * height;
      const alpha = 0.05 + Math.random() * 0.12;
      ctx.strokeStyle = grainHex;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, y);

      let prevX = 0;
      let prevY = y;
      for (let x = 30; x <= width; x += 30) {
        const wave = Math.sin((x / width) * Math.PI * 4 + i) * 6;
        const curY = y + wave + (Math.random() - 0.5) * 3;
        ctx.quadraticCurveTo(prevX, prevY, x, curY);
        prevX = x;
        prevY = curY;
      }
      ctx.stroke();
    }

    // 微細な木の道管（繊維）ノイズ
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    for (let p = 0; p < d.length; p += 4) {
      const n = (Math.random() - 0.5) * 12;
      d[p] = Math.min(255, Math.max(0, d[p] + n));
      d[p + 1] = Math.min(255, Math.max(0, d[p + 1] + n * 0.8));
      d[p + 2] = Math.min(255, Math.max(0, d[p + 2] + n * 0.6));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// 漆喰壁用ノーマル/バンプテクスチャ
export function createPlasterTexture(width = 256, height = 256): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    return new THREE.CanvasTexture({} as HTMLCanvasElement);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 28;
      const val = Math.min(255, Math.max(0, 128 + noise));
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

// リネン・ファブリック用テクスチャ（ベッド・クッション）
export function createFabricTexture(
  colorHex = "#4a5d4e",
  width = 256,
  height = 256
): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    return new THREE.CanvasTexture({} as HTMLCanvasElement);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}
