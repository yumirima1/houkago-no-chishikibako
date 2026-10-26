# 考察箱：自律開発の実装・検証記録

検証日：2026-10-25。**ローカル調査機能の段階導入は CONDITIONAL GO。プロジェクト全体の完成は未達。**

実際のRSS取得から出典・文書版・主張・証拠・解釈・仮説・Markdown・長期記憶までを保存し、既存ルームの端末／メモから扱う経路を実装した。過去のゲートで再現したデータ喪失経路を修正した。ユーザーの実DB、実ブラウザ、WebGL、音声再生、モデル品質、常駐運用は検証できていないため、完全な統合完了とは判定しない。

[以前の実環境ゲート](REAL_ENVIRONMENT_GATE.md) は修正前の履歴として保持している。その NO-GO の原因に対する修正と再検証は本書に記録する。[P1限定修正](P1_LIMITED_FIXES.md) と [監査](INTEGRATION_READINESS_AUDIT.md) も上書きしていない。

## 1. 実装した機能と保全修正

| 対象 | 実装・確認した内容 | 限界 |
| --- | --- | --- |
| DB移行 | 移行前とtransaction内のFK検査、全旧テーブルの件数・主キー集合比較、不整合ならrollback。孤立evidenceをJOINで落とす経路を廃止 | 実ユーザーDBは見つからず、旧実装から作った合成v1 DBで検証 |
| ブラウザ保存 | hydration完了前の操作を抑止。不正JSON・読込失敗を空データと扱わない。単一operationの追記journalでログ・関係・選択を一緒に保存 | 実localStorageでは未検証。journalの自動削除・圧縮は行わず、容量上限は残る |
| 複数タブ・失敗復旧 | 旧3キーを保持。別タブの追記を統合し、時計逆行・二重送信・保存後の読込失敗を扱う。失敗は表示して明示再読込 | 他アプリ版が旧キーへ書いた内容は自動統合しない。詳細は保存仕様参照 |
| P1-A 出典と版 | 複数出典・alias・版・旧主張を保持。ノートに出典関連を表示 | 現在の外部記事の真偽を保証しない |
| P1-B 検証器 | 固定した文書版に対応する出典URLへevidence locatorを照合。構造検査と独立事実確認を分離 | `passed`でも`factCheckStatus: unverified`。独立した事実確認器は未実装 |
| P1-C ノート | DBを正本とし、欠落したMarkdown／検証JSONを復旧。完了済みjobは後続改訂後も固定済みの旧ノートを復旧 | 手編集との衝突は保持して停止。手動の比較・解決が必要 |
| P1-D 再開・排他 | 入力・設定・版・記憶をcheckpointに固定。runtimeとpipelineの期限付きlease、tokenによる旧worker書込拒否 | OSによる永続起動は未登録。実際の長期間運用は未検証 |
| P1-E 音声manifest | 共通の生成・読込規則と既存回帰試験を保持 | 実音声合成・再生は未確認 |
| 継続収集 | 設定したRSS/Atomのdue timeをDBへ保存。再起動後もqueueを保持し、未完了・blockedを重複enqueueしない | 設定は空のまま。利用する出典の設定とworker起動が必要 |
| 長期記憶・関心 | 解釈と仮説を時系列で追記し、文書版・主張IDを保持。関連記憶を次の分析へ固定投入。関心を回数と時間減衰で算出 | ルール式の整理・比較。高品質な独自推論を保証しない |
| UI接続 | 既存端末・メモ・モバイル観察箱から実行／履歴／Markdown閲覧・取得・復旧。実job段階を部屋の状態へ反映 | SSR、実ReactとDOM試験まで。実画面のレイアウトと3D描画は未確認 |
| 資産失敗 | GLB失敗／WebGL context例外から既存の操作可能な2D表示へ退避し、再試行可能 | 3D資産を置換・再設計していない |
| 通信 | 検査済みDNS応答へ接続固定しHost/SNI保持。private宛先・危険redirectを拒否。DNSから本文までの期限、容量上限 | OSのDNS処理自体は取消不能。期限後の結果は吸収し、接続へ進めない |
| ローカルAPI | loopback・同一Origin・JSONサイズ・許可actionを検査。GETはDB作成／移行／修復しない。本番は明示有効化が必要 | マルチユーザー認証サービスではなく、必ずloopbackへbindする |

runtime初回導入時は、既存DBがあればSQLite online backupを新規パスへ作成してから追加スキーマへ進む。既存のノート・履歴・出典は削除しない。取り消しもjobを履歴として残す。

## 2. 実行環境と検証結果

Node.js 24.15.0、npm 11.12.1、Next.js 16.4.3。元のnode_modulesは変更していない。直接依存8件のlockとの版差は残るため、別コピーへlockfileからインストールして検証した。package-lock.jsonと依存宣言は今回の開始時から不変。

隔離コピー：`C:\Users\yumir\AppData\Local\Temp\kousatsu-autonomy-validation-10hSJo`

```powershell
npm.cmd ci --offline --ignore-scripts --no-audit --no-fund --cache C:\Users\yumir\AppData\Local\Temp\kousatsu-gate-kyLnvO\npm-cache --logs-dir <隔離コピー>\npm-logs
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:kousatsu
$env:NEXT_TELEMETRY_DISABLED="1"
npm.cmd run build
```

| 検証 | 結果 |
| --- | --- |
| 新規コピーへのnpm ci | 成功、428パッケージ。既存cacheからオフライン取得、lifecycle scripts無効 |
| 型チェック | 成功 |
| ESLint | 成功、警告なし |
| 全kousatsuテスト | **131/131成功**、失敗・skipなし |
| 本番build | 成功、警告なし。Google Fonts通信不要 |
| 実React 19.2.4 + jsdom | **17/17成功**。StrictMode、保存拒否・破損・再読込、端末操作、古い応答の排除、3D失敗の2D退避 |
| 本番NextサーバーのHTTP probe | **14項目成功**。生成、取得、復旧、手編集保持、重複防止、lease解放、両ページ、フォント・選択資産配信 |
| 実公開RSSの取得 | 成功。下記参照 |
| 合成旧DBの独立probe | 成功。16元テーブル保持、移行失敗のrollback、原本hash不変 |
| `git diff --check` | 成功。ステージなし |

実React試験の再実行：

```powershell
node scripts/verify-observation-react.mjs --dependencies C:\Users\yumir\AppData\Local\Temp\kousatsu-react-dom-2caf6c908d794d77979bd12cc837d297
```

この補助環境にはreact 19.2.4、react-dom 19.2.4、jsdom 27.0.0を別途導入した。rootの依存やlockは変更していない。jsdomはレイアウト・WebGL・音声を実装する実ブラウザではない。

追加／強化した回帰は、移行8、runtime25、HTTP10、network13、hydration17、既存P1の版alias照合・旧ノート復旧・強制終了試験など。既存テストを削除したり、保持・排他・重複禁止の期待値を弱めたりしていない。以前の危険動作をassertしていたhydration診断は、安全な保持をassertする回帰へ変更した。

### 実行中に発見して修正した問題

- 旧DBの孤立根拠行の黙った欠落と、初期読込前の保存による履歴上書きを再現して修正。
- 完了済みノートの復旧が現行文書の更新で止まる問題を、完了job専用の固定済み情報の照合で修正。
- 200ms leaseを使った試験の時間依存を、30秒lease・IPCによる停止点確認・制御した失効時刻へ変更。排他と復旧の期待値は維持。
- 実React追加試験で、二重enqueue、HTTP 200内のblockedを成功扱い、復旧後のノート表示更新、WebGL context例外の4問題を修正。
- 検査後の再DNS解決を防ぎ、実TLS接続でもHost/SNI・証明書検証を確認。
- 実Nextサーバーで内部URLが`localhost`へ正規化され、ブラウザHostの`127.0.0.1`と食い違って403になる問題を修正。完全に一致するNextのloopbackヘッダーの場合だけ正規化を扱い、Originは実際のHostと比較する。異なるOrigin・port・proxyは回帰で拒否。
- build時の動的保存先の探索範囲を抑制。routeのtrace114ファイルを検査し、既存のソース文書`content/memory/show-bible.md`以外の実行時DB・ノート・tmp・envを含まないことを確認。
- Geist／Geist Monoは前回成功ビルドと同じ11ファイル、146,464 bytes、subsetとfallback metricsを同梱。SHA-256・出所・OFLを記録し、外部フォント通信に依存しないbuildへ変更。

### 実HTTP経由の確認

新規の一時DBと出力先を使い、隔離コピーの`next start --hostname 127.0.0.1`へ接続した。初期GETでDBが作られないこと、別Origin拒否、明示初期化、fixture jobの実行、正本Markdown取得、欠落後の明示復旧、手編集時のblockedとbytes保持、重複ノートなしを確認。`/`と`/room-export`は200で現名称を含み、本番の部屋export書込APIは403を維持。

元資産のGLBとMP3各1件のみを隔離コピーへ展開し、配信bytesがGit由来と一致、MP3 Range要求が206となることを確認。最初はサーバー起動後に資産を追加して404になったため、Nextのpublic一覧取得より前に試験資産を用意して再確認した。元の作業ツリーは変更していない。

### 実公開RSS

[NASA公式RSS案内](https://www.nasa.gov/rss-feeds/)の`https://www.nasa.gov/news-release/feed/`をmetadata-onlyで1回収集した。本文転載や外部サービスへのデータ送信は行っていない。

- 現行ResearchRuntime、現行DNS固定transport、`deterministic/rules-v1`を使用。fixtureなし、Ollamaなし。
- TLS 1.3、証明書authorized、Host/SNIが`www.nasa.gov`で一致。
- 10文書、10版出典関連、選択された6主張と6証拠、Markdown 1件（9,095 bytes）、記憶2件、関心1件。
- DB正本とMarkdownのSHA-256一致。SQLite integrity `ok`、FK違反0。queue完了、lease解放。
- 構造・参照検査`passed`、独立事実確認`unverified`。
- `config/kousatsu-sources.json`は元の空設定を維持。隔離先は`C:\Users\yumir\AppData\Local\Temp\kousatsu-live-nasa-ALEMY6`。

sandbox内ではEACCESで接続できなかった。正規の権限審査を通した同じ限定probeで成功した。通信失敗の記録も保持している。

## 3. Git・バックアップ・既存作業

| 項目 | 開始時 | 終了時 |
| --- | --- | --- |
| repository | `D:\AI\Projects\houkago-no-chishikibako` | 同じ |
| branch | `chore/rename-kousatsu` | 同じ |
| HEAD | `6a97997c0c01bae4d62a7d2e5eb8147f135b8e71` | 同じ |
| tracked未ステージ | 11ファイル | 19ファイル |
| untracked | 29ファイル | 63ファイル |
| index | 空 | 空、開始時のindex SHAと一致 |
| 今回開始時との差 | — | 21既存ファイルを更新、34ファイル追加、削除0 |

開始時260ファイルは`C:\Users\yumir\AppData\Local\Temp\kousatsu-autonomy-6OI6Zb`に退避し、全SHAを照合した。元の`D:\AI\Projects\kousatsu-backup-2026-10-25T08-03-58-577Z`も273ファイルのSHAと完全履歴bundleを再検証した。

開始時未ステージ11件のうちREADMEとpackage.jsonに今回の機能説明・コマンドを追記した。他9件はbytes不変。開始時未追跡29件は全保持し、その一部のP1実装・試験には上記の追加修正を行った。239既存ファイルは今回開始時と同一。元からGit差分にあるpackage-lock.jsonや制作スクリプトの変更を今回作成したとは扱わない。

ステージ、コミット、push、デプロイ、公開、フォルダ／remote改名は行っていない。今回の変更は元の未コミットP1実装に依存するため、Git HEADとの差分を丸ごと今回分としてコミットすることは適切でない。開始時snapshotとの差分をレビュー用に保存し、Git indexには追加していない。

## 4. 今回変更したファイル

開始時から更新した21件：

```text
README.md
package.json
src/app/globals.css
src/app/layout.tsx
src/components/ListeningRoom.tsx
src/components/observation/SubjectRoomView.tsx
src/components/observation/useObservationState.ts
src/components/room/RoomSceneRoot.tsx
src/hooks/useAmbientAudio.ts
src/hooks/useBroadcastAmbience.ts
src/lib/kousatsu/ai.ts
src/lib/kousatsu/article.ts
src/lib/kousatsu/artifact-store.ts
src/lib/kousatsu/database.ts
src/lib/kousatsu/ingest.ts
src/lib/kousatsu/pipeline.ts
src/lib/kousatsu/verify.ts
tests/kousatsu/network.test.ts
tests/kousatsu/observation-hydration.test.ts
tests/kousatsu/p1-pipeline.test.ts
tests/kousatsu/p1-verification.test.ts
```

追加34件（フォント11件はmanifestに全ファイル名・hashを収録）：

```text
docs/AUTONOMOUS_DEVELOPMENT_PROGRESS.md
docs/LOCAL_RESEARCH_RUNTIME.md
docs/OBSERVATION_STORAGE.md
public/fonts/geist/*.woff2 (11 files)
public/fonts/geist/OFL.txt
public/fonts/geist/README.md
public/fonts/geist/manifest.json
scripts/kousatsu-worker.ts
scripts/verify-observation-react.mjs
src/app/api/kousatsu/route.ts
src/app/geist-fonts.css
src/components/kousatsu/ResearchConsole.tsx
src/components/kousatsu/useResearchRuntime.ts
src/components/observation/observationStorage.ts
src/lib/kousatsu/runtime-config.ts
src/lib/kousatsu/runtime-http.ts
src/lib/kousatsu/runtime-service.ts
src/lib/kousatsu/runtime-status.ts
src/lib/kousatsu/runtime-store.ts
src/lib/kousatsu/runtime-types.ts
tests/fixtures/kousatsu-v1.sql
tests/kousatsu/migration-preservation.test.ts
tests/kousatsu/runtime-http.test.ts
tests/kousatsu/runtime.test.ts
```

候補ファイルにenv、DB、cache、node_modules、1MiB超の追加ファイル、秘密情報の高確度署名は検出されなかった。任意形式の秘密情報がないことまで機械検索だけで保証しない。

## 5. 未確認事項と次のゲート

1. **実ブラウザ**：接続一覧が空で利用不可。実ユーザーの保存状態を保護した検証プロファイルで、初期読込、複数タブ、端末／メモ、実画面を確認する。
2. **3D・音声**：sparse除外48件（271,550,826 bytes）は元ツリーで不在のまま、全Git blobはローカルに存在。選択したGLBはThreeのGLTFLoaderで251 mesh、15,623 vertex、14,238 triangleを読込確認。MP3はフレーム構造とHTTP配信を確認したが、デコード・音響・WebGL表示は未確認。必要資産だけを隔離環境で使い実ブラウザ検証する。
3. **BGM**：`public/bgm/common-night-loop.mp3`は作業ツリー・HEAD・ローカル履歴で見つからない。出所・所在未確認。代替していない。
4. **実DB**：既定DB不在、環境変数未設定、対象内の実DB候補なし。別パスの利用履歴は未確認。存在する場合は原本を直接開いて移行せず、SQLite online backupコピーで検証する。
5. **モデル／音声エンジン**：Ollama 11434、VOICEVOX 50021は接続拒否。実推論の品質・実合成を未確認。ダウンロードや起動は行っていない。
6. **スケジューラ**：Windowsタスクの照会が権限拒否で未確認。今回のworkerは起動中だけ動く。再起動後の自動実行や長時間稼働を検証してから運用へ進む。
7. **保存容量と競合**：ブラウザjournalは履歴を自動削除しないため容量上限がある。quota時は安全停止。Markdownの手編集は上書きしないため、衝突は利用者による比較・退避が必要。
8. **再現環境**：元node_modulesの版差は残る。今後の開発・検証もlock準拠コピーを使う。lifecycle scripts有効の新規installは今回未検証。

前回の重大なデータ喪失2経路は再現テストで解消し、収集・保存・復旧のローカル経路は実HTTPと公開RSSで確認できた。その範囲で段階導入を進められる。一方、重要資産と実画面の確認がないため、既存の3D・音声を含めた完成宣言や外部公開の判定には進まない。

## 6. 証跡と操作手順

操作：[ローカル調査の運用](LOCAL_RESEARCH_RUNTIME.md)、[観察記録の保存](OBSERVATION_STORAGE.md)。

Git管理外の`tmp/autonomy-work/`に以下を記録した。外部tempは長期保存を保証しないため、後日再検証する際は保持状態を確認する。

- `location.txt`、`validation-location.txt`、`validation-source-manifest.json`：保全先とコピーのhash。
- `final-safety-audit.json`：開始時比較、backup／bundle、index、sparse、実DB不在、候補点検。
- `database-gate-fixed.ts`、`database-gate-fixed-result.json`：旧実装からの合成移行probe。
- `production-http-probe.mjs`、`production-http-result.json`：本番HTTPの実行と14項目。
- `live-feed-probe.ts`、`live-feed-result.json`、`live-feed-attempt-sandbox.json`：実TLS取得と通信制約の記録。
- `asset-validation.json`、`asset-loader-validation.json`、`local-environment-validation.json`：資産・環境の到達範囲。
- `baseline-relative.patch`、`baseline-relative-files.json`：ユーザーの開始時変更と今回の変更を分けるレビュー資料。
- 隔離コピーの`validation-tests.log`、`validation-build.log`：コマンド出力。

コミット候補を承認する前に、既存P1実装を含む未コミット作業との依存関係を確認する必要がある。今回はコミットしていない。
