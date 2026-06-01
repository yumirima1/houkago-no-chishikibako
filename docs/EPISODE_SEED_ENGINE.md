# Episode Seed Engine

更新日: 2026-06-02

## 目的

原稿を毎回まっすぐ生成するのではなく、深夜ラジオらしい揺れを入れるための土台を作る。

これは会話品質を壊さないための補助であり、SHOW_BIBLEより上位の正本ではない。

## 参照順

1. `content/memory/show-bible.md`
2. `content/episode-seed-engine/events.json`
3. `content/episode-seed-engine/structure-templates.json`
4. `content/memory/program-memory.json`

## イベント種別

- 脱線
- 事故
- 例え
- 思考実験
- 内輪ネタ
- 空気
- 現実参照

## イベントデータ

イベントは以下を持つ。

- `id`
- `type`
- `weight`
- `rarity`
- `cooldownEpisodes`
- `description`
- `speakerBias`
- `avoidWhen`
- `exampleBeat`

## structure-template

テンプレートは話の骨格だけを持つ。

- 正解を出し切らない
- かなが疑問や反論を持つ
- タルタルが一度困る
- 笑える脱線を一つ入れる
- 最後に余白を残す

## 今回やらないこと

- 原稿生成スクリプトへの接続
- cooldown履歴の永続化
- review-scriptの新規警告追加

## 動作する入口

```bash
npm run episode:seed -- --theme "なぜ人は通知を開くのか"
```

出力:

- `theme`
- `structureTemplate`
- `events`
- `atmosphere`
- `tone`
- `rarityMix`

旧seed投入スクリプトは `npm run episode:seed:legacy` に退避する。

## 次フェーズ

`scripts/generate-script.ts` がSHOW_BIBLEを読んだあと、Episode Seed Engineからイベント候補を少数選び、プロンプトへ「必須ではない揺れ」として渡す。
