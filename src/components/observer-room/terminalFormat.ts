export function safeSourceUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
/** Decode titles for display only; saved records and downloads remain unchanged. */
export function readableTitle(value: string) {
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (original, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? original;
    const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : original;
  });
}
export function date(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "日時の記録なし";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function apiMessage(status: number) {
  return status === 403 ? "この端末はローカル環境で利用できます。本番起動時は既存のローカル閲覧設定を確認してください。"
    : "保存データを読み込めませんでした。時間をおいて再読込してください。";
}
