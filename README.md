# 考察箱

旧名称：放課後の知識箱。表示名称のみ変更し、ローカルフォルダ名・GitHubリポジトリ名・保存済み音声は維持しています。

雨、夜、ローファイの空気で聞ける知的ラジオと、出典を残して調べるローカル調査システムです。

既存の放送・3D空間・キャラクターは維持しています。公開エピソードは従来どおり TypeScript の配列で管理し、調査データはローカルのSQLiteとMarkdownに保存します。調査APIは開発環境のloopback接続、または明示的に有効化したローカル本番環境だけで使用します。音声ファイルは制作パイプラインで `public/audio/<episode-id>.mp3` に生成します。

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

3DルームのGLB書き出しAPIは、開発環境で明示的に許可した場合だけ有効です。

```bash
ROOM_EXPORT_ENABLED=1 npm run dev
```

本番環境ではこのAPIは常に拒否されます。

## エピソード管理

エピソード情報は `src/data/episodes.ts` にあります。

```ts
{
  title: "タイトル",
  description: "説明文",
  audioUrl: "/audio/episode-000.mp3",
  type: "regular",
  durationType: "normal",
  publishedAt: "2026-05-31",
  duration: "04:20",
  tags: ["AI", "哲学"],
  themes: ["AI", "哲学"]
}
```

`type` は `regular` / `special` / `news` / `movie` / `weather` / `anniversary` を想定しています。`durationType` は `normal` と `long` です。未指定でもサイト側でフォールバックします。

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

週刊更新の候補と確認メモを作る場合:

```bash
npm run episode:weekly
```

生成物:

- `content/drafts/`: 原稿JSON
- `content/reviewed/`: 簡易校閲済みJSON
- `generated-audio/`: 発話ごとのWAVと結合済みWAV
- `content/episodes/`: 掲載用メタデータ
- `content/memory/program-memory.json`: 番組記憶
- `content/memory/weekly-plan.json`: 週刊更新候補
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

音声生成時は、落ち着きを保ちながら退屈になりにくいように、話速をやや上げ、発話間ポーズは約280msにしています。

## 考察箱

独立バックグラウンドは `npm.cmd run kousatsu:backend -- health` と `audit` で確認できます。現在は公式RSS7件から関心・未解決の問いに応じて対象を選び、日本時間06:00・18:00・22:00、1日最大3枠で期限なく運転します。`D:\AI\KousatsuData` に記事・考察・仮説・記憶・次の調査計画を保存します。現在ユーザーのタスクは `KousatsuBackend-3B15A24B0D`。起動・停止・バックアップ・公開検証と残る制約は [継続運転と検証](docs/BACKGROUND_OPERATION.md) を参照してください。以下の既存ローカルCLI/UI設定は互換性のため別に維持しています。

本文取得・引用検査を維持し、情報が不完全でも「見解・理由・別の説明・修正条件」を残すように変更しました。見解は事実と分けて保存します。NASA・国連・文化記事の比較と限界は [考察生成の修正報告](docs/REFLECTION_GENERATION_REVISION.md) を参照してください。前段階の記録は [研究品質の改善報告](docs/RESEARCH_QUALITY_IMPROVEMENT.md) に保持しています。

RSS/Atomの記録から、構造・出典参照を検査したMarkdown下書きまでを作ります。独立した事実確認は行っていません。Node.js 24以上（内蔵SQLite/FTS5）が必要です。

既存ルームの「端末」「メモ」と、モバイルの「観察箱」から、実行履歴・ノート・解釈と仮説の時間軸を閲覧できます。実行中の処理段階を部屋の状態表示へ反映します。

```powershell
npm.cmd run dev:local
# 別の端末で継続収集（出典設定が空なら外部通信しません）
npm.cmd run kousatsu:worker
```

出典は `config/kousatsu-sources.json` で設定します。初期の空配列は維持しており、勝手に収集先を追加しません。設定・復旧・停止・隔離検証の手順は [ローカル調査の運用](docs/LOCAL_RESEARCH_RUNTIME.md)、ブラウザ保存の互換性は [観察記録の保存](docs/OBSERVATION_STORAGE.md) を参照してください。

最新の実装範囲・検証結果・未確認事項は [自律開発の実装・検証記録](docs/AUTONOMOUS_DEVELOPMENT_PROGRESS.md) にまとめています。実ブラウザ・3D描画・音声再生を含む全体の完成はまだ確認していません。

外部アクセスをしない一連の動作確認:

```bash
npm run kousatsu -- run --topic "AI検証" --fixture tests/fixtures/kousatsu-sample.rss.xml
```

主なコマンド:

```bash
npm run kousatsu -- init
npm run kousatsu -- status
npm run kousatsu -- search --query "AI検証"
npm run kousatsu -- resume --job <job-id>
npm run kousatsu -- recover --stale-minutes 30
npm run kousatsu -- backup --output backups/kousatsu.sqlite
npm run test:kousatsu
```

既定では料金もモデルも不要な決定的Providerを使います。インストール済みのOllamaモデルを明示して使う場合だけ、次を設定します。モデルの自動ダウンロードは行いません。

```bash
KOUSATSU_AI_PROVIDER=ollama
KOUSATSU_OLLAMA_MODEL=<installed-model-name>
```

従来CLIのDBは `data/kousatsu/kousatsu.sqlite`、記事と検証結果は `content/kousatsu/articles/` に生成され、どちらもGit管理外です。自律バックグラウンドの正本は `D:\AI\KousatsuData` にあります。

自律処理で保存された公開対象の考察は、公開用JSON・Markdownだけを `main` へ自動反映し、GitHub Actionsの検証後に [GitHub Pages](https://yumirima1.github.io/houkago-no-chishikibako/) へ配信します。部屋のCRTから「考察アーカイブ」を開いて読めます。SQLite・取得本文・内部ログ・認証情報は配信しません。公開対象は根拠参照と構造検査を通った見解で、同じ出典の過去の試行を重複掲載しません。モデル・ルール分析・併用を区別して表示します。

実行は日本時間06:00・18:00・22:00の最大3枠です。現在の設定は `continuous: true / endsAt: null` で、停止するまで継続します。停止・再開方法と検証手順は [継続運転と検証](docs/BACKGROUND_OPERATION.md) を参照してください。設計と安全条件は `docs/KOUSATSU_ARCHITECTURE.md` にあります。
