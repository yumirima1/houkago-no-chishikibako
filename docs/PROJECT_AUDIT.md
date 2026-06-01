# 放課後の知識箱 設定監査

作成日: 2026-06-01

## 目的

放課後の知識箱の番組設定、生成ルール、reviewルール、引き継ぎ資料が複数ファイルに分散しているため、正本、重複、削除候補、統合候補、技術的負債を整理する。

この監査ではファイル削除や統合は行わず、現状の参照関係と整理方針を記録する。

## 調査対象

- `content/`
- `docs/`
- `scripts/`
- `memory/` 相当: 現在は独立ディレクトリなし。実体は `content/memory/`
- prompt関連: 独立した `prompt/` / `prompts/` ディレクトリなし。実体は `scripts/lib/radio-script-builder.ts` のテンプレート、手作業生成用の `tmp/` スクリプト

## 現在の主要設定ファイル

| ファイル | 役割 | 現在の参照状況 | 判定 |
| --- | --- | --- | --- |
| `content/memory/show-bible.md` | 番組聖書。世界観、キャラ、会話品質、禁止事項の正本候補 | `scripts/generate-script.ts` が存在確認し、draftの `source.showBiblePath` に記録する変更済み | 正本候補 |
| `content/memory/program-memory.json` | 番組記憶。キャラ、内輪ネタ、反省ログ、定番フレーズ、過去回情報 | `generate-script.ts` / `weekly-episode.ts` が一部だけ参照 | 継続利用。ただし整理必要 |
| `scripts/review-script.ts` | reviewルールの実行本体 | `npm run episode:review` で使用 | 正本候補。ただし文言重複あり |
| `scripts/lib/radio-script-builder.ts` | ルール定義と原稿テンプレート | `generate-script.ts` が使用 | 統合候補。番組設定が埋め込まれている |
| `content/plans/episode-roadmap.json` | 企画ロードマップ | `seed-episodes.ts` が使用。現在の量産制作では直接参照頻度低め | 残す。ただし古い計画の可能性 |
| `content/memory/weekly-plan.json` | 週刊候補の出力結果 | `weekly-episode.ts` が生成する成果物 | 生成物扱い候補 |
| `docs/production-roadmap.md` | 自動制作の開発ロードマップ | 直接コード参照なし | docsとして残す。古い記述あり |
| `docs/BGM_SYSTEM_DESIGN.md` | BGM設計メモ | 直接コード参照なし | docsとして残す |
| `docs/HANDOVER.md` / `docs/HANDOVER_TEXT.md` | 引き継ぎ資料 | 未追跡。直接コード参照なし | 削除ではなく、コミット方針確認が必要 |

## 正本として残すべき設定

### 1. 番組世界観

正本: `content/memory/show-bible.md`

理由:

- 人間が読みやすい。
- 「知識サイトではなく、夜更かしした人が帰ってくる放送局」という最上位方針を明文化している。
- キャラ設定、深夜ラジオ感、会話品質、生成前チェックがまとまっている。
- 今後、テーマだけで生成する運用の参照元にしやすい。

整理方針:

- 世界観、キャラ定義、禁止事項、会話品質の正本は `show-bible.md` に集約する。
- `program-memory.json` は履歴、反省ログ、内輪ネタ、辞書として役割を分ける。

### 2. 番組記憶

正本: `content/memory/program-memory.json`

残す内容:

- episode反省ログ
- 良かった会話パターン
- タルタル/かなの反応辞典
- running jokes
- pastTopics
- titlePolicy
- nextAvoidanceNotes

正本から外すべき内容:

- 番組の最上位コンセプト
- キャラの基本定義
- 禁止語/禁止構文
- reviewで機械検出すべき品質ルール

これらは `show-bible.md` または `review-script.ts` へ寄せる。

### 3. reviewルール

正本: `scripts/review-script.ts`

理由:

- 実際に `npm run episode:review` で実行される。
- 警告として制作パイプラインに直接効く。

整理方針:

- 機械検出できるものは `review-script.ts` に残す。
- 価値判断や世界観は `show-bible.md` に残す。
- 同じルール文を `program-memory.json` と `radio-script-builder.ts` に重複して持たない。

## 重複している設定

### キャラ設定の重複

重複箇所:

- `content/memory/show-bible.md`
- `content/memory/program-memory.json`
- `scripts/lib/radio-script-builder.ts`
- `docs/HANDOVER.md`
- `docs/HANDOVER_TEXT.md`

内容:

- タルタルは理系担当、技術好き、脱線する、説明しすぎる。
- かなは文系担当、リスナー代表、ツッコミ、反論、相槌係にしない。

問題:

- `program-memory.json` では `displayName` が「理系担当」「文系担当」のままの箇所があり、現在のサイト/原稿で使う「タルタル」「かな」とズレる。
- `radio-script-builder.ts` は固定テンプレート内にキャラ口調が埋め込まれており、SHOW_BIBLE更新だけでは自動反映されない。

統合方針:

- 基本キャラ設定は `show-bible.md` を正本にする。
- `program-memory.json` はキャラの履歴・反応例だけにする。
- `radio-script-builder.ts` の固定会話テンプレートは、最終的にはSHOW_BIBLEを参照するプロンプト/生成器に置き換える。

### 禁止語定義の重複

重複箇所:

- `content/memory/show-bible.md`
- `content/memory/program-memory.json`
- `scripts/review-script.ts`
- `scripts/lib/radio-script-builder.ts`

代表例:

- `構造として見ると`
- `仕組みとして見ると`
- `ここが大事です`
- `結局ここが大事`
- `なるほど`
- `たしかに`
- `そうなんだ`

問題:

- `review-script.ts` が実行正本だが、他ファイルにも自然言語で同じルールがある。
- `program-memory.json` の `recurringPhrases` / `recurringPhraseBank` には、現在の方針では避けたい古い候補が残っている。
  - 例: `まず仕組みから見てみましょう`
  - 例: `ここは少し分けて考えたいです`
  - 例: `便利なのに、少しさみしいですね`

統合方針:

- 禁止語の機械判定は `review-script.ts` に集約する。
- 禁止語の思想・理由は `show-bible.md` に書く。
- `program-memory.json` の古い定番フレーズは `deprecatedPhrases` のような項目へ移すか削除する。

### 世界観定義の重複

重複箇所:

- `content/memory/show-bible.md`
- `content/memory/program-memory.json`
- `content/plans/episode-roadmap.json`
- `docs/BGM_SYSTEM_DESIGN.md`
- `docs/production-roadmap.md`
- `docs/HANDOVER.md`
- `docs/HANDOVER_TEXT.md`

共通内容:

- 知識サイトではない。
- 深夜ラジオ、放送局、夜更かしした人のための場所。
- 雨、夜、ローファイ、静かな部屋。

問題:

- docs系は説明資料として自然だが、制作パイプラインからは参照されない。
- `production-roadmap.md` には「当面は `src/data/episodes.ts` を正とする」という古い記述がある。現在は `content/episodes/*.json` と `src/data/generatedEpisodes.ts` が実質的な公開データ。

統合方針:

- 現行の世界観正本は `show-bible.md`。
- docsは引き継ぎ/設計資料として残すが、正本ではないと明記する。
- 古い運用説明は `PROJECT_AUDIT.md` からリンクして、次回整理時に更新または削除判断する。

### reviewルールの重複

重複箇所:

- `scripts/review-script.ts`
- `content/memory/program-memory.json` の `conversationRules` / `conversationQualityRules`
- `scripts/lib/radio-script-builder.ts` の `radioScriptConversationRules`
- `content/memory/show-bible.md`

問題:

- 実行されるのは `review-script.ts` のみ。
- `radioScriptConversationRules` はexportされているが、現状コード内で参照されていない。
- `program-memory.json` の品質ルールは、生成器が一部しか読んでいないため、実際の品質ゲートにはなっていない。

統合方針:

- `review-script.ts` を実行ルールの正本にする。
- `show-bible.md` を人間/AI向けの判断基準にする。
- `radioScriptConversationRules` は削除または `show-bible.md` から読み込む形に変更する。

## 使われていない、または一部しか使われていない設定

### `content/memory/program-memory.json`

参照されている項目:

- `recurringPhrases?.[0]`
- `runningJokes?.[0]`
- `pastTopics?.length`

ほぼ未使用の項目:

- `programIdentity`
- `privacyRules`
- `creatorInfluenceThemes`
- `atmosphereGuide`
- `characters`
- `conversationRules`
- `conversationQualityRules`
- `episodeReflectionLogs`
- `reactionDictionary`
- `titlePolicy`
- `recurringPhraseBank`
- `goodConversationPatterns`
- `nextAvoidanceNotes`

問題:

- 良い情報は多いが、生成器にはほぼ効いていない。
- JSONが長く、人間が読むには `show-bible.md` より扱いにくい。

推奨:

- `program-memory.json` は「記憶DB」と割り切る。
- 生成時に使う項目を明示する。
- 使わない設定は `show-bible.md` へ移すか、削除候補にする。

### `scripts/lib/radio-script-builder.ts`

未使用または弱い項目:

- `radioScriptConversationRules` はexportされているが参照なし。
- 固定テンプレートの発話が多く、どのテーマでもAI中心の会話に寄りやすい。
- `memoryPhrase` と `runningJoke` は使われるが、常に配列の先頭だけ。

問題:

- SHOW_BIBLEがあっても、固定テンプレートが古い癖を再生する。
- 量産時に「テーマだけ変えた同じ会話」になりやすい。

推奨:

- `radioScriptConversationRules` は `show-bible.md` に統合。
- テンプレートは「発話そのもの」ではなく「構成スロット」に寄せる。
- `program-memory.json` から複数候補を選ぶ仕組みにする。

### `content/memory/weekly-plan.json`

状態:

- `weekly-episode.ts` が生成する成果物。
- 現在は固定候補に近い。

問題:

- 設定正本ではなく生成物だが、`content/memory` にあるため設定に見える。

推奨:

- 生成物として扱うなら `content/generated/weekly-plan.json` などへ移動候補。
- 残す場合は「人間確認用の出力」と明記する。

### `docs/HANDOVER.md` / `docs/HANDOVER_TEXT.md`

状態:

- 現在未追跡。
- 内容は引き継ぎ資料として有用だが、最新方針とズレる可能性がある。

問題:

- `program-memory.json` を世界観正本として案内しているが、今後は `show-bible.md` を正本にしたい。
- `episode-005` 中心の古い文脈が残っている。

推奨:

- コミットするなら、`show-bible.md` と現行公開フローに合わせて更新。
- 不要なら未追跡のまま維持または削除判断。

## 古い設定

### `docs/production-roadmap.md`

古い可能性が高い記述:

- 「当面は `src/data/episodes.ts` を正とする」

現状:

- 公開用は `content/episodes/*.json` を正として、`src/data/generatedEpisodes.ts` を生成する運用。
- `src/data/episodes.ts` は現行の正本ではない。

対応候補:

- `content/episodes` 正本に書き換える。
- ロードマップの完了済み項目を整理する。

### `content/reviewed/episode-017〜024.json`

状態:

- 旧seed由来と思われる短い reviewed 原稿が残っている。
- 複数ファイルに `仕組みとして見ると、ここが大事です。` が残っている。

問題:

- 現在の品質ルールと矛盾する。
- 将来誤って `episode:build -- --id episode-017` などを実行すると、古い品質のまま公開データへ反映される可能性がある。

対応候補:

- #017以降を制作する際は、必ずdraft/reviewedを新ルールで再生成する。
- 旧seed原稿には `productionStatus: planned` 相当の扱いを明確にする。
- 古いreviewedを残すなら、ファイル名やsourceでseed由来と分かるようにする。

### `content/memory/program-memory.json` の古いフレーズ

古い可能性:

- `まず仕組みから見てみましょう`
- `ここは少し分けて考えたいです`
- `技術的には可能です`
- `便利なのに、少しさみしいですね`
- `たとえるなら、小さな喫茶店みたいな話で`

問題:

- 現在の「決め台詞化禁止」「哲学変換装置化禁止」と衝突しやすい。

対応候補:

- `recurringPhrases` を「推奨」ではなく「候補/過去の言い回し」に格下げする。
- `deprecatedPhrases` を追加してreview-scriptと共有する。

## 現在参照されていないファイル/ディレクトリ

### 独立ディレクトリ

- `memory/`: 存在しない。
- `prompt/`: 存在しない。
- `prompts/`: 存在しない。

### docs

コードから直接参照されない:

- `docs/BGM_SYSTEM_DESIGN.md`
- `docs/production-roadmap.md`
- `docs/HANDOVER.md`
- `docs/HANDOVER_TEXT.md`

これらは実行時設定ではなく、設計/引き継ぎ資料として扱う。

### tmp

未追跡:

- `tmp/make-episode-016.mjs`
- `tmp/make-episodes-011-015.mjs`
- 各種スクリーンショット

問題:

- prompt/原稿生成ロジックの実験が `tmp/` に残っている。
- Git管理外なので正本ではないが、実際の制作ノウハウが混ざっている。

推奨:

- 必要な生成ノウハウだけ `show-bible.md` または正式スクリプトへ移す。
- `tmp/` は監査対象から外すか、定期削除する。

## 削除候補

即削除ではなく、次回整理時の候補。

| 候補 | 理由 | 注意 |
| --- | --- | --- |
| `scripts/lib/radio-script-builder.ts` の `radioScriptConversationRules` | exportされているが参照されていない | SHOW_BIBLEへ統合後に削除 |
| `program-memory.json` の古い `recurringPhrases` | 現方針と衝突する候補がある | 削除前に良いものを反応辞典へ移す |
| `content/reviewed/episode-017〜024.json` の旧seed原稿 | 現品質ルールに合わない | 未制作分の扱いを決めてから |
| `content/memory/weekly-plan.json` | 生成物であり設定に見える | 移動先を決めてから |
| `tmp/` 配下の一時生成スクリプト/スクリーンショット | 未追跡の作業物 | 必要ノウハウを移してから |

## 統合候補

### SHOW_BIBLE中心化

統合先:

- `content/memory/show-bible.md`

統合する内容:

- 番組の正体
- タルタル/かなの基本設定
- 禁止事項の思想
- 深夜ラジオ感
- 3部構成
- 理解の余白
- 原稿生成前チェック

### program-memoryの役割縮小

残す内容:

- 過去回ログ
- 良かった反応
- 良かった脱線
- running jokes
- 反応辞典
- 避けたい問題

削る/移す内容:

- 最上位世界観
- キャラ基本設定
- reviewルール文
- 古い推奨フレーズ

### review-scriptの正本化

統合する内容:

- 禁止語検出
- 感情無視検出
- かな発言率
- 説明過多
- 内容重複
- 比喩重複
- 締め重複
- 冒頭/最後の問い重複

将来案:

- 禁止語やしきい値を `content/memory/review-rules.json` に分離し、`review-script.ts` は実行器にする。

## 技術的負債

### 1. 設定が自然言語とコードに二重化している

同じルールが `show-bible.md`、`program-memory.json`、`review-script.ts`、`radio-script-builder.ts` にある。

影響:

- どれを直せば生成に効くか分かりにくい。
- 古い言い回しが残りやすい。

対応:

- 人間向け正本: `show-bible.md`
- 実行正本: `review-script.ts`
- 記憶DB: `program-memory.json`
- 生成テンプレート: SHOW_BIBLE参照へ移行

### 2. 原稿生成テンプレートが固定発話に寄っている

`radio-script-builder.ts` は実際の会話文を大量に持っている。

影響:

- テーマを変えても会話構造が似る。
- 同じ切り返し、同じ語尾、同じ比喩が出やすい。

対応:

- 固定発話を減らし、構成スロットとテーマ固有素材から作る。
- SHOW_BIBLE、program-memory、テーマメモを入力にする生成器へ置き換える。

### 3. `program-memory.json` が大きすぎる

番組設定、反省ログ、辞書、フレーズ、タイトル方針が1ファイルに混在している。

影響:

- どの項目が実際に使われるか分かりにくい。
- AI/人間の参照時にノイズが多い。

対応:

- `program-memory.json`: 履歴と辞書
- `show-bible.md`: 番組聖書
- `review-rules.json`: 機械判定設定
- `episode-roadmap.json`: 企画計画

### 4. old seed episodesが現行品質と混在している

#017〜#024に旧seedの短い原稿が残っている。

影響:

- 誤buildで古い品質の公開データを再生成するリスク。
- 禁止語が残っていて監査上ノイズになる。

対応:

- 未制作分は `planned` として扱う。
- reviewedに置くのは公開可能品質に達したものだけ、という運用へ寄せる。

### 5. docsが正本化しやすい

引き継ぎdocs、ロードマップ、BGM設計がそれぞれ世界観を説明している。

影響:

- どの文書が最新か分かりにくい。
- 新しい開発者が古いdocsを正として読んでしまう可能性。

対応:

- docs冒頭に「正本は `content/memory/show-bible.md`」と明記する。
- 古いdocsは「履歴/引き継ぎ」として扱う。

## 推奨する次の整理順

1. `show-bible.md` を番組設定の正本として確定する。
2. `program-memory.json` からキャラ基本設定と禁止語を削り、履歴/辞書へ役割を絞る。
3. `radio-script-builder.ts` の `radioScriptConversationRules` を削除またはSHOW_BIBLE参照へ置き換える。
4. `review-script.ts` のしきい値と禁止語を外部JSON化するか検討する。
5. `docs/production-roadmap.md` の古い `src/data/episodes.ts` 正本記述を更新する。
6. #017〜#024の旧seed reviewedを、planned扱いにするか新ルールで再生成する。
7. `tmp/` の制作ノウハウを正式ファイルへ移し、作業物は削除する。

## 結論

現時点の最も大きな問題は、番組文化が複数の場所に分散し、かつ一部だけが実行パイプラインに接続されていること。

今後は次の分担に寄せるのがよい。

- `content/memory/show-bible.md`: 番組の正本
- `content/memory/program-memory.json`: 番組の記憶と反省ログ
- `scripts/review-script.ts`: 実行される品質ゲート
- `content/plans/episode-roadmap.json`: 企画計画
- `docs/`: 設計と引き継ぎ。正本ではない

この分担に整理できれば、毎回ChatGPTが原稿を全面修正する運用から、テーマを渡すだけで番組らしい原稿を安定生成する運用へ近づける。
