# 考察箱 MVP アーキテクチャ

2026-10-26の自律運用・保存・復旧・モデル管理の現行構成は [AUTONOMOUS_BACKEND.md](AUTONOMOUS_BACKEND.md) を参照。以下は既存パイプラインのMVP設計記録。

更新日: 2026-10-25

## 目的と境界

考察箱は、既存の「放課後の知識箱」「観察箱」「音声・3D制作」を置き換えない独立モジュールとして追加する。最初の完成範囲は、RSS/Atomまたはローカルfixtureの取得から、根拠検証付きMarkdown下書きの生成までとする。note投稿、SNS投稿、メール送信、本番デプロイは行わない。

```text
RSS/Atom・fixture
  -> 正規化・重複排除
  -> SQLite + FTS5
  -> 出典主張・証拠
  -> 類似関係
  -> 分析Provider
  -> 根拠固定の記事組み立て
  -> 独立した決定的検証
  -> Markdown + verification.json
```

## 保存場所

- DB: `data/kousatsu/kousatsu.sqlite`
- 記事: `content/kousatsu/articles/*.md`
- 検証結果: `content/kousatsu/articles/*.verification.json`
- 情報源設定の雛形: `config/kousatsu-sources.json`

DBと生成記事は個人データを含み得るためGit管理外とする。既存の `content/drafts`、`content/reviewed`、`content/episodes`、観察箱のlocalStorageは移行も変更もしない。

## データモデル

- `sources`: 情報源、保存方針、最終取得状態
- `fetch_runs`: 取得開始・終了、HTTP状態、件数、エラー、応答ハッシュ
- `items` / `item_search`: 記事メタデータ・要約とFTS5索引
- `claims`: 確認済み事実、出典の主張、推論、意見、仮説、未確認、反証
- `evidence`: 主張、保存項目、該当箇所、支持/反証の対応
- `relations`: 二つの記録の関係、score、判断理由
- `analyses` / `hypotheses`: Providerの分析と未検証仮説
- `articles` / `article_claims`: 下書きと利用した主張
- `verifications`: 検証結果と問題一覧
- `jobs` / `job_attempts` / `checkpoints`: 状態、上限、試行、段階別成果

SQLiteは単一ユーザー・ローカル運用、数十〜数百件からの開始、トランザクション、FTS5、バックアップの条件に合う。Node 24の内蔵SQLiteを使うためネイティブnpmモジュールは不要。ただしNode 22以下や、永続ディスクを持たないホスティングへ移す場合は再評価する。

## 事実と推論

RSS/Atomの要約は、配信元が述べた `source_claim` として保存する。一つのフィードに書かれているだけの内容を `confirmed_fact` へ昇格しない。記事では「確認された事実」「出典の主張（独立確認前）」「分析・考察」「仮説」を別セクションにする。

生成記事のURLは保存済み項目と照合し、根拠が必要な構造化主張にはclaim IDとevidenceを必須とする。AIの文章自体は証拠として保存しない。

## AI Provider

- `deterministic/rules-v1`: 既定。料金・APIキー不要。パイプラインと根拠管理を完全にローカル検証できる。
- `ollama`: 任意。`KOUSATSU_AI_PROVIDER=ollama` と `KOUSATSU_OLLAMA_MODEL` が指定された場合だけ使う。モデルの取得や起動は行わない。

外部コンテンツは命令ではなく不信なデータとして区切って渡す。Ollamaの出力はJSON構造を検査し、記事の出典節はプログラム側で組み立てる。外部AI Adapterはこのインターフェースへ追加できるが、送信先、送信データ、料金上限、秘密情報の管理を実装するまで有効化しない。

## 収集の安全条件

- 既定はHTTPSのみ。資格情報を埋め込んだURLを拒否する。
- DNS解決後にloopback、link-local、private address等を拒否し、redirect先も再検査する。
- 1応答2 MiB、1項目2万文字、redirect 3回、timeout 15秒、retry 2回を上限とする。
- 同一ホストへの要求間隔をプロセス内で最低1秒空ける。
- URL追跡パラメータ除去とcontent hashの両方で重複を防ぐ。
- リンク先本文は自動取得せず、フィードが提供するメタデータと要約だけを保存する。
- `config/kousatsu-sources.json` は空から開始し、利用規約、robots.txt、著作権、取得頻度を人間が確認した情報源だけを追加する。

## 復旧と上限

各段階の成功結果を `checkpoints` に保存する。失敗したジョブは `retry_wait` となり、最大試行回数（既定3回）を超えると `failed` になる。`resume` は成功済みcheckpointを再利用する。異常終了した `running` ジョブは `recover` で明示的に回収できる。

```bash
npm run kousatsu -- status
npm run kousatsu -- resume --job <job-id>
npm run kousatsu -- recover --stale-minutes 30
```

SQLiteの整合したバックアップは実行中DBを直接コピーせず、Node SQLite backup APIを使う。

```bash
npm run kousatsu -- backup --output backups/kousatsu-2026-10-25.sqlite
```

## 現時点の限界

- 本文抽出、robots.txt自動確認、サイト別利用規約判定は未実装。
- 独立情報源を使った自動的な事実昇格・反証判定は未実装。
- 日本語形態素解析やembeddingは使わず、FTS5と文字bigramの初期実装。
- Ollamaの品質はモデルごとに異なり、実モデルによる生成品質は別途検証が必要。
- Web UIからの実行は未提供。変更処理は権限境界を明確にするためCLIに限定する。
- noteは下書きMarkdownを人間が確認して手動投稿する。自動公開は対象外。
