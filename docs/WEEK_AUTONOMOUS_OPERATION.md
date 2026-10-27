# 1週間の自律運用

設定は `config/kousatsu-backend.json`。タイムゾーンは Asia/Tokyo、実行枠は06:00・18:00・22:00。1枠1記事、1日最大3枠。初回は開始時刻直前の枠も予約する。再起動時は当日の未実行枠を古い順に遅延復旧し、過去の日の未実行枠はmissedとして記録する。過去数日分を一度に無制限に実行しない。開始・終了日時は設定ファイルのoperationを参照する。現在は2026年11月2日20:56 JSTに新規生成を終了する設定。

## 構成と復旧

既存Windowsタスク → 既存daemon → 日次枠の永続予約 → RSS/本文取得 → 既存SQLiteキュー → 記事単位の固定文書版 → 既存考察・検証・Markdown/記憶保存 → 公開用の投影 → GitHubのmainへ公開データだけをcommit → Actions → GitHub Pages。

枠と記事の予約はSQLiteのweekly_*テーブル、ジョブは既存research_queueを使う。枠の収集は最大3試行、記事の処理も最大3試行。新しい枠を増やしてリトライしない。記事の出典・版・根拠・過去の見解を固定して再開し、条件が変わった場合は明示的なblockedとして保存する。同時実行は既存worker leaseとjob leaseで排除。公開用のoutboxを再生してもenqueueOnceにより同じジョブIDを使う。

1週間の終了日時以降は新しい情報収集・考察ジョブを開始しない。最後に終了状態を公開し、daemonは終了する。タスク定義は保持されるが、再起動しても期限後の生成は行わない。期間・時刻を変更する場合はoperation.idを新しくする。同じidのスケジュールを黙って書き換えない。

## モデルと取得元

qwen3:4b-q4_K_M、4096 context、最大1000出力token、timeout 180秒。8Bのgemma4:e4bはこの環境でrunner起動エラーが再現したため不採用。モデル停止・timeout時は出典を保存したまま明示的なルール分析へ切り替え、使用方式・エラーを記録する。生成できたことは事実確認や考察品質の保証ではない。

出典は `config/kousatsu-week-sources.json` に分離。Hugging Face、Windows Experience、Federal Reserve、UN News、NASA、Library of Congress、EIA Today in Energyを使用。既存の出典設定は保持。少ないジャンルを優先し、URL・題名・内容で既存記事との重複を避ける。本文や十分な抜粋がない記事で枠を水増ししない。取得制限、robots、SSRF/DNS pinning、通信上限は既存処理を継続使用する。

## 公開とUI

ローカル正本: D:\AI\KousatsuData\Memory\kousatsu.sqlite と Notes / Articles / Hypotheses / Memory。

公開するのは `Publishing/export/public/research` に作る派生データだけ。出典タイトル・URL・公開/取得日時・短い引用・考察・別の説明・修正条件・確信度を含む。取得記事全文、SQLite、認証、詳細ログ、ローカルパスは公開しない。既存の公開用ノート本文はDBに固定し、後からモデルを変更しても書き直さない。生成方式と制約のメタデータは固定済みの分析記録から付与する。ノートの派生Markdownに手編集を検出した場合も衝突を報告する。公開条件に合う保存済み考察を全件照合し、同じ出典の試行は1件にまとめる。空の公開データはエラーとし、従来の公開ファイルを保持する。

Git資格情報ヘルパーの既存認証を使い、GitHub APIで公開用パスだけを追加する。tokenをファイル・設定・ログへ書かない。remoteの最新HEADを親にし、force:falseで更新する。競合・通信失敗は同じ公開digestで最大3回、5分間隔。失敗してもローカル考察を失わず、次の新しい記事の公開に未公開分を含める。public_publish_stateとJSONLに状況を残す。

公開UIは既存CRT端末を使い、Pagesではresearch/snapshot.jsonとnotes/{id}.jsonを読み取る。ローカルは既存APIを使う。端末を開いている間は60秒ごとに再取得する。公開画面の状態は最後に公開された時点の情報であり、ライブ監視ではない。公開処理には更新可能な単一リースがあり、リモートの記事IDが欠けた古いデータは拒否する。Gitへの反映成功とPagesへの配信成功は別である。Actionsのbuild・deploy・verify-publicを確認し、公開先のbuild-info.jsonのcommitも照合する。

## 操作

```powershell
# 作業ディレクトリ D:\AI\Projects\houkago-no-chishikibako
node --import tsx scripts/kousatsu-backend.ts status
node --import tsx scripts/kousatsu-backend.ts doctor
node --import tsx scripts/kousatsu-backend.ts backup
node --import tsx scripts/kousatsu-backend.ts run
node --import tsx scripts/kousatsu-backend.ts public-export
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Status
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Stop
powershell.exe -NoProfile -File scripts/kousatsu-task.ps1 -Action Start
```

既存タスク名は KousatsuBackend-3B15A24B0D。Stopは停止マーカーを作成しタスクを無効化、進行中の安全な単位を終えて終了する。再開はStart。タスクは現在ユーザー・Limited・ログオン時と毎時の起動保険で、実行する枠はDBが管理する。ブラウザや3D表示は不要。

ログ: Logs/YYYY-MM-DD.jsonl とscheduler-*.log。SQLiteとReports/run-*.mdからジョブと障害を追跡できる。

## 環境の前提

PCのAC電源、インターネット接続、Windowsログオン状態を維持する。ACの自動スリープは既存設定で無効だったため、電源設定は変更していない。電源断・スリープ・ネットワーク断の間は収集できない。Windows再起動後はログオンしてタスクが起動することが必要。認証情報の暗号化・Ollamaの起動にも同じユーザー環境を使う。無人でのOS更新再起動後の再ログインを新設してはいない。

## ロールバック

停止コマンドでdaemonを止める。変更前の設定・ソースはBackups/before-autonomous-s2JoMI、DBはBackups/kousatsu-2026-10-26T11-40-33-818Z-28944.sqliteに保護した。DBを戻すと今回の新しい考察を除外するため、先に現行DBもbackupコマンドで別名保存する。通常はコード・設定だけを元に戻し、追加テーブルと既存記録は保持する。DB初期化・既存ノート削除は不要。
