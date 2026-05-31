# 放課後の知識箱

雨、夜、ローファイの空気で聞ける知的ラジオサイトです。

v0.1 では公開を優先し、DB やログインは使わず、エピソード情報は TypeScript の配列で管理します。音声ファイルは `public/audio/sample.mp3` を差し替えるだけで更新できます。

## 開発

```bash
npm run dev
```

ローカル確認:

```text
http://localhost:3000
```

## ビルド

```bash
npm run build
```

## エピソード管理

エピソード情報は `src/data/episodes.ts` にあります。

```ts
{
  title: "タイトル",
  description: "説明文",
  audioUrl: "/audio/sample.mp3",
  publishedAt: "2026-05-31",
  duration: "04:20",
  themes: ["AI", "哲学"]
}
```
