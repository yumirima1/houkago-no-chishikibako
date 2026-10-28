"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { prepareEPaperImage, readEPaperImages, writeEPaperImage, type EPaperSlot } from "./epaperStorage";
import styles from "./observer-room.module.css";

type Images = [string | null, string | null];
const EPaperContext = createContext<{ images: Images; busy: boolean; error: string; message: string; ready: boolean; change: (slot: EPaperSlot, file: File | null) => Promise<void> } | null>(null);

export function EPaperProvider({ children }: { children: ReactNode }) {
  const [images, setImages] = useState<Images>([null, null]);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const urls = useRef<Images>([null, null]), lock = useRef(false), mounted = useRef(false);
  useEffect(() => {
    let active = true; mounted.current = true;
    readEPaperImages().then(async blobs => {
      const checked = await Promise.all(blobs.map(async blob => {
        if (!blob) return null;
        try { const bitmap = await createImageBitmap(blob); const valid = bitmap.width * bitmap.height <= 24_000_000; bitmap.close(); return valid ? blob : null; } catch { return null; }
      }));
      if (!active) return;
      urls.current = checked.map(blob => blob ? URL.createObjectURL(blob) : null) as Images; setImages([...urls.current]);
      if (blobs.some((blob, i) => blob && !checked[i])) setError("保存画像を読み込めませんでした。画像を選び直してください。");
    }).catch(() => { if (active) setError("このブラウザでは画像保存を利用できません。設定を確認して再読み込みしてください。"); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; mounted.current = false; urls.current.forEach(url => { if (url) URL.revokeObjectURL(url); }); };
  }, []);
  async function change(slot: EPaperSlot, file: File | null) {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const blob = file ? await prepareEPaperImage(file) : null;
      await writeEPaperImage(slot, blob);
      if (!mounted.current) return;
      if (urls.current[slot]) URL.revokeObjectURL(urls.current[slot]!);
      urls.current[slot] = blob ? URL.createObjectURL(blob) : null; setImages([...urls.current]);
      setMessage(`電子ペーパー${slot + 1}の${blob ? "画像を保存しました。" : "画像を初期表示に戻しました。"}`);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof DOMException && reason.name === "QuotaExceededError" ? "保存容量が不足しています。ブラウザの空き容量を確認してください。" : reason instanceof Error ? reason.message : "画像を保存できませんでした。");
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <EPaperContext.Provider value={{ images, busy, ready, error, message, change }}>{children}</EPaperContext.Provider>;
}

export function EPaperSettings() {
  const state = useContext(EPaperContext);
  if (!state) return null;
  return <details className={styles.epaperSettings}>
    <summary>壁の電子ペーパー</summary>
    <p>2枚を個別に設定できます。PNG・JPEG・WebP、10MB・2400万画素まで。画像全体を枠に収め、このブラウザ内だけに保存します。</p>
    {([0, 1] as const).map(slot => <fieldset key={slot} disabled={state.busy || !state.ready}>
      <legend>電子ペーパー{slot + 1}</legend>
      {state.images[slot] && <span role="img" aria-label={`電子ペーパー${slot + 1}の保存画像`} className={styles.epaperPreview} style={{ backgroundImage: `url("${state.images[slot]}")` }} />}
      <label>画像を選ぶ<input type="file" aria-label={`電子ペーパー${slot + 1}の画像`} accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void state.change(slot, file); }} /></label>
      <button type="button" disabled={!state.images[slot]} onClick={() => void state.change(slot, null)}>電子ペーパー{slot + 1}を初期表示に戻す</button>
    </fieldset>)}
    <p role="status">{state.busy ? "画像を保存しています…" : state.message}</p>
    {state.error && <p role="alert">{state.error}</p>}
  </details>;
}

export function useEPaperImages() {
  return useContext(EPaperContext)?.images ?? [null, null];
}
