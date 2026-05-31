# 放課後の知識箱

雨、夜、ローファイの空気で聞ける知的ラジオサイトです。

公開を優先し、DB やログインは使わず、エピソード情報は TypeScript の配列で管理します。音声ファイルは制作パイプラインで `public/audio/<episode-id>.mp3` に生成します。

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
  audioUrl: "/audio/episode-000.mp3",
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

VOICEVOX Engine が起動している場合は、原稿生成から音声生成、掲載データ作成まで一括で実行できます。

```bash
npm run episode:pipeline
```

同じ流れを公開用の名前で実行する場合:

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
VOICEVOX_RIKEI_SPEAKER_ID=13
VOICEVOX_BUNKEI_SPEAKER_ID=8
```

現在の既定値は、落ち着いた初回体験に寄せて以下にしています。

- `rikei`: 青山龍星 / ノーマル / speaker id `13`
- `bunkei`: 春日部つむぎ / ノーマル / speaker id `8`

音声生成時に、話速を少し落とし、発話前後と発話間に短いポーズを入れます。
