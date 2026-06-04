# Draft Script Engine

更新日: 2026-06-04

## 目的

Conversation Skeleton から、タルタルとかなの会話下書きを生成する。

これは最終原稿ではない。SHOW_BIBLE と review-script の手前に置く、会話のたたき台である。

## 位置づけ

```txt
theme
  ↓
Episode Seed
  ↓
Conversation Skeleton
  ↓
Draft Script
  ↓
review / human rewrite
  ↓
final script
```

## CLI

theme から draft まで通す。

```bash
npm run episode:draft -- --theme "なぜ人は通知を開くのか"
```

既存の Skeleton を入力にする。

```bash
npm run episode:draft -- --skeleton-file path/to/skeleton.json
```

Draft Script Engine の生出力を保存する。

```bash
npm run episode:draft -- --theme "なぜ人は通知を開くのか" --save --id episode-025
```

保存先は `content/script-drafts/{id}.json`。

既存の原稿生成フローへ接続する。

```bash
npm run episode:generate -- --id episode-025 --draft-script-file content/script-drafts/episode-025.json
npm run episode:review -- --id episode-025
```

Skeleton から直接 EpisodeScript 形式の下書きを作ることもできる。

```bash
npm run episode:generate -- --id episode-025 --skeleton-file path/to/skeleton.json
```

## 入力

Conversation Skeleton:

- `theme`
- `structureTemplate`
- `atmosphere`
- `tone`
- `eventPlan`
- `beats`

各 beat:

- `speaker`
- `role`
- `purpose`
- `cue`
- `eventId` optional
- `eventKind` optional
- `required` optional

## 出力

Draft Script:

- `theme`
- `structureTemplate`
- `atmosphere`
- `tone`
- `eventPlan`
- `conversationTemperature`
- `temperaturePlan`
- `lines`
- `productionNotes`

各 line:

- `order`
- `speaker`
- `sourceBeatOrder`
- `role`
- `eventId` optional
- `eventKind` optional
- `cue`
- `text`

## 生成方針

- speaker を反映する。
- cue を追跡可能な形で保持し、会話本文は自然な発話へ変換する。
- eventPlan と eventKind を失わない。
- タルタルは解説者ではなく、理屈っぽい友達にする。
- かなは相槌ではなく、疑問、反論、生活感を出す。
- 雑学を増やすのではなく、見え方の発見を作る。
- fixed joke を避けるため、同じギャグ文を正本化しない。
- Conversation Temperature に応じて、説明、感情、笑い、脱線、沈黙、締め方を変える。
- 1 beat を1発話で消費せず、短い往復へ分割する。
- 同話者連続が残った場合は、短い受け止めや疑問を差し込んで交互にする。

## 注意

このエンジンは deterministic generator であり、AI API には接続しない。

出力はそのまま公開しない。特に以下は人間または review-script で確認する。

- かなが相槌だけになっていないか
- タルタルが説明を連続投下していないか
- cue が説明文のまま残っていないか
- 同じ比喩や切り返しが固定化していないか
- 締めが一度だけになっているか

## 半自動運用

```txt
Draft Script保存
  ↓
generate-scriptでcontent/draftsへ変換
  ↓
review-script
  ↓
人間確認・書き直し
```

`content/script-drafts` はDraft Script Engineの生出力置き場。公開用原稿の置き場ではない。

`content/drafts` は既存の `review-script` / `audio` / `build` が読むEpisodeScript形式の下書き置き場。

## 今回やらないこと

- AI API 接続
- reviewed への昇格
- 音声生成
- DB 導入
- ログイン
- SNS 化
