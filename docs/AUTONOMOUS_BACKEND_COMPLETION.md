# 考察箱：自律バックグラウンド 実装・検証報告

作業日: 2026-10-26（日本時間）

**判定: 自律実行の基盤は実装し、実環境で稼働確認済み。要求全体の完成判定は保留。**

現在ユーザーのWindowsタスクが、ブラウザ・Next.js・3Dルームに依存せずキューを処理し、公式RSSの収集、分析、記憶参照、Markdown保存と欠落復旧を実行する。実PC再起動、情報源の独立性・意味的な反証成立の自動判定、分析内容の質を保証する検査は完成扱いにしていない。

## 1. 開始時の調査と保全

- ブランチ: `chore/rename-kousatsu`。
- HEAD: `6a97997c0c01bae4d62a7d2e5eb8147f135b8e71`。開始時と同一。過去のHEADへ戻していない。
- 開始時には追跡ファイル19件の変更と、多数の未追跡実装が存在した。今回以前の差分を保持した。
- 既存のSQLite/FTS5、文書版、証拠、checkpoint、ジョブlease、HTTP、Markdown公開・復旧、記憶機構を再利用した。
- `D:\AI\KousatsuData` には既存のソースバックアップと所定ディレクトリがあり、運用DB・記事・ノートはまだなかった。実ユーザーデータの移行は行っていない。
- 変更前の294ファイルとSHA-256・Gitパッチを `Backups\source-before-autonomous-3ckgHI` に保存した。作業用の同一保護コピーはプロジェクトの `tmp\before-autonomous-3ckgHI`。元から存在するファイルの削除は0件。
- 開始時の既存131試験はすべて成功した。過去の報告をそのまま成功の根拠にはしていない。
- 途中からAntigravityによるUI開発が並行していることをユーザーに確認した。そのUI実装は編集せず、UIの import に対応するテスト補助だけを更新した。

## 2. 監査後の分類

| 機能 | 終了時の分類 | 根拠・制約 |
| --- | --- | --- |
| RSS収集、重複抑制、出典・文書版・証拠 | 実装済み・実環境で確認済み | 公式RSS3件を実HTTPS取得。DBで出典・取得日時・版を保存 |
| 永続ジョブ、checkpoint、再試行、二重処理防止 | 実装済み・実環境で確認済み | 146試験、実HTTP、Windowsタスクで確認 |
| OSタスクと独立した監督プロセス | 実装済み・実環境で確認済み | 登録・実行・停止・再開・障害復旧・実RSSジョブ処理を確認 |
| PC再起動後の自動復帰 | 実装済み・追加検証が必要 | ログオン時トリガーと永続状態復元を実装。実PCの再起動は未実施 |
| 事実・出典主張・解釈・仮説・未確認の分離 | 実装済み・実環境で確認済み | 検査合格でも独立確認は `unverified` のまま |
| テーマ候補、探索抽選、履歴・理由の保存 | 実装済み・実環境で確認済み | キーワードと過去テーマから選択。DBへ固定して再試行時に再抽選しない |
| 反証資料の探索 | 部分実装 | 保存済み資料のFTS/語句検索。意味的な反証成立を自動証明する機能はない |
| 過去記憶の参照・改訂版による再評価 | 実装済み・実環境で確認済み | 実分析で過去記憶を使用。改訂・履歴追記・旧記憶の検索除外を隔離試験 |
| 人物・組織・概念の意味的な関係グラフ | 部分実装 | 出典・記述・文書版の関係を保存。実体同定と意味的関係の自動確定は未実装 |
| Ollama、期限、形式検査、失敗時の代替 | 実装済み・実環境で確認済み | 実推論、モデルunload/reload、HTTP 500の再試行、代替保存を確認 |
| 考察内容の真偽・品質の独立保証 | 未実装 | 構造検査は意味内容の正しさを保証しない。小型モデルに誤り・文脈不一致がある |
| Dドライブ保存、整合性検査、欠落復旧、手編集保護 | 実装済み・実環境で確認済み | 出力manifest、checksum、置換しない公開処理、実HTTPと障害試験 |

## 3. 実装した補完機能

既存ワーカーにはOS自動起動がなく、収集設定は空だった。今回、自律運用専用の設定とコマンドを追加した。従来の空の出典設定や既存UIの保存先は変更していない。

1. Windows Task Scheduler → 監督プロセス → 期限付き子プロセス → 既存ResearchRuntimeという起動経路。
2. スケジューラの重複抑止に加え、DBに監督プロセスの期限付きleaseを保存。進行中ジョブのlease/checkpointも維持。
3. RSS間隔の既定値を60分へ変更。1サイクル・1日のジョブ数、DB/WAL容量、出力数、残容量を制限。分析対象は最大30文書、モデルへ渡す本文量も制限。
4. RSSの初期URLとredirect先を設定済みホストへ制限。既存のDNS検査・検査済みIPへの接続・TLS検証・サイズと時間制限を維持。
5. 通信失敗だけでなく、XML解析・収集トランザクション失敗もfetch履歴へ記録。
6. テーマ候補の抽選・直近テーマの回避・理由の保存、取得済み記録での反証候補検索、次の調査課題の記録。
7. Ollamaの構造化出力、応答サイズ上限、未取得URL拒否、期限を共有するHTTP 5xxの再試行1回、失敗時の明示的なルール方式への切替。
8. 過去の記憶を分析入力に固定。根拠文書の版が変わった旧判断は履歴を保持して再評価。同じ仮説・同じ根拠版の重複を抑制。
9. Articles / Notes / Hypotheses / Memory / Reportsへの、人が直接読める版付きMarkdown出力。正本とchecksumを先にDBへ保存し、欠落を復旧。手編集があれば衝突を記録。
10. 既存バックアップを上書きしないSQLite online backupと、バックアップ整合性検査。再試行・中止・新規enqueue用の専用CLI。

## 4. 実環境の実行結果

NASA、米国議会図書館Timeless、UN Newsは、公式のRSS案内と実際の取得可能性を確認した。科学・自然、文化・歴史、社会・国際という分野を設定し、各60分間隔とした。初回は10 + 10 + 30 = 50件を取得し、再取得後は計52文書となった。

今回の本番設定はタイトル・URLの保存のみ。本文・要約・画像を取得していないため、記事内容を詳しく検証したとは扱わない。出典の公的性質や複数記事の一致だけで独立した裏付けとは判定しない。

実データから5件の考察ノートを保存した。最後のジョブ `e8639c72-f27b-46ea-989a-08cbfe595595` は、登録済みWindowsタスクのワーカーが実RSSを取得・処理し、`Reports\run-21.md` まで生成した。再取得10件のうち新規文書は0件で、元記事の二重登録を起こしていない。

Ollamaは `/api/tags` で5モデルを確認した:

- `gemma4:e2b`
- `gemma4:e4b`
- `minicpm-v:latest`
- `qwen2.5-coder:7b`
- `qwen2.5-coder:1.5b`

利用したのは導入済みの `qwen2.5-coder:1.5b`。新しいモデルのダウンロードや外部AI APIの利用はしていない。実ノート生成で過去記憶3件を参照し、推論約10.8秒を記録した。モデルunload後の再ロード試験は、初回HTTP 500を記録し、修正後の再試験で約8.1秒の応答を確認した。サービス全体のプロセスを終了させる試験は行っていない。

モデルの応答には、情報不足を述べながら仮説を返すなど、内容上の矛盾も観測した。応答成功・JSON形式の成功と、考察内容の正しさを区別する。AI文章は証拠へ昇格せず、下書きの解釈・仮説として保存する。

## 5. テスト・障害復旧

| 検証 | 結果 |
| --- | --- |
| 開始時の既存試験 | 131 / 131成功 |
| 最終の既存・追加試験 | **146 / 146成功**。無効化・skipなし |
| 実React / StrictMode / DOM試験 | **17 / 17成功**。WebGL・音声の実ブラウザ試験とは区別 |
| 型チェック | 最終の共有ツリーで成功 |
| Lint | 全体Lintと変更箇所の最終Lintが成功 |
| 本番ビルド | 開始時UI + 最終バックグラウンドでTurbopack/webpack成功。並行UIを含む最新コピーでも `next build --webpack` 成功 |
| 本番HTTP | 最新コピーのビルド済みサーバーで**16項目成功**。loopback起動・隔離DB |
| 実Windowsタスク | 登録、処理、多重開始抑止、停止、失敗履歴、復旧、新プロセス復元の**7項目成功** |
| 実データ整合性 | 正本Markdownとファイルの一致、全登録出力のchecksum一致、`integrity_check=ok`、外部キー違反0件 |
| バックアップ | SQLite online backup、複製のintegrity/外部キー検査が成功。既存バックアップへの再保存は拒否 |

障害を発生させた試験は、作成した一時DBまたは `D:\AI\KousatsuData\Validation` 内で行った。本番の出典IDにfixture/testが混入していないことも確認した。

| 障害 | 確認内容 |
| --- | --- |
| DB移行時の欠落 | 既存の移行・主キー・根拠行保持試験。破損した参照は移行を拒否 |
| DB保存中のプロセス停止 | 実子プロセスを未コミット中に停止し、再接続時のロールバックと整合性を確認 |
| Markdown保存中の停止 | 既存の実プロセス終了試験で部分公開から再開。ノート重複なし |
| ノート欠落 | DBから同じ内容へ復旧。実HTTPでも確認 |
| 同一ジョブの二重実行 | job/worker/supervisor leaseとスケジュールキーを検証 |
| 通信・解析失敗 | fetch履歴とジョブ診断を保持。上限後は安全停止 |
| Ollama停止・形式不正・時間切れ | 隔離HTTPサーバーで再現し、代替・再開・未取得URL拒否を確認。実モデルunload/reloadも確認 |
| スケジューラ失敗 | 隔離設定を意図的に壊し、診断保持と修正後の自動回復を確認 |
| 再起動復元 | 実ワーカープロセスの停止・再開始で永続状態復元を確認。物理PCの再起動は未実施 |
| 古い記事・仮説の更新 | fixtureの文書改訂で旧版を保持し、再評価履歴を追加。旧判断を黙って上書きしない |
| 手編集Markdown | 原文を保持し、衝突を返す。DB正本は失わない |
| 容量・書込み失敗 | 上限ガード、ディレクトリ作成を妨げるfixture、公開失敗後の再開を確認。実ディスクを満杯にしていない |

途中の失敗もログに残している。絶対パスをPowerShellへ渡す不具合を修正した。並行UIの新しい `next/link` import による6件の補助テスト失敗は、ナビゲーションのテストアダプター追加で解消した。並行編集中のUI型エラーも、その時点の失敗ログを保存した。バックアップ処理の競合による `database is locked` を一度記録し、監督プロセスの次サイクルで回復した。自動日次バックアップは正式機能に採用せず、既存データを削除しない手動online backupを運用手順とした。

最終ビルドは共有 `.next` と起動中のUIサーバーを変更しないよう、Dドライブ上の検証コピーで実施した。コピー以降のAntigravityによる変更まで保証するものではない。依存関係の追加はなく、現行node_modulesを使用した。lockfileからの新規 `npm ci` は今回未実施。

## 6. 保存先・タスク・運用

- DB: `D:\AI\KousatsuData\Memory\kousatsu.sqlite`
- 文章: `Articles\`、`Notes\`、`Hypotheses\`、`Memory\`
- サイクル報告・本報告: `Reports\`
- 実行ログ: `Logs\2026-10-26.jsonl`、`Logs\scheduler-2026-10-26.log`
- バックアップ: `Backups\`。既存世代は保持した。
- 検証根拠: `Reports\BACKEND_VERIFICATION_EVIDENCE.json`、`Reports\ValidationLogs\`、`Reports\OLLAMA_MODEL_RECOVERY.json`
- タスク定義: `Reports\KousatsuBackend.task.xml`

タスク名: **`KousatsuBackend-3B15A24B0D`**。終了確認時に登録済み・有効・Running。作業ディレクトリは `D:\AI\Projects\houkago-no-chishikibako`。

実行コマンド:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
  -NoProfile -NonInteractive -WindowStyle Hidden
  -File "D:\AI\Projects\houkago-no-chishikibako\scripts\kousatsu-task.ps1"
  -Action Run
  -Config "D:\AI\Projects\houkago-no-chishikibako\config\kousatsu-backend.json"
```

管理者権限・パスワードを使わず、現在ユーザーの `Interactive / Limited` で動作する。ログオン時・1時間ごとの起動トリガーと、実行中の30秒ポーリングを併用する。RSSの実取得間隔は出典設定の60分。ログオン前やPC電源断中には動作しない。

停止・再開:

```powershell
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Stop
# Status が Running 以外になってから設定変更
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Status
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Start
```

詳細な設定・再試行・バックアップ・復元手順は [AUTONOMOUS_BACKEND.md](AUTONOMOUS_BACKEND.md)。旧CLIの自律ジョブへの直接resumeは使わず、専用 `kousatsu:backend` コマンドを使う。

## 7. 今回変更したファイル

新規:

- `config/kousatsu-backend.json`
- `config/kousatsu-autonomous-sources.json`
- `src/lib/kousatsu/autonomous-config.ts`
- `src/lib/kousatsu/autonomous-service.ts`
- `src/lib/kousatsu/research-engine.ts`
- `src/lib/kousatsu/knowledge-export.ts`
- `scripts/kousatsu-backend.ts`
- `scripts/kousatsu-task.ps1`
- `scripts/verify-kousatsu-http.ts`
- `scripts/verify-kousatsu-scheduler.ts`
- `tests/kousatsu/autonomous.test.ts`
- `docs/AUTONOMOUS_BACKEND.md`
- `docs/AUTONOMOUS_BACKEND_COMPLETION.md`

既存実装への補完:

- `src/lib/kousatsu/ai.ts`、`article.ts`、`database.ts`、`ingest.ts`、`pipeline.ts`
- `src/lib/kousatsu/runtime-config.ts`、`runtime-service.ts`、`runtime-store.ts`、`types.ts`、`verify.ts`
- `tests/kousatsu/runtime.test.ts`、`observation-hydration.test.ts`
- `scripts/verify-observation-react.mjs`
- `package.json`
- `README.md`、`docs/LOCAL_RESEARCH_RUNTIME.md`、`docs/KOUSATSU_ARCHITECTURE.md`

並行UI開発による `observer-room` と `ListeningRoom.tsx` の変更は本作業の実装に含めない。開始時から存在した音声・フォント・3D・保存関連の未コミット変更も保持している。

## 8. 未確認・残課題と完成判定

1. 実PC再起動→ユーザーログオン→自動復帰は未確認。処理プロセスの再起動復元と登録定義は確認済み。
2. 実際に1時間が経過する長時間運転、数日以上の運転、停電・物理ディスク破損は未確認。短時間のサイクル、予定時刻の永続化、期限判定は確認済み。
3. 反証候補の語句検索は動くが、独立性・意味的な支持/矛盾・因果関係の自動判定は未実装。元記事本文を確認したものではない。
4. モデルの根拠のない説明や文脈不一致をすべて形式検査で検出することはできない。生成物の内容を検証済みの事実とは扱わない。
5. 人物・組織・概念の実体同定、重要度の高度な評価、分野間の意味的発見は部分実装。現行は出典・記述・語句・鮮度の関係を利用する。
6. 保存容量は上限で抑制するが、古い記憶の自動アーカイブ・世代バックアップの自動整理は未実装。削除を伴う処理は無断で導入していない。
7. 従来UIは別の互換設定を維持し、今回のDドライブ運用へ自動統合していない。操作は専用CLIを正規経路とする。3Dルームの刷新は実施していない。

以上のため、動作を確認した自律稼働基盤と、意味的な研究能力・長期運転の未完成部分を分ける。要求全体を完全完成とは報告しない。

**コミット・push・Vercelデプロイは行っていない。ステージングせず、差分をレビュー可能な状態で残した。**
