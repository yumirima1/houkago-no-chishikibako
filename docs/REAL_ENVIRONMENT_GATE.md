# 考察箱：最終統合前の実環境検証ゲート

検証日：2026-10-25（日本時間）。判定：**NO-GO**。

lockfile準拠環境を作成でき、再試験では型・Lint・全テスト・buildが通った。しかし、ブラウザ初期保存で既存データを失う実行順序と、破損した旧DBの根拠行を移行時に黙って落とす経路を再現した。テスト成功だけでデータ安全性を承認しない。

今回は診断・検証・修正計画のみ。既存P1コードと既存56テストは変更していない。参照：[監査](INTEGRATION_READINESS_AUDIT.md)、[P1限定修正](P1_LIMITED_FIXES.md)。

## 1. 保全とGit状態

| 項目 | 開始時／終了時 |
| --- | --- |
| 作業ディレクトリ・Gitルート | `D:\AI\Projects\houkago-no-chishikibako` |
| ブランチ | `chore/rename-kousatsu`を維持 |
| HEAD | `6a97997c0c01bae4d62a7d2e5eb8147f135b8e71`を維持 |
| 未ステージの追跡ファイル | 11件→11件。既存変更を保持 |
| 未追跡ファイル | 27件→29件。本報告書と診断テストを追加 |
| ステージ | 開始・終了ともなし |

開始時の258実在ファイルを`C:\Users\yumir\AppData\Local\Temp\kousatsu-gate-kyLnvO\source`へコピーし、SHA-256を照合した。sparse除外の48パスは不在として記録。終了時も258件のhashが一致し、48パスは不在のまま。以前からの未追跡P1実装・監査文書も含め、開始時ファイルの内容は変更していない。

`tmp/gate-work/location.txt`に隔離先、`preservation.json`に照合結果がある。実際のインストール・実行先は別の`locked-source/`。元のnode_modules・package.json・package-lock.jsonに変更はない。

push、デプロイ、外部公開、Git操作による破棄、資産の展開／復元はしていない。通信は依存tarballと既存指定Google Fontsの取得に限定し、install script・audit・fund・Next telemetryは無効にした。

## 2. lockfile準拠環境

Node.js 24.15.0、npm 11.12.1、Next.js 16.4.3。manifestとlockの依存定義は一致する。元のnode_modulesには前回と同じ直接依存8件の版差がある。

| 依存 | lock | 元の実体 |
| --- | --- | --- |
| @react-three/drei | 10.7.7 | 10.7.9 |
| @react-three/fiber | 9.6.1 | 9.8.2 |
| @tailwindcss/postcss | 4.3.0 | 4.3.3 |
| @types/react | 19.2.15 | 19.3.0 |
| @types/react-dom | 19.2.3 | 19.3.0 |
| eslint | 9.39.4 | 9.39.5 |
| tailwindcss | 4.3.0 | 4.3.3 |
| tsx | 4.22.3 | 4.23.15 |

### インストール

既存キャッシュからlock指定tarball357件だけを隔離キャッシュに複写し、オフラインの`npm ci`を試した。zustand 5.0.14のキャッシュ不足でENOTCACHEDとなった。この失敗先のnode_modulesにcleanupのEPERM警告も出たため、そのコピーを再利用せず別の新規ディレクトリを使用した。元リポジトリのnode_modulesは対象にしていない。

次の条件で、必要な通信を許可した新規コピーへのインストールが成功した。

```powershell
# cwd: C:\Users\yumir\AppData\Local\Temp\kousatsu-gate-kyLnvO\locked-source
npm.cmd ci --ignore-scripts --no-audit --no-fund --prefer-offline --cache ..\npm-cache --logs-dir ..\npm-logs
```

428パッケージをインストールし、実在する全428パッケージのversionがlockと一致することを確認した。lockfile自体のbytesも元と一致。依存の一括更新はしていない。

`npm ls --depth=0`では6件のWASM／optional関連パッケージがextraneous表示されたが、いずれもlockに存在し、版は一致する。新規コピーでのci結果として記録し、手動削除していない。通常のlifecycle scriptを有効にしたインストールは未検証。

### コマンド結果

| 実行 | 結果・意味 |
| --- | --- |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run lint` | 成功、警告なし |
| `npm.cmd run test:kousatsu` 初回 | 60/61成功、1失敗。強制終了試験がexport境界より前にlease失効 |
| 失敗した強制終了試験の単独実行 | 1/1成功 |
| `npm.cmd run test:kousatsu` 再実行 | 61/61成功。初回失敗を解消済みとは扱わない |
| `npm.cmd run build` 通信制限下 | Geist／Geist MonoのGoogle Fonts取得で失敗 |
| 同じbuildを通信可能条件で再実行 | 成功。コード・フォント設定・lockは変更していない |
| 独立DB／P1 probeをlock環境でも実行 | 診断完了。下記の正常動作と問題を同様に再現 |
| `git diff --check` | 成功 |

61件は既存P1等56件＋今回のブラウザ診断5件。後者は危険な現在動作をassertする診断であり、通過は安全になったという意味ではない。

強制終了試験のchildは`leaseMs: 200`、失効待ちは固定300ms。初回ではcold loadや並列検証の負荷下でheartbeatが間に合わず、停止させたい境界に達する前に正しく安全停止した。単独／warm実行では通ったため、時間依存のある試験として残す。production既定30秒のlease破損を確認したものではない。既存テストの期待値や時間設定は今回変更していない。

クリーンbuildにはGoogle Fontsへ到達できるネットワーク、または承認されたキャッシュ／将来のローカルフォント方針が必要。今回、代替フォントやUI変更は追加していない。

## 3. DB移行ゲート

### 実DBの所在

実プロジェクトで`KOUSATSU_DB_PATH`は未設定、既定`data/kousatsu/kousatsu.sqlite`と`data/`は不在。ignoreを含むリポジトリ走査でもDB候補は見つからなかった。tmp・tests・依存・build・Git内部は除外した。外部パス、任意のCLI `--db`指定、拡張子のないDBの所在は未確認。

**実DBの移行試験は未実施**。以下は旧ソースで作った合成v1 DBだけの結果。

### 正常な合成DB

- 旧形式で2出典・2文書・主張・根拠・関係・job・analysis・仮説・記事・検証・checkpoint等を作成。
- 元DBはreadOnly接続し、SQLite backup APIで新規検証コピーを作った。
- 16の元テーブルについて件数、ID、既存列を比較。schema_migrationsの追加と意図したitems hash再計算以外は保持した。
- 文書版、出典関連、旧hash、版不明の旧主張／根拠、現行検索、FTS検索、再オープン時の冪等性を確認。
- 元DBのSHA-256は不変。

### 失敗時のロールバック

article_claimsに壊れた参照を入れた別の合成DBコピーでは、移行はFK検査で失敗。対象コピーの元テーブル・全行がロールバックされ、元DBのhashも不変だった。

### 不合格：孤立した根拠行が黙って消える

別の合成v1 DBで、evidenceのitem_idを存在しない値にした。移行前はFK違反と`evidence-1`が1件ある。検証コピーの移行後はevidenceが0件になり、エラーなしでschema version 2へ進んだ。

原因は`src/lib/kousatsu/database.ts:404-405`の`INSERT INTO evidence_v2 ... JOIN items_v2`。参照先がない行を移行前に除外するため、後段のFK検査だけでは喪失を検出できない。入力DBは元から破損しているが、壊れた記録を消して移行成功とすることは保全要件を満たさない。元の合成DBは不変で、実データへの操作はない。

最小修正計画：

1. 移行開始前に旧DBのforeign_key_checkを行い、不整合なら診断して停止する。
2. transaction内で移行前後の件数・ID集合を比較し、行が欠けたらcommitしない。
3. 孤立evidence、孤立claim、壊れたarticle_claimsの各ケースで「元行保持＋明示失敗」の回帰試験を追加する。
4. 正しい実DBが見つかったらreadOnly backupコピーで同じ検査をする。原本をアプリconstructorへ直接渡さない。

## 4. ブラウザ初期読込ゲート

実ブラウザ接続の一覧は空で、ブラウザ操作は未実行。ユーザーの実localStorageは読んでおらず変更していない。

新規`tests/kousatsu/observation-hydration.test.ts`は、変更していない実hook・ListeningRoom・subjectEngineをTypeScriptで変換して実行する。Reactのschedulerとwindow/storage、子ビュー等だけを制御用fixtureへ置き換えた。functional updaterを同期評価し、effect後の再renderを処理した後で初期読込timerを動かす実行順序を試す。実React・StrictMode・実ブラウザの全スケジュールを再現する試験ではない。

### 原因と再現

- `useObservationState.ts:139-145`：初期状態は空ログ・既定関係で、保存値の読込はsetTimeout(0)へ遅延。
- `ListeningRoom.tsx:657-661`：初回effectが未選択を判定し、fallbackを選ぶ。
- `useObservationState.ts:131-134`：読込前に選択値を即保存し、visitを記録。
- `useObservationState.ts:103-124`：空ログ・既定関係に基づく値をstorageへ書く。

制御順序では保存済みkana選択がtartarへ、過去ログIDが消失、kanaのtrust 90が既定24へ変わった。初回に作ったログへ観察を追加して2件にした後、再読込で1件になる条件も再現。初期読込を先に済ませた対照ケースでは保存値を保持した。

5件の診断は、既存状態、初回・再読込、早い操作と読込後操作、複数操作の順序、保存失敗を扱う。setItemの例外伝播と「ログだけ保存、関係は旧値」という部分更新も確認した。**コード上のデータ喪失条件の再現であり、実ブラウザでの必発や特定頻度を確認したとは報告しない。**

最小修正計画：

1. hookに初期読込完了と保存エラーの状態を明示する。
2. 完了前の自動選択・保存を抑止するか、順序付きで待機する。
3. storage不能・不正JSONを「新規の空状態」と混同せず、既存値を保護する。
4. setItem失敗を捕捉し、複数キーの部分保存に対する再試行・回復方針を決める。
5. 診断を履歴保持の回帰試験へ変え、実React・StrictMode・実ブラウザでも確認する。UI再設計は不要。

## 5. P1-A〜Eの独立再確認

既存テストとは別に8シナリオのprobeを実行し、lock環境でも再確認した。各probeの終了0は診断の完了であり、問題ケースの解消を意味しない。

| 対象 | 確認できたこと | 残る問題・制約 |
| --- | --- | --- |
| A | 3出典を統合後、1出典だけ改訂しても他2出典・旧版・主張・全関連履歴を保持 | 上記の破損v1 evidence移行で喪失あり。実DBは未確認 |
| B | 分類不一致を拒否。passedでもfactCheckStatusはunverified | evidence.locatorを未追跡URLへ替えてもpassedになる |
| C | 欠落検証JSONをDBから復元し、既存Markdownを保持 | 完了後に記事が改訂されると、旧jobの欠落Markdownはresumeが版不一致で停止。DB正本は残る |
| D | 入力固定・安全停止、非主出典追加時も固定snapshotを使用。生存workerを停止させ、別workerが引継ぎ、復帰した旧workerの書込みを拒否 | 200ms leaseを使う強制終了試験に時間依存性。原本破損は確認していない |
| E | production／previewの共通パス、読込、壊れたJSON拒否を確認 | 実合成・再生・3D表示は未確認 |

locatorの修正案は、版に対応した出典URL集合をpinして照合すること。現行のitem.urlと単純比較すると、正しい過去aliasまで拒否するため避ける。

履歴ノート復旧の修正案は、終端job専用にDB内draft／verify／export hashとleaseを検査する経路を設けること。通常の途中resumeに必要な現行版検査は維持する。現在の動作は安全停止で、DB内の履歴Markdownを失ったわけではない。

## 6. 最小修正計画と再ゲート条件

| 優先度 | 対象 | 完了条件 |
| --- | --- | --- |
| 必須 | 初期読込前の保存禁止とstorage失敗処理 | 保存済みログ・選択・関係を保持し、読込前操作／再読込／失敗の回帰と実React試験を通す |
| 必須 | DB移行前のFK検査と件数・ID保持検査 | 不整合な旧DBを明示拒否し、原本・対象コピーの元行を失わない |
| 必須 | 強制終了試験の時間依存除去 | 起動・transpile時間に十分なleaseを使い、固定sleepではなく実際の失効を期限付きで待つ。排他・復旧・重複禁止の期待値は維持 |
| 要対応 | evidence locator照合 | 版ごとの正当なaliasを許可し、未追跡locatorを拒否 |
| 要対応 | 終端jobの履歴export復旧 | 後続改訂後もDBの旧Markdownから欠落を復元し、手編集を上書きしない |
| 環境確認 | 実DB・実ブラウザ・必要な3D／音声 | DBの所在を確認しコピーで移行。利用可能なブラウザで保持と描画／再生を確認 |

上記は計画のみ。今回、既存実装やP1テストの設定を変更していない。最終統合を開始する前に、少なくともデータ喪失の2経路と試験の安定性を修正して再ゲートする。

## 7. 変更ファイルと証跡

今回の新規ファイルのみ：

- `tests/kousatsu/observation-hydration.test.ts`：現在の危険動作を再現する5診断。
- `docs/REAL_ENVIRONMENT_GATE.md`：本報告書。

既存のアプリ、P1コード、56テスト、設定、lock、監査文書はすべて開始時と同じ内容。ステージ・コミットはしていない。

ignore対象の診断証跡：

- `tmp/gate-work/database-gate.ts`、`database-gate-result.json`：合成移行、元16表の件数・ID、原本hash、rollback、孤立根拠行の診断。
- `tmp/gate-work/p1-probe.ts`、`p1-probe-results.json`：8独立シナリオ。
- `tmp/gate-work/lock-validation.json`：隔離環境・コマンド結果・初回失敗と再実行結果。
- `tmp/gate-work/dependency-drift.json`、`preservation.json`、`location.txt`：版差・保全・隔離先。

外部一時ディレクトリの`locked-source/tmp/gate-work/`にも、lock環境で実行したprobe結果がある。一時ファイルは長期保管を保証しない。秘密情報や実DB内容はレポートへ出力していない。

## 8. 判定と未確認事項

**NO-GO**。重大なデータ保全上の問題が再現されており、限定的な未確認事項だけが残る状態ではない。ロック通りの依存取得・build成功や、診断を含む61試験の再実行成功からGOとは判断しない。

実DB、実ブラウザ、WebGL、実音声、Ollama、Windowsタスク設定、BGMの所在は未確認。48資産はsparse除外のまま。独立した事実確認・モデル品質・最終統合機能は試験していない。

次の作業は上記の最小修正と再検証。最終統合、3D再設計、資産一括復元、push、デプロイへは進まない。
