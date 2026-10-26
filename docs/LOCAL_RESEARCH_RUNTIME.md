# 考察箱のローカル調査を動かす

2026-10-26: Dドライブへの独立バックグラウンドとOSタスクの手順は [AUTONOMOUS_BACKEND.md](AUTONOMOUS_BACKEND.md) を参照。この文書以下は従来CLI/UIの互換運用を説明し、自律運用のジョブは専用 `kousatsu:backend` コマンドで操作する。

Node.js 24以上が必要。放送エピソード・3Dモデル・既存観察履歴を置換せず、既存の収集パイプラインをルームの端末・メモへ接続する。外部公開・OSタスク登録は行わない。

## 起動と出典

```powershell
npm.cmd run dev:local
# 継続収集する間、別の端末で実行
npm.cmd run kousatsu:worker
```

`config/kousatsu-sources.json` の `sources` は初期状態では空。利用条件を確認したRSS/Atomだけを登録する。例えば公式にRSSを案内している [NASA](https://www.nasa.gov/rss-feeds/) の記事タイトル・URLを保存する設定は次の形になる。これは設定例で、実ファイルには追加していない。

```json
{
  "sources": [{
    "id": "nasa-news",
    "name": "NASA News",
    "feedUrl": "https://www.nasa.gov/news-release/feed/",
    "topic": "NASA",
    "contentPolicy": "metadata-only",
    "intervalMinutes": 360,
    "enabled": false
  }]
}
```

収集を選んだ出典だけ `enabled:true` とする。間隔は15分以上。既存IDのfeed URLは変更せず、別の出典IDを使う。本文は取得せず、metadata-onlyではフィード内の要約も保存しない。画像・音声・ロゴの取得や転載はこの機能に含まない。

ワーカーは開始時の設定を固定する。設定変更時はCtrl+Cで現在のジョブが終了するのを待ち、再起動する。無効化・設定変更された出典の未完了ジョブは停止する。部屋の端末で診断を確認し、「履歴を保持して実行を中止」した後、現在の設定で新しいジョブを作る。

ワーカーが動いている間だけ定期収集する。OS再起動後の自動起動は未登録。`--once` は1回だけ処理し、`--poll-seconds 30` はキューを確認する間隔（各出典の収集間隔とは別）。Ctrl+C/SIGTERMは現在の処理完了後に終了する。強制終了時は期限付きロックとcheckpointから回復する。

本番ビルドをローカルで使う場合:

```powershell
$env:KOUSATSU_LOCAL_ENABLED="1"
npm.cmd run start:local
```

必ずloopbackへbindする。調査APIはloopback Host・同一Originを検査し、proxy chain・不一致・cross-site操作を拒否する。認証付きのマルチユーザーサービスではなく、インターネットへの公開は想定していない。

## 保存と記憶

- SQLite: `data/kousatsu/kousatsu.sqlite` が出典・版・主張・分析・ノート・ジョブ・記憶の正本。
- Markdown/検査JSON: `content/kousatsu/articles/` はDBの正本から出力する。既存の異なるファイルは上書きしない。
- `KOUSATSU_DB_PATH`、`KOUSATSU_OUTPUT_DIRECTORY`、`KOUSATSU_SOURCES_PATH` で保存先を変更できる。UIサーバーとワーカーには同じ設定を渡す。
- 初回runtime導入時、既存DBがあれば同じディレクトリの `backups/before-runtime-*/checkpoint.sqlite` にSQLite online backupを作る。GETによる閲覧はDB作成・移行・収集を行わない。
- 解釈と仮説は追記する。過去の文書版・主張のIDを保持し、改訂後も過去ノートを履歴として復旧できる。古い主張を現在の事実として扱わない。
- 次の分析へ渡す関連記憶はenqueue時に固定する。検査失敗・矛盾した記憶は履歴に残し、通常の再利用から除外する。構造検査を通っても独立した事実確認は未実施。
- 関心はテーマの記録回数・最終日時と時間減衰で算出する。ルール方式は記録の整理と比較を行うもので、モデル推論の品質を保証しない。

既定の `deterministic/rules-v1` はモデル不要。Ollamaを使用する場合だけ、起動済みのサービスと導入済みのモデルを指定する。

```powershell
$env:KOUSATSU_AI_PROVIDER="ollama"
$env:KOUSATSU_OLLAMA_MODEL="<installed-model-name>"
```

過去の解釈も外部コンテンツと同様に未検証入力として渡す。モデルのダウンロード・サービス起動は自動実行しない。

## 失敗時の扱い

未完了ジョブはcheckpoint・入力・設定・文書版を照合して再開する。不一致は安全停止し、新しい入力を同じジョブに混ぜない。通信等の失敗は最大試行回数内で60秒後に再試行する。停止診断がある出典の自動キュー追加は保留する。

ノートファイルが欠落している場合は端末の「保存ファイルを検査・復旧」を使う。ファイルに手編集がある場合は衝突を表示して止まる。DB正本は画面とMarkdownダウンロードで取得できる。手編集を保管・比較してから復旧を判断する。GETはファイルを修復しない。

```powershell
npm.cmd run kousatsu -- backup --output <新しいバックアップパス>
npm.cmd run kousatsu -- resume --job <job-id>
```

CLIで作った既存ノートもruntime初期化後に一覧へ現れる。runtimeのキューにないジョブの復旧は既存CLIを使う。複数出典・同日複数ノートを保持し、ジョブID付きの出力名で競合を避ける。

## 実環境の制約

現在の作業ツリーはsparse checkoutで48資産を除外している。一括復元はしていない。GLB読込失敗時は既存2D表示に切り替えて再試行できる。共通BGMは未発見で、代替していない。ローカルで音声や3Dを使うには必要な元資産の取得・表示・再生確認が別途必要。

本番ビルドのGoogle Fonts通信依存は解消した。前回の成功ビルドで使ったGeist/Geist Monoの同一bytes・全subset・fallback metricsを同梱し、ライセンスとハッシュを `public/fonts/geist/` に記録している。依存lockは維持しているが、元node_modulesにはlockとの版差がある。検証は隔離コピーにlockからインストールして行う。

テストは一時DB・fixture・偽ストレージを使い、ユーザーの実DBやブラウザ履歴を変更しない。実React/DOM試験と、実ブラウザ/WebGL/音声再生の確認は区別する。
