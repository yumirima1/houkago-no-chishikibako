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

## 制作パイプライン

v0.3 ではローカルで動く半自動の制作フローを用意しています。

```bash
npm run episode:generate -- --title "AIは本当に考えているのか" --theme "AIと思考" --minutes 5
npm run episode:review
npm run episode:build
```

まとめて実行:

```bash
npm run episode:pipeline
```

VOICEVOX Engine が起動している場合は、原稿生成から音声生成、掲載データ作成まで一括で実行できます。

```bash
npm run episode:publish
```

生成物:

- `content/drafts/`: 原稿JSON
- `content/reviewed/`: 簡易校閲済みJSON
- `generated-audio/`: 発話ごとのWAVと結合済みWAV
- `content/episodes/`: 掲載用メタデータ
- `public/audio/`: エピソード音声
- `src/data/generatedEpisodes.ts`: サイトへ読み込む生成済みエピソード一覧

VOICEVOX の接続先と話者IDは環境変数で変更できます。

```bash
VOICEVOX_ENDPOINT=http://127.0.0.1:50021
VOICEVOX_RIKEI_SPEAKER_ID=3
VOICEVOX_BUNKEI_SPEAKER_ID=2
```
