# Observer Room 再構築（2026-10-26）

## 発見と保護

- 作業対象: `D:\AI\Projects\houkago-no-chishikibako`。package名 `kousatsu-bako`、README、generatedEpisodes.ts、既存Observer Room、Gitルートが一致。
- 過去の候補 `houkago-no-chishikabako` は存在しない。Projects内でObserverStudyRoot.tsxが存在するのは現在の作業ツリー。
- ブランチ `chore/rename-kousatsu`、HEAD `6a97997`。開始時点で20個の追跡ファイルに変更、多数の未追跡ファイルあり。切替・reset・clean・commit・pushなし。
- 既存バックアップ: `D:\AI\Projects\kousatsu-backup-2026-10-25T08-03-58-577Z`（履歴bundle・差分・ファイル退避）。
- 今回の変更前バックアップ: `D:\AI\Archives\observer-room-before-20261026-172031`。src/config/scripts/docs/tests/既存assetsと主要設定、Git状態・差分、データ151ファイルのSHA256を保存。
- 開始時3000–3010番ポートに待受なし。Node PID 30332は既存kousatsu-backend daemon。停止・再起動しない。
- `D:\AI\KousatsuData`に実SQLite・考察Markdown・収集記事あり。public/audioディレクトリは開始時点で存在しない。新たな音声生成を行わない。
- 元画面は森林の午後、OrbitControls、薄型画面、サンプル研究データ。参考画像ファイルは提供されていないため仕様書の構図を使用。

## 変更計画

- 変更: observer-room/page.tsx、ObserverStudyRoot、ObserverStudyScene、CameraController。既存未追跡ファイルも上記退避に含めた。
- 追加: 夜の室内構成、CRT、街並み、共有モデル読込、レトロデスクトップとCSS、実データ用読み取り専用API・adapter・型、関連回帰テスト。
- 再利用: Next 16.4.3のclient dynamic import、React 19.2.4、R3F 9.6.1、drei 10.7.7、Three 0.184、createWoodTexture、既存researchSnapshot/researchNote/HTTPアクセス検査。
- 外部アセット: Kenney Furniture KitとCity Kit Commercial。公式配布ZIPと同梱CC0を確認し必要なGLBだけローカル同梱。CRTはtelevisionVintageの筐体をベージュへ変更し、湾曲ガラス、スタンド、通気口を追加する。詳細はassetsの出典記録。
- 接続: 既存autonomous configに指定されたSQLiteをreadOnlyで開く。考察一覧・本文は既存研究読込を使用。収集済み記事と実設定のみ追加で読む。収集・生成・DB初期化・設定更新なし。
- 検証: typecheck、lint、build、既存kousatsuテスト、読み取り専用API/データ保護・モデル整合性・カメラ制限・UIキーボード操作の関連検証。
- 復旧: 失敗箇所だけ小さく修正。必要な場合は今回の変更差分と退避ファイルを照合して対象ファイル単位で戻す。開始前の変更を一括restoreしない。

## ブラウザ環境

Browserスキルを読み、接続と公式の復旧手順を実行したが、利用可能ブラウザ一覧は空（`No browser is available`）。この環境のままでは実ブラウザの視覚・操作・GPU性能・スクリーンショットは未検証。HTTP成功やDOMテストをブラウザ確認として扱わない。

## 実装済みの範囲

- 初期画面は3Dの部屋のみ。フォーカス時だけ表示するキーボード用CRTボタンと、必要な間だけのロード表示を用意した。
- 左の実開口窓、青い都市夜景、暖色のランプ、木製デスク、中央の厚いCRT、キーボード、ノート、カップ、右の電話、科学資料を配置した。
- CRTは既存televisionVintageの筐体と材質変更を基に、頂点を湾曲させたガラス、スタンド、側面の通気口、電源ランプを追加。
- 街並みは既存建物モデルを距離別に配置。窓灯りはInstancedMeshに集約。車両は窓の背後を約32秒周期で反復し、リセットは視界の外で行う。航空灯・一部窓灯りの変化あり。家具は動かさない。
- カメラのマウス変化量は水平±0.055m、垂直±0.035m。時間差による補間、中央・pointerleave時の復帰、縦長画面の構図補正。OrbitControlsは新しい描画経路から外した。ドラッグによる回転・ズームなし。
- OS風端末はnative dialogで表示。記事・ニュース・実設定の3アプリ、検索、本文、Markdownダウンロード。背後のsceneにinertを適用し、Escape・閉じる操作、見出しへのフォーカスと部屋へのフォーカス復帰を実装。
- 通常時のデータ表示にサンプル値は使わない。空・失敗・ローカル閲覧拒否はその状態を表示する。
- 旧森林部屋の部品・サンプルファイル・Overlayは削除せず保全。新しいRoot/Sceneから参照しない。

## 変更ファイル

開始時点の作業コピーと比較して変更した既存ファイル:

- `src/app/observer-room/page.tsx` — 説明メタデータ。
- `src/components/observer-room/ObserverStudyRoot.tsx` — UIのない入口、動的3D読込、障害時の退避、端末開閉。
- `src/components/observer-room/ObserverStudyScene.tsx` — 夜の構図、ライティング、描画負荷の上限、非表示タブの描画停止。
- `src/components/observer-room/CameraController.tsx` — 微小なマウス視差。
- `next.config.ts` — `devIndicators: false`のみ追加。開始前のserverExternalPackagesを維持。
- `src/lib/kousatsu/autonomous-config.ts` — 読取に`turbopackIgnore`注釈のみ追加。API経由のimportで全プロジェクトがtraceされるビルド警告を解消。設定・バックエンド動作は変更しない。

新規ソース・検証・記録:

- `src/components/observer-room/{NightStudy,NightCity,RetroMonitor,RoomAssets,ObserverDesktop}.tsx`
- `src/components/observer-room/{roomMotion,desktopTypes}.ts`
- `src/components/observer-room/observer-room.module.css`
- `src/lib/observer-room-data.ts`
- `src/app/api/observer-room/route.ts`
- `tests/kousatsu/observer-room.test.ts`
- `scripts/verify-observer-desktop.mjs`
- `public/assets/observer-room/` — 14 GLB、PNG 1枚、原本ライセンス2件、出典記録。約611KB（出典記録を除く）。公式ZIPは作業ツリー外の`D:\AI\Downloads\observer-room-kenney-20261026`に保持。
- この報告。

Next devが起動時にAGENTS.mdの管理ブロックを自動更新したが、差分を確認し、今回の退避原本から起動前の内容へ戻した。リモート操作・commit・push・デプロイはしていない。

作業開始時の退避と照合した168ファイルのうち、上記6ファイル以外にも`src/lib/kousatsu/reflection.ts`、`docs/REFLECTION_GENERATION_REVISION.md`、`tests/kousatsu/reflection.test.ts`が作業中に更新されていることを検出した。これらは今回の実装では編集しておらず、外部の同時作業として現在の内容を保全した。

## 検証結果

| 検証 | 結果 | 確認した範囲 |
| --- | --- | --- |
| `npm.cmd run typecheck` | 成功 | 最終ソースに対してエラーなし |
| `npm.cmd run lint` | 成功 | 新規スクリプトを含むプロジェクト全体。途中のuseMemo・検証スクリプトの変数名エラーは修正済み |
| `npm.cmd run build` | 成功 | Next 16.4.3 / Turbopack、本番全ルート生成。途中の動的設定読込trace警告は注釈で解消 |
| `npm.cmd run test:kousatsu` | 成功 | 最終再実行215件、失敗0件（新規Observer Room 5件と、同時更新された考察側のテストを含む）。最初の既存208件も全成功 |
| `npx.cmd tsx --test tests/kousatsu/observer-room.test.ts` | 成功 | 新規5件。DB非生成・非改変、編集Markdown保護、ローカル検査、カメラ上限・電車境界、全アセット依存 |
| `node scripts/verify-observer-desktop.mjs --dependencies <隔離環境>` | 成功 | React 19.2.4 + jsdom。2シナリオで開閉、inert、フォーカス復帰、古い応答破棄、安全な本文、ニュース、実設定、空データ、失敗時の退避。実ブラウザではない |
| HTTPルート・実データ・アセット照合 | 成功 | 下記参照 |
| 保護データのハッシュ | 成功 | 開始前151ファイルと一致、差分0。src/dataとcontent、存在する音声を対象 |
| 実ブラウザ・見た目・スクリーンショット | **未実施** | Browser接続先がない |
| 実GPU性能・native dialogのフォーカス閉じ込め・実ポインター操作・ブラウザコンソール | **未実施** | 接続した描画ブラウザが必要 |

DOM検証の既存隔離環境は`C:\Users\yumir\AppData\Local\Temp\kousatsu-react-dom-2caf6c908d794d77979bd12cc837d297`を再利用。プロジェクトのpackage.json/lockや依存は今回変更していない。

### 配信元とHTTP検査

- URL: `http://127.0.0.1:3000/observer-room`。
- 当該プロジェクトをworking directoryにして、絶対パス`D:\AI\Projects\houkago-no-chishikibako\node_modules\next\dist\bin\next dev --hostname 127.0.0.1 --port 3000`で起動。
- 起動親PID 2428、待受PID 22180。既存バックエンドPID 30332は稼働を維持。
- `/`、`/observer-room`、`/room-export`、既存`/api/kousatsu`はHTTP 200。
- `/observer-room`のタイトルとObserverStudyRootの配信チャンクを照合。14モデルのHTTP取得データとローカルGLBのSHA256が一致。別PNGもHTTP 200。
- `/api/observer-room`は既存DB接続済み。確認時点で考察20件、最新収集記事40件、出典3件、監視プロセスの有効な応答を取得。件数は稼働中の既存バックエンドによって変わりうる。
- 実考察本文4,109文字を取得し、ダウンロードと本文が一致。既存Markdownを再生成・修復していない。
- POSTは405、別OriginからのGETは403。未初期化DBを作らない挙動と手編集保護は隔離fixtureでも検証。
- 初期画面・CRT・窓・机の投影位置はThree.jsの行列計算で可視範囲を確認。ただしピクセル描画・外観を検証したことにはならない。

## 残っている確認

**完成判定は未了。** 接続した実ブラウザで初期画面、明るさ・素材・構図、CRTクリック、電車と街灯、視差とドラッグ禁止、3アプリの操作、native dialogのキーボード閉じ込め、閉じた後の視点・スクロール、コンソールとネットワーク、FPSを確認する必要がある。スクリーンショットは未取得。参考画像そのものとの比較も未実施。

開発サーバーへ転送されたブラウザログに、ロード時の`removeChild` / 同期unmountエラーと、影設定の非推奨警告が記録された。ロード表示に使っていたdrei Htmlの別DOM rootを廃し、通常のDOM側の表示をSuspense内の準備完了通知で閉じる構成へ修正した。影はPCFShadowMapへ変更。これらの変更後の実ブラウザ再確認は未実施であり、エラー解消済みとは断定しない。`THREE.Clock`の非推奨警告はR3F依存側に残る可能性があり、依存ソースの書換え・警告の隠蔽はしていない。

Windowsの実行先に開発サーバーを残している。本番APIは既存のローカル閲覧制限に従い、明示設定がない場合は403となる。public/audioは開始時点から不在であり、この作業で音声は生成していない。他ページのHTTPと既存テストは成功したが、他ページの実ブラウザ・音声再生は未検証。
