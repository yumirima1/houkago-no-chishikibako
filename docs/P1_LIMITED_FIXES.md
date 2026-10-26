# 考察箱：P1限定修正の結果と復旧手順

作業日：2026-10-25（日本時間）。基準資料：[最終統合前の監査](INTEGRATION_READINESS_AUDIT.md)。この文書は監査時点の記録を置き換えず、その後の限定修正を記録する。

## 1. 範囲と保全

- リポジトリ：`D:\AI\Projects\houkago-no-chishikibako`
- ブランチ：`chore/rename-kousatsu`
- 開始・終了HEAD：`6a97997c0c01bae4d62a7d2e5eb8147f135b8e71`
- 開始時：未ステージ11ファイル、未追跡20ファイル、ステージ済みなし。前回の19件に監査文書1件が加わっていた。
- 旧バックアップ273ファイルのSHA-256とGit履歴bundleを再検証済み。
- 今回の開始時コピー：`C:\Users\yumir\AppData\Local\Temp\kousatsu-p1-baseline-95qIMr`。296ファイル、4,957,912 bytesを保存し、全件ハッシュ照合した。`files/`、manifest、開始status、差分、index、HEADを保存。node_modules／.next／.git本体はコピー対象外。
- 実データのDB・音声・モデルは変更していない。既定の`data/kousatsu/kousatsu.sqlite`は開始時・終了時とも不在で、作成していない。
- 旧ソースの再現試験も、保存コピーを読み取り、別の一時DB・一時ノートだけで実行した。
- ステージ・コミット・push・デプロイ・資産復元は実行していない。最終統合や3D/UIの変更も行っていない。

一時ディレクトリはOSによる削除対象になり得るため、長期保全先ではない。コミット方針を決めるまで、上記コピーと以前のリポジトリ外バックアップを保持する。

## 2. 各P1の再現・修正・保証範囲

### P1-A：出典と文書の版管理 — 修正済み

旧実装を隔離実行し、別URL／別sourceの同文を取り込むと2番目の出典との対応がなくなること、同URLの更新で本文だけが変わりhashが変わらないこと、旧・新主張が現行として同時に返ることを再現した。

修正対象：`database.ts`、`types.ts`、`ingest.ts`、`knowledge.ts`。

- `item_versions`に変更しない文書スナップショットを保存する。
- `item_sources`はsource ID＋正規化URLをキーに現在の文書・版・元URL・外部ID・初回／最終取得日時を保持する。
- `item_source_versions`は過去の出典と版の関連を保持する。同じ出典・URL・版の再取得では関連行を重複させない。
- 同文の異なる出典を統合しても、両方の関連・URL・識別子を保持する。
- 統合された出典の一方だけが更新された場合は、他方の現行内容を変更せずに分岐する。
- hashは実際に保存するtitle／summary／contentから計算する。metadata-onlyで破棄した本文をhash対象にしない。
- claims／evidenceに`versionId`を付ける。通常の`listClaims`は現行版だけを返す。履歴は`includeHistorical`、`getItemVersion`、`listItemVersions`、`listItemSources`で参照できる。
- 更新内容が別の既存文書へ統合された場合、出典がなくなった旧文書を現行検索から除外する。旧版・主張自体は残す。
- 現行文書の出典表示は現在も関連付いている出典を使う。
- source IDで既存とは異なるfeed URLを上書きする処理は、`SOURCE_IDENTITY_MISMATCH`で停止する。別feedには別のsource IDを指定する。

#### v1からの移行

schema version 2への移行はSQLite transaction内で行う。既存IDと行を保持し、表の制約を版・出典関連に合わせて更新し、foreign_key_checkが通った場合だけcommitする。実データには今回適用せず、旧形式の隔離DBで移行・再オープン・FK・integrityを試験した。

旧実装ではhashと本文が既に食い違っている可能性がある。移行では現存本文のhashを計算し、旧hashを`legacyContentHash`、来歴を`legacy-unknown`として残す。以前のclaim／evidenceは削除せず版不明として保存し、現行版へ無条件に割り当てない。現在の保存本文から改めて抽出した主張を現行版に関連付ける。

**保証しないこと：** 移行前に失われた出典や旧本文の復元、自然言語としての同義文判定、転載と独立報道の自動識別。実DBの場所が確認できたら、別途そのコピーで移行を検証する必要がある。

### P1-B：検証器の意味の厳密化 — 修正済み

旧検証器に保存claimとは異なる分類・本文を渡してもpassedになることを再現。修正前の検証器に対する最初の6回帰試験はすべて失敗した。

修正対象：`verify.ts`、`article.ts`、`types.ts`、`database.ts`。

- assertionと保存claimの分類・本文の不一致をエラーにする。
- assertionの対象文がMarkdown本文に存在することを確認する。
- 引用抜粋が保存文書に含まれること、claim／evidenceの版が選択文書と一致することを確認する。
- contradictsの根拠やcontradiction分類を隠さず、エラーと明示状態を返す。
- unverified分類を表示し、確認済みへ昇格させない。
- 従来の`status: passed | failed`は構造検査結果として維持する。追加フィールドは`scope: structure-and-references`と`factCheckStatus: unverified | contradicted`。
- `confirmed_fact`という保存分類があっても、独立確認したとは報告しない。Markdownの見出し・説明も独立確認前であることを明示する。
- 新しい構造検査通過記事のDB状態は`structurally_checked_draft`。旧データの`verified_draft`は履歴として保持するが、事実確認済みと解釈しない。旧reportでscope等がないものも未確認として扱う。

**保証しないこと：** 文章の真偽、証拠の論理的な十分性、発行元の独立性、矛盾の解消、LLMの推論の正しさ。`passed`もjobの`succeeded`も、この独立事実確認を意味しない。

### P1-C：ノートとDBの保存整合性 — 修正済み

旧実装の成功jobを保存後にノートだけ手編集しても、resumeが実体を点検せず成功を返すことを再現した。

修正対象：`pipeline.ts`、新規`artifact-store.ts`、`database.ts`。

**正本はSQLite**。Markdown正本は`articles.markdown`、検証JSON正本はDB内verify checkpoint。DB内export manifestに出力先と両方のhashを記録してから、実ファイルを公開する。

1. 分析／記事／検証結果と、それぞれのcheckpointを同じtransactionで保存する。入れ子はsavepointで扱う。
2. export manifestをDBへ保存する。ファイル名にはjobのUUID全体を使い、短いsuffixの衝突を避ける。
3. 保存先と同じディレクトリにランダム名で一時ファイルを排他的に作成し、書込・fsync・closeする。
4. hard linkで完成済みの内容を公開する。既存パスを置換しない。すでに同一bytesがあれば再試行成功、異なるbytes・ディレクトリ・symlinkなら`ARTIFACT_CONFLICT`で止める。
5. MarkdownとJSONの両方を確認した後、DB出力先とpublished checkpointをtransactionで保存する。

保存の途中で止まった場合、resumeは同じDB manifestと内容を使って不足ファイルだけを作る。成功jobのresumeでも実ファイルを点検し、欠落なら復元し、異なる内容ならユーザー編集を保持して停止する。DBの記事とdraft checkpointが食い違う場合も停止する。

手編集を検出したら自動でDBやファイルへ取り込まない。別名で保全して内容をレビューし、新規job／明示的な編集取り込みの方針を決める。今回、ユーザーノートの復元・変更は行っていない。

**保証の範囲：** 個々のファイルの公開は原子的で、ペア全体はDB manifestから回復できる。ファイルシステムとSQLiteの同時commitではなく、途中では片方だけが見えることがある。jobが完了するまでpublished扱いにしない運用が必要。

Windowsの一時ディレクトリと、このDドライブの隔離ディレクトリで公開・再開を確認した。hard linkを使えないファイルシステムでは安全に失敗する。電源断・ストレージ障害・DB破損・外部プロセスによる同時手編集まで保証しない。強制終了で残った固有名一時ファイルを無差別に削除する処理も追加していない。

### P1-D：ジョブ再開と排他制御 — 修正済み

旧実装ではcollect後にfixtureを変更しても、resumeが変更を検出せず成功することを隔離再現した。

修正対象：`pipeline.ts`、`database.ts`、`ai.ts`。

- execution checkpointに正規化した入力、fixtureのhash、Provider名・モデル・設定fingerprintを保持する。
- 選択した文書・版・出典関連、主張、根拠、関係をcheckpointへ固定する。
- resume時と非同期分析後のcommit前に、入力・設定・文書版・主張・根拠が変わっていないか点検する。
- 不一致では`CHECKPOINT_INPUT_MISMATCH`／`CHECKPOINT_VERSION_MISMATCH`で停止し、jobの`last_error`とdiagnostic checkpointへ記録する。異なる内容を同じjobとして続行しない。
- 変更のない再取得によるfetchedAt更新だけでは版変更と扱わない。
- SQLiteに有効期限付きleaseを置き、tokenで所有者を識別する。既定期限30秒、処理中は約10秒ごとに更新する。
- 同じjobの2番目の実行は停止する。DBの段階commitではtokenをtransaction内で再確認する。古い所有者は新しい所有者の処理結果を変更できない。
- 期限切れleaseを次の実行が取得すると、中断attemptをfailedとして閉じ、残り試行回数の範囲で再開する。`recover`も有効なleaseを回収せず、期限切れのrunning attemptを閉じる。
- 指紋のない旧checkpointは`LEGACY_CHECKPOINT_UNPINNED`で停止する。データは残し、新しいjobで再実行する。旧jobの根拠や設定を推測で補って続行しない。

Ollamaはendpoint・timeout・モデル・生成設定のfingerprintを持つ。独自Providerに実行設定がある場合は`configurationFingerprint`を実装する必要がある。任意の外部Providerの未申告設定までは検出できない。

**回復手順：** 正しいDBを明示して`resume --job <ID> --db <PATH>`。稼働中なら二重起動せず、異常終了ならleaseの失効を待つ。入力／版不一致なら旧jobを保存し、新規jobを作る。旧履歴を消して無理に再開しない。自動スケジューラーや無限retryは追加していない。

### P1-E：音声manifestのパス — 修正済み

生成側は`generated-audio/<id>/<id>.manifest.json`、読込側は誤って`generated-audio/episodes/<id>/<id>.manifest.json`を参照していた。

新規`scripts/lib/audio-manifest.ts`で両CLIのパス規則と読み書きを共有した。productionは既存生成先に統一し、previewは`<id>.preview.manifest.json`で分離する。欠落・不正JSON・duration・識別子不一致を明確なエラーにする。

音声URL・既存MP3・3D資産・公開データは変更していない。隔離したプロジェクトでmanifestを書き、実際のbuild-episode CLIが読めることを確認した。試験用MP3はプレースホルダーであり、実音声の合成・再生を確認したものではない。

## 3. 回帰テストと検証

既存13テストは変更・削除・期待値の緩和をしていない。追加43件、合計56件成功。

| 追加ファイル | 件数 | 主な確認内容 |
| --- | ---: | --- |
| `tests/kousatsu/p1-database.test.ts` | 12 | 複数出典・冪等性、旧版／旧主張、出典の分岐、孤立旧文書の検索除外、source ID再利用拒否、v1移行と履歴保持、transaction、lease／回復 |
| `tests/kousatsu/p1-verification.test.ts` | 10 | 分類・本文・Markdown差し替え、矛盾、抜粋、旧版／版不明、独立未確認の表示 |
| `tests/kousatsu/p1-pipeline.test.ts` | 17 | 各段階の例外・再試行、checkpoint書込失敗、手編集保護、欠落修復、入力／fixture／Provider／文書変更、heartbeat・二重実行、旧checkpoint停止、子プロセス強制終了後の回復 |
| `tests/kousatsu/audio-manifest.test.ts` | 4 | production／preview、欠落・不正値・不一致、隔離CLI連携 |

強制終了試験ではMarkdown公開直後に子プロセスを停止し、JSONが未保存であることを確認した後、lease失効後のresumeで復旧。記事・検証行は各1件、旧attemptはfailed、新attemptはsucceededとなった。完了jobの欠落ファイルの復元と、手編集ファイルを置換しないことも別に検証した。

| 実行 | 結果 |
| --- | --- |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run lint` | 成功、警告なし |
| `npm.cmd run test:kousatsu` | 56件成功、失敗0 |
| `npm.cmd run build` | 成功 |
| `git diff --check` | 成功 |
| P1差分の`git apply --check` | 開始時コピーに対して確認。既存変更と分離したレビュー用patchを用意 |
| 保存コピーの旧コードを使った隔離再現 | 出典消失、hash不更新、旧新主張混同、分類不一致の通過、fixture変更無視、手編集未点検を確認 |
| Dドライブの`tmp/p1-work/`でCLI run／resume／status | 成功。記事1件、構造検査scopeとunverified状態を確認 |

試験中の一時的な失敗は修正後に再試験した。新しいlease試験のWindows cleanup順によりEBUSYが発生したため、追加接続を閉じてから当該試験専用ディレクトリを削除する順序に直した。既存のテスト期待値を弱めて合格させていない。

## 4. Git差分と変更ファイル

今回編集した既存ファイル（開始時コピーとの差分）：

```text
scripts/build-episode.ts
scripts/generate-audio.ts
src/lib/kousatsu/ai.ts
src/lib/kousatsu/article.ts
src/lib/kousatsu/database.ts
src/lib/kousatsu/ingest.ts
src/lib/kousatsu/knowledge.ts
src/lib/kousatsu/pipeline.ts
src/lib/kousatsu/types.ts
src/lib/kousatsu/verify.ts
```

今回の新規ファイル：

```text
scripts/lib/audio-manifest.ts
src/lib/kousatsu/artifact-store.ts
tests/kousatsu/audio-manifest.test.ts
tests/kousatsu/p1-database.test.ts
tests/kousatsu/p1-pipeline.test.ts
tests/kousatsu/p1-verification.test.ts
docs/P1_LIMITED_FIXES.md
```

終了時もHEADは同じ、ステージ済みなし、未ステージの追跡ファイル11件。未追跡は開始20件＋新規7件＝27件。

開始時の296ファイルのうち285件はハッシュ不変。変更は上記既存10件と、型チェック生成物の`tsconfig.tsbuildinfo`のみ。開始時ファイルの欠落なし。既存の5テストファイルとfixture、設定／lock／README、3D/UI、監査文書は保持している。

レビュー用差分：`tmp/p1-work/p1-only.patch`。開始時バックアップを基準に作り、旧来の未コミット実装そのものを差分に含めていない。`git diff`では未追跡のエンジン変更が表示されないため、このpatchと新規テストを合わせてレビューする。

**コミット候補として未ステージのまま保持する理由：** エンジン・型・関連テストの基礎実装自体がHEADに存在しない未追跡作業であり、既存依存・package変更にも依存する。今回の変更だけを通常のGitコミットにすると基礎実装の追加も巻き込むため、安全に独立したコミットにはできない。基礎実装のレビュー／コミット方針が決まるまで、追加ステージ・コミットをしない。

## 5. 資産・環境の確認と残課題

- sparse checkoutの設定・追跡48パス・ローカルblob・合計271,550,826 bytesを再確認した。一括展開・ダウンロードはしていない。
- 最小の描画／再生確認に必要な候補は`public/models/window-side-room-authored.glb`と再生対象音声（代表例`public/audio/episode-037.mp3`）。全公開回の再生には対応する各MP3が必要。編集用blend、過去スクリーンショット、未参照モデル等を一律に復元する必要はない。
- 共通BGMの出所・所在地は未確認。代替音源は追加していない。
- manifestとlockの依存定義は一致するが、直接依存の実体には8件の版差がある。drei 10.7.7→10.7.9、fiber 9.6.1→9.8.2、postcss 4.3.0→4.3.3、React型19.2.15→19.3.0、React DOM型19.2.3→19.3.0、ESLint 9.39.4→9.39.5、Tailwind 4.3.0→4.3.3、tsx 4.22.3→4.23.15。
- 現在のnode_modulesで全検証は成功したが、lockを厳密に再現した環境の保証ではない。既存node_modulesの入替えや依存更新は行わず、別環境でlock準拠インストールを確認する課題を残した。
- Ollama実モデル、VOICEVOX実合成、実音声再生、WebGL描画、ブラウザ状態再読込、Windowsタスク登録は今回は未検証。前回監査の接続不可／照会失敗を成功へ読み替えていない。
- 観察localStorageの初期読込競合の疑いは今回の必須A〜Eとは別のUI検証課題として残る。3D/UIに修正は加えていない。
- DBを実データで移行する前に、そのDBのコピーと整合したbackupを用意して移行を確認する。旧コードで失った版・出典は自動復元できない。

## 6. 最終統合へ進めるか

必須P1-A〜Eはコードと隔離回帰試験の範囲で修正済み。設計レビューと、別環境／実データのコピーによる検証準備には進める。

一方、**最終統合を直ちに開始できるとの判断は保留**。基礎実装のGit管理、実DBコピーでの移行、lock準拠環境、必要資産を使う描画・再生、ブラウザ保存の保持確認が残っている。事実検証・AI記憶・UI接続・定期実行そのものは今回追加しておらず、単体試験成功を実運用の保証として扱わない。
