# 考察箱：最終統合実装前の監査・引き継ぎ

監査日：2026-10-25（日本時間）。対象：`D:\AI\Projects\houkago-no-chishikibako`。

今回の成果は名称変更のローカルコミットと現状監査のみ。最終統合の機能実装・既存不具合の修正・資産復元は行っていない。

## A. Gitとバックアップ

### 開始時と終了時

| 項目 | 確認結果 |
| --- | --- |
| 作業ディレクトリ／Gitルート | 上記パスと一致 |
| ブランチ | `chore/rename-kousatsu` |
| 開始HEAD | `a19a297809022f85d56eefec21ccd470f334966b` / Clean up mobile box navigation |
| 開始ステージ | 名称変更19ファイル、34行追加・32行削除 |
| 開始未ステージ | 11ファイル（付録1） |
| 開始未追跡 | 19ファイル（付録1） |
| 名称変更コミット | `6a97997c0c01bae4d62a7d2e5eb8147f135b8e71` / `chore: rename project to kousatsu-bako` |
| 終了ステージ | なし |
| 終了未ステージ | 開始時の11ファイルを保持 |
| 終了未追跡 | 開始時の19ファイル＋本報告書1ファイル |
| リモート | `https://github.com/yumirima1/houkago-no-chishikibako.git`、変更なし |
| 追跡ブランチ | 作業ブランチには未設定。`main`は`origin/main`を追跡 |

直近の既存履歴は `a19a297`、`d97b412`、`25d2f33`、`a4f382c`、`8adb377`。履歴の書換えはしていない。

コミット前にステージの全差分を読み、以前の `rename-staged.patch` と完全一致することを確認した。README・package.json・package-lock.jsonの既存機能変更／依存更新は含めていない。19件は既存の追跡済みテキストのみで、秘密情報・キャッシュ・新規生成物・資産を追加していない。`git diff --cached --check` も成功。

最初のコミット実行は自動承認レビューが「明示承認を確認できない」と拒否した。今回の添付指示書第3節条件Aの明示的なコミット指示を再提示し、同じ限定操作の再審査が通った後にコミットした。迂回操作は行っていない。コミット後にHEAD・対象19件・statusを確認した。

### バックアップの再検証

保存先：`D:\AI\Projects\kousatsu-backup-2026-10-25T08-03-58-577Z`。

- ディレクトリ、`REVIEW.md`、`manifest.json`、`history.bundle`、`rename-staged.patch`、開始時status、indexの保存を確認。
- manifestの273ファイル全件について、保存コピーのSHA-256を再計算して一致。
- `git bundle verify` 成功。履歴は完全と報告され、必要な前提履歴の欠落なし。
- 現在の名称変更ステージと保存済みレビュー差分はコミット直前まで完全一致。
- 再バックアップ・既存バックアップの上書きは不要で、実施していない。
- `node_modules`と`.next`は以前のバックアップ対象外。履歴はbundle、作業ファイルは`files/`に保護されている。
- sparse checkoutで除外中の48資産は作業ファイルコピーには含まれない。現在のローカルGit内に全blobがあることを別途確認した（D節）。

今回の開始時には、追跡対象279件＋未追跡19件＝298パスのうち、実在250件のSHA-256と、sparse除外で不在48件の状態を `tmp/integration-audit-2026-10-25/start-manifest.json` に記録した。終了時に実在250件のハッシュ・不在48件とも一致を確認した。秘密情報の内容は記録せずハッシュのみ。これは旧バックアップの代替ではなく監査用証跡。

## B. 既存実装一覧

「実装済み」はコードと呼出経路があるという意味。「実行確認」は今回実行した範囲を記す。ブラウザ操作と実音声生成は未実行。

| 主要ファイル | 役割・依存関係 | 実装状態／今回の確認 |
| --- | --- | --- |
| `package.json`、lock、`tsconfig.json`、`eslint.config.mjs`、`next.config.ts` | Next.js／React／TS／Tailwindの構成 | 型・Lint・本番build成功。依存実体の差異はE節 |
| `src/app/page.tsx`、`src/data/episodes.ts`、`generatedEpisodes.ts` | 生成TSからエピソードを静的読込 | ホームHTTP 200。SQLite／CLIとの接続なし |
| `src/app/layout.tsx` | 日本語ページ・タイトル・Googleフォント | HTTPでtitle「考察箱」、旧正式名なし |
| `src/components/ListeningRoom.tsx` | 部屋・端末・メモ・放送パネル・モバイル切替・HTML audio | 実装済み。モバイル観察箱は「準備中」。再生・画面操作は未確認 |
| `src/components/room/RoomSceneRoot.tsx` | 環境設定・WebGL・reduced motionに応じ3D／2Dを選択 | 実装済み、描画未確認 |
| `src/components/room/RoomScene3D.tsx`、`globals.css` | R3F Canvas、Drei、GLB、光、粒子、カメラ、小物反応、雨・CRT演出 | 既存演出。AIの自律行動ではない。モデルはsparse除外 |
| `src/components/observation/subjectEngine.ts`、`themeEngine.ts` | 時刻・関係・最近の行動に応じた定義済み反応、テーマ候補 | 規則処理。実AI推論なし。候補はブラウザ内オブジェクト |
| `src/components/observation/useObservationState.ts` | 対象・観察ログ・関係をlocalStorageに保存 | 実装済み、ログは最大40件。初期読込競合の疑いはC節 |
| `src/hooks/useAmbientAudio.ts` | 共通BGMの存在確認・フェード・音量保存 | BGM実ファイルがない。HTTP 404 |
| `src/hooks/useBroadcastAmbience.ts` | 雨・風・室内・雷をWeb Audioで合成 | 外部音源不要。音の実出力は未確認 |
| `src/app/room-export/page.tsx` | 3D書き出し用プレビュー | HTTP 200。モデル描画・保存は未確認 |
| `src/app/api/export-room/route.ts`、`src/lib/room-export-security.ts` | 開発限定・明示許可・同一Origin・25MiB制限・GLBヘッダ検査、一時保存後rename | 既存テスト成功。本番POSTは403。固定先GLBを変更する成功保存は未実行 |
| `scripts/generate-episode-seed.ts`、`generate-conversation-skeleton.ts`、`generate-draft-script.ts`、`generate-script.ts` | 企画・骨格・台本制作 | 規則／定型ベースの別CLI系統。新規音声制作は未実行 |
| `scripts/review-script.ts`、`scripts/lib/production-gates.ts`、`episode-schema.ts` | 台本警告・公開可否・実音声時間の検証 | gate単体テスト成功。manifestパス不一致あり |
| `scripts/generate-audio.ts`、`scripts/lib/tts-provider.ts` | VOICEVOX HTTP、発話キャッシュ、WAV結合、MP3変換、実時間manifest | 実装済み。既定はloopback:50021、speaker 13／8。実Engineによる生成は未実行 |
| `scripts/build-episode.ts`、`scripts/lib/episode-site-data.ts` | 公開メタデータと生成TSを書込 | 実装済み。既存のmanifestパス不一致で通常連携に問題 |
| `scripts/weekly-episode.ts`、`content/memory/program-memory.json` | 番組記憶から週次候補と計画JSONを生成 | 単発計画CLI。スケジューラーでも経験学習でもない |
| `src/lib/kousatsu/database.ts` | Node内蔵SQLite、FTS5、FK、WAL、transaction、backup | 既存テスト・隔離CLIで実行確認 |
| `src/lib/kousatsu/ingest.ts` | RSS／Atom、URL正規化、重複排除、遠隔取得制限 | fixtureとモックネットワーク試験成功。実フィードの取得運用は未確認 |
| `src/lib/kousatsu/knowledge.ts` | source_claim・evidence・similar_topic生成 | fixture・監査probeで実行確認。類似は文字列指標 |
| `src/lib/kousatsu/ai.ts` | Provider抽象化、deterministic／Ollama | deterministic実行成功。Ollama loopback接続は拒否され実モデル未検証 |
| `src/lib/kousatsu/article.ts`、`verify.ts` | 脚注付きMarkdown組立、構造・参照検査 | 完走・不正入力probe確認。事実検証の保証なし（C節） |
| `src/lib/kousatsu/pipeline.ts`、`types.ts` | collect→classify→relate→analyze→draft→verify→export、段階checkpoint | 完走・collect後の例外からresumeを確認。実クラッシュ・並行実行は未検証 |
| `scripts/kousatsu.ts` | init／ingest／run／resume／recover／backup／search／status | 隔離DBで8回のコマンド実行確認。Web接続なし |
| `config/kousatsu-sources.json`、`docs/KOUSATSU_ARCHITECTURE.md` | 情報源設定の空雛形と既存設計 | ファイル実在。ただし設定JSONを読み込む実装なし |
| `content/kousatsu/articles/ai-ebe8bda6.*` | 既存のMarkdown・検証JSON実出力 | 実在。対応する既定DBは不在で、過去出力との整合は未確認 |

WebのAPIは現在GLB exportのみ。端末・メモは観察ログ／定型thoughtを描くもので、実ファイルブラウザーや仮想デスクトップ、記事管理画面ではない。テーマ候補の`exportPreview`／`sourceLogIds`にもダウンロードやAPI送信の呼出はない。

`BoxRoom*`、`BroadcastRoomBackground`、`RainyNightBackground`、`AudioPlayer`、`EntrySubjectSelect`等は残存実装。現在のpage→ListeningRoomから未参照のものを、未実装や削除候補と混同しない。今回は保全した。

## C. 記憶・正確性・ノート機能

### 記憶の充足状況

| 要件 | 状態と実態 |
| --- | --- |
| 情報・取得経験の記録 | 実装済み：items／sources／fetch_runs／jobs／attempts／checkpoints |
| 自分の分析・仮説の保存 | 実装済み：analyses／hypotheses。後者はunverified |
| 保存分析や仮説の再想起 | 未実装。次runの検索対象はitemsで、analysis／hypothesis／生成ノートは含まない |
| 過去情報の検索 | 実装済み：FTS5 bm25、ヒットなしなら日本語部分一致LIKE。fallbackは公開／作成日順 |
| 記憶間の関係 | 部分実装：タイトル・要約の語／bigramの類似。意味理解・因果・分野横断推論は未実装 |
| 事実／推論／意見／仮説／未確認／反証の区分 | 型・DB区分あり。通常抽出はsource_claim、分析・仮説は別保存。自動反証・独立確認は未実装 |
| 関心・重み・時間減衰・再活性化 | 未実装。参照頻度・経過時間による検索優先度の変更もなし |
| 解釈の改訂・理由・根拠の履歴 | 未実装。記事版や判断履歴のスキーマが必要 |
| 記憶から次の調査を選ぶ | 未実装。source／topicはCLI入力 |
| ブラウザ観察との接続 | 未実装。localStorageの記録はSQLiteとは別管理 |
| 番組記憶 | JSONを台本・週次計画CLIが読む。実行経験から自動更新する処理はない |

減衰を実装する際は原記録の削除ではなく検索重み・想起優先度の変更を優先する。既存ログ40件制限はブラウザ観察の現行仕様であり、永続的なAI記憶としては扱えない。

### 情報の正確性と保証範囲

URL・タイトル・著者・公開日・取得日、feed名、要約／本文、evidenceの抜粋・locatorは保存できる。発行元の厳密な識別、情報源信頼性、原典／転載の系譜、訂正履歴は専用データがない。claim confidenceは固定0.5で、評価済み信頼度ではない。

`verify.ts:28-83` の検査は、主張ID・supports根拠・非空抜粋・Markdown内の出典URL・必須見出し・保存済みリンクの存在を確認する。真実性、資料の独立性、抜粋が保存本文にあること、抜粋が主張を支持すること、LLMの要約が資料に忠実なことは保証しない。本文の新旧、反証、最新性、URL到達性も検証しない。

`source_claim`は独立未確認のwarningを出すが、errorがなければ`passed`になる。DBでは`verified_draft`、jobでは`succeeded`になるため、この状態は**構造・参照検査を通った下書き**と読む。独立した事実確認済みという意味ではない。生成Markdown自体も独立未確認と人間確認の必要性を表示している。

通常の抽出は毎回source_claimを指定し、保存の反復だけでconfirmed_factへ自動昇格しない。ただし検証器はassertionとDB claimの分類・本文一致を確認しない。confirmed_factの設定を独立根拠数のDB制約が守る実装もない。

### 再現済みの問題

既存ソースを変更せず、`tmp/integration-audit-2026-10-25/probe.ts`と専用一時DBで以下を確認した。

1. **別出典の同文記事で出典の対応が失われる。** `database.ts:402-425` はURLまたは全出典共通content_hashで1行に統合する。異なるsource／URLで同じtitle・summaryを取り込むと、2番目のsourceに所属するitemは0件となり、最初のsource／URLだけが残った。転載を独立根拠として増やさないことと、出典履歴を捨てることは別問題。
2. **同URL更新でhashと本文が不一致になる。** 同URLのOLD→NEW summaryで本文は更新されるがcontent_hashは不変だった。古いclaimと新しいclaimが版識別なしに一緒に返り、古いexcerptが現行本文になくても検証はpassedになった。
3. **検証器は主張の分類・本文の不一致を拒否しない。** 保存claimがsource_claimでも、assertion側をconfirmed_fact・別本文にした単体probeはpassedになった。これは検証器の保証不足であり、通常の組立経路で自動昇格が発生したという報告ではない。

これらは名称変更ではなく、以前からの未コミット実装にある問題。今回は修正していない。

### 静的に確認した不足と未検証リスク

- `scripts/kousatsu.ts:32` の既定source IDは遠隔feedでも`local-fixture`。複数feedをsource ID指定なしで使うと、`database.ts:319`で過去sourceの説明／URLを変えてしまう条件がある。
- `pipeline.ts:110-152` はresume時にitems／claimsを再検索する一方、analyze／draft／verifyの古いcheckpointを再使用する。別runによるDB更新を挟むと版が混在し得る。入力版固定の検証が必要。
- `saveAnalysis`／`saveArticle`／`saveVerification`とcheckpoint保存は同一transactionではない。境界で停止すると再実行で重複行を作る余地がある。
- `database.ts:728`のattempt開始は同じrunning jobを取得する排他／lease／heartbeatを持たない。自動実行・UI接続前に多重実行試験が必要。
- `recover`はjobの状態を変えるのみで、自動resumeしない。attemptのrunning状態も回収しない。HTTP取得のretryとjobの自動retryは別物。
- `useObservationState.ts:140-145`の保存読込はsetTimeoutで遅延するが、`ListeningRoom.tsx:657-661`の初回effectは先に空状態からvisitを保存し得る。再読込で既存ログ・関係を上書きする疑いがある。ブラウザ未接続のため**未再現**。JSONの形状検証、setItem失敗の扱いも要確認。
- エピソード公開範囲は`episodes.ts:35-36,138-160`で#037まで固定、画面文言も固定。将来#038以降を公開しても出ない。連続再生は未フィルタの配列を使い、公開一覧との対象規則が異なる。

### ノートとローカル保存

実際のWindows作業ディレクトリにUTF-8・LFのMarkdownと検証JSONを書き込む実装がある。今回も明示的な一時保存先で動作確認した。Web画面だけの仮想ファイルとは異なる。

- ファイル名はASCII slug＋job UUID先頭8文字。ASCIIのないtopicではUTC日付を含むfallbackになる。日本時間の日付を常に含む仕様ではない。
- 今回の日本語topicでは同日2runが異なるファイル名になり、先のファイルを保持した。8文字の衝突や既存手編集の保護を保証する仕組みはない。
- SQLiteのarticle→claim→evidence→item関係と、ノートの外部出典脚注はある。Markdownに内部IDや過去ノートへの直接リンクはない。
- CLI searchは元itemsだけを検索する。生成ノート／過去分析を再検索するAPI・UIはない。
- `pipeline.ts:34-38,198-229` はファイル単位で一時書込→renameを行うが、Markdown・検証JSON・DB出力パスは一括commitではない。片方のファイルだけ成功する場合やDBにverified_draftだけが先に残る場合がある。
- exportの再実行は既存ファイルを置換し得る。成功jobのresumeは保存済みファイルの有無・内容を再点検しない。同一processの並列処理は同じPID付き一時名で競合し得る。
- 正常系で2ノートのファイル内容とDB markdownの一致、SQLite integrity_check、backup integrity_checkを確認。クラッシュ・保存途中失敗・多重実行の耐性は未確認。
- 過去の既存ノートに対応する既定DBがないため、その過去出力とDBの整合性は未確認。監査のstatus/searchも必ず一時`--db`を指定した。これらのCLIはconstructorでDBを作成・migrateするため、純粋な読取操作ではない。

## D. 3Dルーム・音声・外部資産

主因は削除やLFS不足ではなく、現在の**sparse checkoutによる除外**。

```text
core.sparseCheckout=true
core.sparseCheckoutCone=false
/*
!/public/audio/
!/public/backgrounds/
!/public/exports/
!/public/jingles/
!/public/models/
!/screenshots/
```

| 作業ツリーにない資産 | 件数 | bytes | 参照元・影響 |
| --- | ---: | ---: | --- |
| `public/audio/episode-000.mp3`、`episode-004.mp3`〜`episode-037.mp3` | 35 | 248,956,416 | generatedEpisodes／content/episodes。再生URLは存在するが実再生不可 |
| `public/backgrounds/{lofi-pc-room,night-library,rainy-cafe}.png` | 3 | 5,594,148 | RainyNightBackgroundの旧画面等。現行直接参照は主にlofi-pc-room |
| `public/exports/exported-window-side-room.glb`、`window-side-room.blend`、`window-side-room-blender-report.json` | 3 | 11,254,337 | 編集成果物。APIは同名GLBを書き換えるので成功exportは実行していない |
| `public/jingles/opening-school-chime-v1.mp3`、`ending-door-rain-v1.mp3` | 2 | 152,640 | opening-jingles設定、生成スクリプト。endingは無効な実験資産 |
| `public/models/{office-equipment,television,window-side-room-authored}.glb` | 3 | 5,451,100 | RoomScene3Dはwindow-side-room-authoredをuseGLTF。残り2件の現行直接参照は未検出 |
| `screenshots/home-preview.png`、`home-v02-preview.png` | 2 | 142,185 | 過去の確認資料。稼働には不要 |
| 合計 | 48 | 271,550,826 | すべてskip-worktree、HEADの同名blobはローカルに存在 |

`git ls-files -v`は全件`S`、削除差分なし。`GIT_NO_LAZY_FETCH=1`で各HEAD blobを`git cat-file -s`し、ネットワーク取得せずサイズを確認した。全パス・blob ID・サイズは`tmp/integration-audit-2026-10-25/assets.json`。`.gitattributes`／LFS filterは見つからず通常Git blobである。partial clone設定はあるが、この48件のためにダウンロードする必要はない。

復旧候補はローカルHEADの同名パス。次回、承認を得た範囲でsparse設定を調整して展開する方法を検討する。今回はsparse変更・ファイル復元・移動・削除・LFS取得・外部再取得をしていない。GitHub上の最新状態は未確認。

GLB取得失敗時の`RoomScene3D.tsx:1585`のfallbackはnull。WebGL非対応時の2D切替とは別で、モデル404では自動的な2D代替を保証しない。実描画は資産展開後に確認する。

**BGMは別件**：`src/hooks/useAmbientAudio.ts:5`の`/bgm/common-night-loop.mp3`は作業ツリー・HEAD・全ローカル履歴・既知バックアップで見つからない。ignore対象でもない。取得元・ライセンス・本来の保存先は未確認。HEADの48件を展開しても、このBGMは回復しない。雨・風・雷はWeb Audio合成のため`public/ambient`の音源は不要。

既知バックアップの作業コピーにもメディア実体はなく、publicはSVG5件だけ。既知の`D:\AI\Projects`直下の候補名とリポジトリ・バックアップを調べ、無関係なプロジェクト内部を横断走査していない。ローカル履歴にある過去削除`episode-001`〜`003`／`sample.mp3`は、現在参照される48件の不在とは別件。

## E. 実行環境とテスト結果

Node.js `24.15.0`、npm `11.12.1`、Next.js `16.4.3`、React／React DOM `19.2.4`、TypeScript `5.9.3`、Three.js `0.184.0`。Node内蔵`node:sqlite`とFTS5は今回実行できた。外部SQLiteネイティブドライバーは不要。

package.jsonとlockのroot name／version／dependencies／devDependenciesは一致する。一方、現在のnode_modulesは`.pnpm`配下を指し、次の8直接依存がlockに記録された版と異なる。`npm ls --depth=0`は終了0だが、今回の試験はlockを厳密に再現したクリーンインストールの試験ではない。

| 依存 | lock | 実体 |
| --- | --- | --- |
| @react-three/drei | 10.7.7 | 10.7.9 |
| @react-three/fiber | 9.6.1 | 9.8.2 |
| @tailwindcss/postcss | 4.3.0 | 4.3.3 |
| @types/react | 19.2.15 | 19.3.0 |
| @types/react-dom | 19.2.3 | 19.3.0 |
| eslint | 9.39.4 | 9.39.5 |
| tailwindcss | 4.3.0 | 4.3.3 |
| tsx | 4.22.3 | 4.23.15 |

依存更新・再インストールは行っていない。再現性確認は別の隔離環境でlock準拠インストール後に実施する。

| コマンド／確認 | 結果 | 範囲・制約 |
| --- | --- | --- |
| `git diff --cached --check`、`git diff --check` | 成功 | 名称変更コミット前後に確認 |
| `git bundle verify <backup>/history.bundle`、273件SHA-256 | 成功 | 保存バックアップの実在と整合 |
| `npm.cmd --version`、`npm.cmd ls --depth=0` | 成功 | インストール済み実体の一覧確認 |
| `npm.cmd run typecheck` | 成功 | 作業ツリー全体 |
| `npm.cmd run lint` | 成功 | 作業ツリー全体 |
| `npm.cmd run test:kousatsu` | 13件成功、失敗0 | fixture、HTTPモック、gate、GLB検査、pipeline、collect後resume |
| `npm.cmd run build` | 成功 | `/`、`/room-export`を静的生成、export APIを動的生成 |
| `npm.cmd run start -- --hostname 127.0.0.1 --port 3147` | 起動成功 | 監査終了時に停止 |
| Node fetch：GET `/`、`/room-export` | 200 | title考察箱、HTMLに旧正式名なし。描画確認ではない |
| Node fetch：HEAD 音声／GLB／背景／BGM各代表URL | 404 | sparse除外3分類と未保有BGM。現状の既知制約 |
| Node fetch：POST `/api/export-room` | 403 | 本番環境では既存仕様どおり無効。保存先変更なし |
| `node --import tsx tmp/integration-audit-2026-10-25/probe.ts` | 3問題の再現成功 | C節の既存不具合をassertで確認。修正後の合格試験ではない |
| CLI隔離試験：init／run×2／search／resume／status／recover／backup | 8回成功 | `node --import tsx scripts/kousatsu.ts ... --db <tmp DB>`、deterministicを明示 |
| 同日2ノート、検索、DB内容照合、PRAGMA integrity_check | 成功 | 日本語topicで別名、検索2件、MD＝DB、DBとbackupともok |
| `GET http://127.0.0.1:11434/api/tags` | 接続失敗：ECONNREFUSED | この実行環境のloopbackではOllama未接続。ホスト全体のインストール有無は断定しない |
| `Get-ScheduledTask` | 実行失敗：CimException | Windowsの実タスク登録状態は未確認 |
| Browser接続・利用可能ブラウザ一覧 | 接続不可、一覧空 | ブラウザ操作・外観・WebGL・保存再読込は未確認 |
| 実フィード取得、実Ollama生成、VOICEVOX生成、GLB成功保存、強制終了・多重実行 | 未実行 | 外部運用・資産変更・既存制作物の変更を伴うため監査では行わない |

試験用DB／ノートは既存保存先を避けて`tmp/integration-audit-2026-10-25/`内に作成。`cli-results.json`にコマンドと結果を保存した。既定の`data/kousatsu/kousatsu.sqlite`は作成していない。

補足：PowerShellの`npm`はnpm.ps1のExecutionPolicyにより起動できなかったため、設定を変えず`npm.cmd`を使った。最初の監査用CLIハーネスはPowerShell→Node標準入力で日本語が`?`になり検索assertに失敗した。ハーネスをUnicode escapeで再実行して2件の検索成功を確認した。アプリの文字コード不具合としては扱っていない。

### 現環境の起動・設定

既存node_modulesを使う場合はPowerShellから`npm.cmd run dev -- --hostname 127.0.0.1 --port 3000`。本番確認は`npm.cmd run build`後に`npm.cmd run start`。Next同梱ガイドでbuildとLintは別実行であることを確認済み。

`.env.example`は存在しない。既存README／コードには設定名がある。秘密値や.env内容は読取・出力していない。

- 考察CLI既定：deterministic、モデル／料金不要。DB保存先は`--db`または`KOUSATSU_DB_PATH`。
- Ollama使用時：`KOUSATSU_AI_PROVIDER=ollama`、明示した`KOUSATSU_OLLAMA_MODEL`、必要ならloopbackの`KOUSATSU_OLLAMA_ENDPOINT`。モデル取得・起動は今回行っていない。
- VOICEVOX：`VOICEVOX_ENDPOINT`、`VOICEVOX_RIKEI_SPEAKER_ID`、`VOICEVOX_BUNKEI_SPEAKER_ID`、`VOICEVOX_TIMEOUT_MS`。
- 開発用export：PowerShellでは`$env:ROOM_EXPORT_ENABLED='1'`をその開発用シェルに設定して起動する。実行には固定出力先の既存GLB保護が必要で、今回は未実行。

READMEの「DBを使わない」はWebの静的配信についてで、後半のローカルCLIはSQLiteを使う。両者の境界を明確にする説明が必要。「検証済みMarkdown」という説明も独立事実確認と誤認しない表現にする余地がある。

## F. 最終統合実装の不足機能と優先度

P1＝永続化・公開・自動実行へ接続する前に解消／仕様決定する事項。P2＝その後の統合要件。以下は計画のみで、未着手。

| 優先度／分類 | 作業・想定ファイル | 依存関係 | 完了条件・検証 | 失敗時の影響／既存機能リスク |
| --- | --- | --- | --- | --- |
| P1 外部資産の復旧 | 承認範囲でsparse除外資産を展開。public／Git設定 | 容量約272MB、復元対象の判断 | 48件のblob照合、主要URL200、3D・再生確認 | 現状は無音・モデル非表示。無差別復元は手元資産の衝突リスク |
| P1 小規模修正 | 音声manifest共通パス。generate-audio／build-episode／tests | 既存制作仕様と実音声時間gate | 制作者と読込側が同一パス、fixture連携試験 | 公開処理停止。音声の作り直しを不要にする互換性が必要 |
| P1 新規実装＋仕様判断 | 出典系譜・記事版・訂正履歴。database／ingest／knowledge／types | 既存DB migrationと移行前backup | 別出典同文・同URL改訂で原記録と出典保持、hash一致 | 根拠混同。データ移行リスクが高いため既存DBを上書きしない |
| P1 小規模修正＋仕様判断 | 構造検査と事実確認の状態分離、分類・本文照合。verify／types／article／説明 | 出典版・独立性の定義 | 今回の不正assertion probeを拒否、独立未確認を明示 | verifiedの誤認。既存下書きの状態移行に注意 |
| P1 新規実装 | job入力版固定・段階冪等・lease・復旧。database／pipeline／tests | 出典版、状態機械 | DB更新を挟むresume、別process再開、二重起動で混在・重複なし | 古い分析と新根拠の混在。処理再開を壊すリスク |
| P1 小規模修正＋仕様判断 | MD／JSON／DBの回復可能な保存と既存ファイル保護。pipeline／database | job排他、上書き方針 | 各保存地点の失敗注入で再整合、手編集を保持、成功resumeで実体検査 | 部分保存・手編集消失。既存ファイル保護が必須 |
| P1 実環境検証→必要なら小修正 | 観察状態の初期読込・保存競合。useObservationState／ListeningRoom | ブラウザ接続と専用テストprofile | 保存済みログ・関係を入れて再読込し保持確認 | ブラウザ記憶消失の疑い。現時点では未再現 |
| P1 実環境検証 | lock準拠の隔離インストールと再試験。package／lock／手順 | 別の隔離環境、許可されたネットワーク | 同版のクリーン環境で型・Lint・test・build | 現在の成功が再現しない可能性。現node_modulesは変更しない |
| P2 新規実装 | sources設定読込と複数分野収集。config／CLI／ingest | sourceの一意性、利用条件・頻度の人間確認 | AI技術／一般の複数sourceを設定から収集し、出典混同なし | 不適切な取得・source上書き。既存fixture経路を保つ |
| P2 新規実装＋仕様判断 | 分析・経験・仮説の想起、関心・減衰・再活性化・解釈履歴。database／knowledge／新memory層 | 出典版、記憶の単位・重み・保持期間 | 原記録を保持し、根拠付きで検索重みと次topicが変わる試験 | 検証前情報の再強化。ブラウザ保存との移行に注意 |
| P2 新規実装 | 既存3D UIとCLI共通engineの接続、認可・実行状態API、ノート・根拠閲覧。src/app/api／ListeningRoom／新note UI | 排他・保存整合・実行権限境界 | UIからjobを追跡、ノート→主張→版付き出典へ戻れる | 長時間処理・秘密データの露出。既存3D操作・レイアウトを維持 |
| P2 新規実装＋実環境検証 | Windows起動／定期実行、再開・失敗可視化。実行wrapper／OS task手順 | job排他・recover、稼働時刻と停止時の仕様 | 二重起動・再起動・PC停止と再開を確認 | 多重実行・処理停止。設定登録は別途承認が必要 |
| P2 実環境検証 | Ollama実モデルの接続・異常応答・品質。ai／tests／設定手順 | ユーザーが指定したインストール済みモデル | 接続・timeout・JSON不正・根拠逸脱を確認 | 分析不可・不正確な推論。deterministicを保つ |
| P2 仕様判断／外部資産 | 共通BGMの出所と使用条件、保存場所 | ユーザー判断・ライセンス確認 | 承認音源のURL200、音量・再生確認 | BGM無し。代替音源を無断生成・取得しない |
| P2 小規模修正 | 公開エピソード範囲と連続再生条件。episodes／ListeningRoom | 公開方針 | #038以降と非公開fixtureを使い一覧と再生対象が一致 | 公開漏れ／非公開対象再生。既存公開順を維持 |
| 再利用可 | 3D演出・既存UI・audio・VOICEVOX・SQLite／FTS5・XML parser・Provider interface・Markdown骨格 | 上記の限定課題 | 既存仕様を回帰確認し必要箇所だけ拡張 | 全面再設計は不要 |
| 現時点では不要 | 有料API、モデル自動取得、大型vector DB、全面UI再設計、既存storageキー改名 | 将来の明示要件が出た場合に再判断 | 今回は追加しない | 不要な費用・移行・既存機能破壊を避ける |

既存実装・OSS候補：全文検索は既存SQLite／FTS5、RSS／Atomの構造読取は既存fast-xml-parser、モデル接続は既存Ollama adapterを優先する。新しいqueueやvector DBを先に導入しない。起動／定期呼出はWindows標準Task Schedulerを候補にする（[Microsoft公式](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create)）。Node常駐が要件になった場合のOSS候補は[node-cron](https://www.nodecron.com/scheduling-options.html)で、重複起動を避けるnoOverlapはあるが、既存DBのjob排他・耐障害性の代替にはならない。今回はインストール・登録していない。

## G. 次のステップ

1. 本報告のP1項目と、既存未コミット実装を個別にレビューする。追加コミットを無断で作らない。
2. 資産展開の範囲、BGMの出所、既存DBの保存場所、利用モデル、常駐／起動時／定期の運用形態を確認する。
3. 資産・依存が再現できる隔離環境で、ブラウザの状態保持、3D、再生、制作CLI連携を確認する。
4. 出典と版、検証状態、保存整合、job排他の仕様を決め、限定修正を先行する。
5. その後、別の実装依頼で3D体験・AI記憶・ノート閲覧・定期実行の統合に着手する。今回は開始していない。

ユーザーの判断が必要な点：sparse除外資産の展開許可と対象、BGMの所在／利用条件、正規の既存DBの所在、使用モデル、運転時刻・停止中の扱い、記憶保持と検証済みの定義。モデル／資産を無断ダウンロードせず、PC停止中にローカル処理が走るとは説明しない。

## H. 作業の安全性

- アプリケーションコード・既存設定・既存資産の内容は今回変更していない。
- 名称変更19件だけをコミットし、既存未ステージ11件・未追跡19件は保全した。
- 今回新規の永続ドキュメントは本ファイルのみ。未追跡のまま、追加コミットはしていない。
- 監査用hash、資産一覧、probe、fixture由来DB／ノートはignore済みの`tmp/integration-audit-2026-10-25/`内。検証で`.next`／tsbuildinfo等のignore済み生成物は更新される。
- 終了時に開始時実在250ファイルのハッシュと、不在48パスを照合し、全件一致で開始時作業ツリーがそのまま保持されていることを確認した。
- push、fetch、デプロイ、GitHub設定変更、reset、clean、強制checkout、履歴書換え、資産復元・移動・削除を行っていない。
- 秘密情報／.envの内容を表示・記録・コミットしていない。
- 最終統合の機能実装は未着手。

## 付録1：開始時から保持した変更の分類

下表の「確認」はE節の実行結果と、C節の静的・再現調査による。複数カテゴリにまたがるファイルは主目的に寄せている。

| 分類 | 対象ファイル | 目的・状態・依存／検証 |
| --- | --- | --- |
| 1 考察エンジン | 未追跡`src/lib/kousatsu/{ai,ingest,pipeline,types}.ts`、`scripts/kousatsu.ts` | CLIとProvider・収集・段階処理。Node24／XML parser／DBに依存。完走・モック・resume試験成功、不足はC節 |
| 2 記憶・知識管理 | 未追跡`src/lib/kousatsu/{database,knowledge}.ts` | SQLite／FTS5、主張・根拠・類似関係。保存・検索は成功、出典／更新の問題を再現 |
| 3 ノート生成・保存 | 未追跡`src/lib/kousatsu/{article,verify}.ts` | Markdownと構造検査。正常系保存成功、検証器の保証不足を再現 |
| 4 3D・UI | 既存の未ステージ／未追跡の機能変更なし | 名称変更の19件の一部に表示文字の変更のみ。3D・CSSの再設計なし |
| 5 音声・エピソード | 未ステージ`scripts/build-episode.ts`、`generate-audio.ts`、`review-script.ts`、`scripts/lib/episode-schema.ts`、`tts-provider.ts`、未追跡`scripts/lib/production-gates.ts` | 警告公開gate、実時間manifest、speaker既定値・timeout。gate試験成功、manifestパス連携は問題あり |
| 6 export・安全対策 | 未ステージ`src/app/api/export-room/route.ts`、未追跡`src/lib/room-export-security.ts` | 開発限定・Origin・サイズ／形式検査・一時保存。単体試験と本番拒否確認、実保存は未実行 |
| 7 名称変更 | 下記19ファイル | 表示文字・現行文書・package名のみ。今回指定commitへ分離済み |
| 8 テスト・設定・文書 | 未ステージ`.gitignore`、`README.md`、`package.json`、`package-lock.json`、`tsconfig.json` | DB／下書きignore、CLI説明・scripts、Next更新・XML／Node／Three型、tmp除外。検証は通過、lock実体差あり |
| 8 テスト・設定・文書 | 未追跡`config/kousatsu-sources.json`、`docs/KOUSATSU_ARCHITECTURE.md`、`tests/fixtures/kousatsu-sample.rss.xml` | 空source雛形、既存設計、オフラインfixture。実在、fixture使用確認。設定読込なし |
| 8 テスト・設定・文書 | 未追跡`tests/kousatsu/{database,network,pipeline,production-gates,room-export-security}.test.ts` | 13試験成功。クラッシュ／実モデル／UI／ファイル途中失敗を覆わない |
| 9 その他・用途不明 | 該当なし | 開始時の変更はすべて上記に分類できた |

未ステージ11件は表の5ファイル（音声）、1ファイル（API）、5ファイル（設定／文書）。未追跡19件はエンジン／知識／ノート／CLIの9件、gate／export helperの2件、設定／設計／fixtureの3件、テストの5件。

名称変更commitの19ファイル：

```text
README.md
package.json
package-lock.json
content/episodes/episode-000.json
content/episodes/episode-000.snippet.txt
content/memory/program-memory.json
content/memory/show-bible.md
content/plans/episode-roadmap.json
docs/BGM_SYSTEM_DESIGN.md
docs/LONG_TERM_DIRECTION.md
docs/OBSERVATION_ROOM_TREE.md
docs/production-roadmap.md
src/app/layout.tsx
src/components/ListeningRoom.tsx
src/components/RainyNightBackground.tsx
src/components/box-room/roomPresets.ts
src/components/observation/EntrySubjectSelect.tsx
src/components/observation/subjectEngine.ts
src/data/generatedEpisodes.ts
```

旧正式名はREADMEの旧名称説明、過去の台本／監査／実験／企画記録、適用済みジングル記録、以前からの未追跡設計の履歴説明に残る。localStorageの`houkago`キー、knowledge識別子、CSS、ローカルフォルダ、リモートURLも互換性のため保持。表示名・保存済み音声・歴史記録を一括置換していない。
