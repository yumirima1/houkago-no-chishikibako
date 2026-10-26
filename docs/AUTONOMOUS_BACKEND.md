# 考察箱：自律バックグラウンドの設計と運用

更新: 2026-10-26。Node.js 24以上、Windowsの現在ユーザーで運用する。

## 現在の構成

```text
Windows Task Scheduler（ログオン時 + 1時間ごとの起動確認）
  -> scripts/kousatsu-task.ps1 Run
  -> scripts/kousatsu-backend.ts daemon（監督プロセス）
  -> 子プロセス run（既定30秒ごとに確認、実処理には期限あり）
  -> ResearchRuntime / ResearchStore の永続スケジュール・キュー
  -> 既存 KousatsuPipeline の段階別checkpoint
  -> RSS取得 / 文書版 / 出典主張 / 関連記録
  -> ResearchEngine（テーマ選択・既存資料での反証候補検索・Ollama）
  -> 形式・参照検査 / SQLite / Notes
  -> Articles / Hypotheses / Memory / Reports のMarkdown
```

ブラウザ、Next.js、3Dルーム、音声生成を起動する必要はない。既存のCLIとHTTP APIは維持する。今回の運用系は独立した設定を使い、従来の空の `config/kousatsu-sources.json` は変更しない。既存UIの保存先も自動的に切り替えない。

## 起動・停止・再起動

プロジェクト `D:\AI\Projects\houkago-no-chishikibako` を作業ディレクトリにする。

```powershell
# 状態と次回予定。読み取りのみ
npm.cmd run kousatsu:backend -- status
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Status

# 登録済みタスクの開始・再開
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Start

# 新しい起動を無効化し、現在のサイクル完了後に終了
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Stop
# Status が Running 以外になるのを確認してから設定変更・再開

# 監督プロセスを使わない1サイクルの手動実行
npm.cmd run kousatsu:backend -- run

# タスクが存在しない新規導入時のみ（既存タスクは上書きしない）
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Install

# 停止完了後に、このプロジェクト専用タスクだけを解除
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Remove
```

登録名は `KousatsuBackend-3B15A24B0D`。コマンドは Windows PowerShell の `-NoProfile -NonInteractive -WindowStyle Hidden -File <project>\scripts\kousatsu-task.ps1 -Action Run -Config <project>\config\kousatsu-backend.json`。作業ディレクトリは上記プロジェクト。管理者昇格・パスワード保存を使わず、現在ユーザーの `Interactive / Limited` で登録する。

ログオン時と1時間ごとの起動トリガー、`IgnoreNew`、失敗時1分間隔・最大3回の再起動を設定する。ログオン中に動作し、PC再起動後はユーザーのログオンを契機に復帰する。ログオン前の無人実行は提供しない。スリープ中・電源断中は動作しない。復帰時に期限を過ぎた予定を1件へまとめて処理する。

停止は `Logs\STOP` を作成して行う。強制終了ではなく現在のサイクル完了を待つため、通常30秒前後、推論や通信中にはそれ以上かかる。監督プロセスの子プロセスには実時間の期限があり、停止した依存処理も無期限には待たない。再開時にStopマーカーを削除する。

## 設定

`config/kousatsu-backend.json`:

- `dataDirectory`: 既定 `D:/AI/KousatsuData`。WindowsではDドライブのパスを必須とする。
- `sourcesPath`: 自律運用専用の情報源JSON。従来設定と分離している。
- `pollSeconds`: キュー確認間隔。既定30秒。RSSの取得頻度とは別。
- `maxJobsPerCycle`: 既定6件。直列実行する。
- `maxJobsPerDay`: 新規の自動ジョブ上限。既定100。既存ジョブの再開は許可する。
- `maxDatabaseMiB`: DBとWALの上限。既定1024 MiB。
- `minFreeMiB`: 残容量の下限。既定1024 MiB。
- `maxKnowledgeFiles`: SQLiteに登録する出力ファイル数の上限。既定50000。
- `exploration`: テーマ候補から抽選する比率。既定0.25。
- `ai`: `ollama` または `deterministic`。今回確認した導入済みモデルは `qwen2.5-coder:1.5b`。期限は既定60000 ms。

`config/kousatsu-autonomous-sources.json` で出典の登録・停止・間隔・保存方針を管理する。`enabled:false` で停止。間隔の未指定時は60分、最小15分。既存IDのURLを変更せず、新しい出典IDを使う。設定変更は停止→編集→開始の順で行う。新しい子プロセスは毎回設定を読み直すが、進行中のジョブの入力を変更するものではない。

公式のRSS案内と実取得を確認したNASA、米国議会図書館Timeless、UN Newsを登録している。RSS自体はタイトル・URL保存を維持する。品質改善でNASAとUNの `articlePolicy` を有効化し、許可ホスト内の本文を個人用に取得・保存する。米国議会図書館は本文取得を有効化していない。画像取得・外部公開はしない。配信元の公的性質は内容の正しさや独立性の保証ではない。

`articlePolicy` は情報源ごとに設定する。`enabled:false` で本文取得を停止できる。`allowedHosts` は完全一致ホスト名、`maxArticles` は1〜5件（現在2件）、`followLinks` は原記事内で実際に参照された関連リンク0〜2件（現在1件）、`cacheMinutes` は15〜10080分（現在60分）。許可外リンクを追わず、robots取得不能時も迂回しない。成功・失敗・拒否をSQLiteへ記録し、失敗は15分、拒否は24時間、同じURLは1日3試行まで。通信は既存のDNS固定・全リダイレクトのホスト検査・容量制限を通す。

上限に達したときはデータを削除せず新しい処理を抑制する。保存期間による自動削除はしない。容量監視・アーカイブ・上限変更は運用者が判断する。JSONLは日付別・1ファイル10 MiBを上限とし、上限到達はエラーになる。定期的なバックアップと容量確認が必要。

## データと文章

| 保存先 | 内容 |
| --- | --- |
| `Memory/kousatsu.sqlite` | 文書版・主張・証拠・ノート・ジョブ・記憶・出力manifestの正本 |
| `Articles/<item>-<version>.md` | 改訂前も保持する取得記録と出典 |
| `Notes/*.md` / `*.verification.json` | 考察と構造・参照の検査結果 |
| `Hypotheses/*.md` | 未確認の仮説、根拠資料、再評価履歴 |
| `Memory/*.md` | 解釈・関心の時系列・出典と記述の関係 |
| `Reports/run-*.md` | 処理・修復・衝突が発生したサイクルの報告 |
| `Logs/YYYY-MM-DD.jsonl` | 監督・ジョブ・失敗・再試行の記録 |
| `Logs/scheduler-YYYY-MM-DD.log` | タスクランチャーの標準出力・エラー |
| `Backups/` | ソース保護コピーとSQLite online backup |
| `Validation/` | 隔離された実環境試験。運用データとして取り込まない |

ファイル公開は一時ファイルへ書込み・同期後、既存ファイルを置換しないhard linkで行う。SQLiteとファイルシステムを単一トランザクションとは扱わない。出力manifestを先に保存し、サイクルごとに欠落を復旧する。内容が異なる既存ファイルは衝突として記録し、上書きしない。

```powershell
# 全出力の照合・欠落復旧。手編集があれば非ゼロ終了する
npm.cmd run kousatsu:backend -- export

# 既存ジョブの再試行。成功済み段階を再利用する
npm.cmd run kousatsu:backend -- retry --job <UUID>

# 処理を中止し、診断・過去ノートを保持
npm.cmd run kousatsu:backend -- cancel --job <UUID>

# 設定を修正した後、新しい入力としてやり直す
npm.cmd run kousatsu:backend -- enqueue --source nasa-science
```

試行上限3回に達したジョブや、設定・入力・版・providerの不一致は自動的に無限再開しない。診断を確認し、旧ジョブを中止して新しいジョブを作る。進行中の入力を書き換えない。従来CLIの `resume` は、この自律運用系のprovider fingerprintを引き継がないため、自律ジョブの復旧には上記コマンドを使う。

## バックアップと復元

```powershell
npm.cmd run kousatsu:backend -- backup
```

SQLite online backupで一意な新規パスへ保存し、`integrity_check` と `foreign_key_check` を検査する。既存ファイルを上書きしない。実行中DBの `.sqlite` だけを通常コピーする方法は使わない。自動の世代削除はない。現状は手動バックアップが正式な運用手順。

復元時はタスクを停止し、CLI・HTTPを含む当該DBの利用を終了する。現在のDB・WAL・SHM・手編集Markdownを別の新規バックアップディレクトリへ保存する。まず `Validation` 内の複製へバックアップを展開して整合性と件数を検査する。正本DBを戻す操作は、その検査後に行う。DBには出力の絶対パスが記録されるため、別ルートへ移した複製をそのまま本番復旧コマンドに渡さない。

## 分析と記憶の限界

出典主張、解釈、仮説、反証候補、未確認事項を分離する。構造検査が `passed` でも独立確認は `unverified` のまま。本文・RSS要約・タイトルを別の取得区分として記録する。原文引用・主張ID・URLの検査は維持する。本文なし・モデル停止・不完全な応答の場合も、重要な問題・見解・理由・別の説明・修正条件を残す。未知の人数・効果などを観測済み事実として補わず、数値の思考実験は明示した仮定に分離する。見解が未確認であるという理由だけで削除しない。空の追加仮説は正常だが、見解を空欄にする理由にはしない。外部AI API・モデル自動ダウンロードは利用しない。

テーマは出来事を含む記事全体から問いを作り、本文の有無・取得順・直近履歴を考慮して選ぶ。探索抽選は具体的な問いの候補間でのみ行う。結果・候補・理由はDBへ固定する。一般語や英字の部分一致を強い関係にせず、具体的な共通対象・日付から続報候補を区別する。意味的な反証や因果関係の成立は自動断定しない。タイトル保存だけでは内容の詳しい支持・反証を判断できない。

旧方式で生成された未監査の自律分析文は削除せず、通常の記憶検索から除外する。品質情報を持つ記憶は根拠文書・版に戻って比較する。仮説には前提ID・成立時の観測・反証条件・代替説明・必要資料を記録する。事前の観測条件と新版の原文引用が完全一致した場合だけ、支持／反証候補の評価履歴を追記する。`Hypotheses/evidence-review-*.md` から読める。これは独立した真偽判定ではなく、意味が同じでも引用が一致しなければ未判定を維持する。

品質改善の原因、変更ファイル、実例比較、残る制約は [品質改善報告](RESEARCH_QUALITY_IMPROVEMENT.md) を参照。

その後の考察生成の修正では、既存の `quality_json` とチェックポイントに構造化した見解を保存する。`research_memory_events` の解釈イベントには見解を、reasonには理由・確信度・別の説明・修正条件・仮定を保存する。`Memory/view-*.md` と `Memory/view-review-*.md` から人間も読める。再評価は維持・修正・採用撤回を区別し、旧文章を上書きしない。本文がない場合は題名が提示する問いへの見解と明記する。詳細と実例は [考察生成の修正報告](REFLECTION_GENERATION_REVISION.md) を参照。

根拠文書が改訂された記憶は、旧内容を消さずに再評価履歴を追記し、通常の再利用から除く。これは旧判断が誤りと証明されたという意味ではない。同じ仮説・同じ文書版の重複は抑制する。関心の減衰は30日の指数減衰で表現し、時間経過で架空の出来事を生成しない。人物・組織・概念を意味的に同定する知識グラフは部分実装に留まる。

## 検証の再実行

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:kousatsu
npm.cmd run build
node --import tsx scripts/verify-kousatsu-http.ts
node --import tsx scripts/verify-kousatsu-scheduler.ts
```

HTTP試験はビルド済みサーバーをloopbackだけで起動し、一時DBを使う。スケジューラ試験は `Validation` 内に専用タスクを作り、試験後にそのタスクだけを削除する。実PCの再起動、ログオン前の動作、停電・物理ディスク破損はこの試験に含まれない。

確認した一次資料: [NASA RSS](https://www.nasa.gov/rss-feeds/)、[Library of Congress](https://www.loc.gov/subscribe/)、[UN Geneva RSS](https://www.ungeneva.org/en/news-media/rss)、[Ollama generate](https://docs.ollama.com/api/generate)、[Windows task principal](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal)。
