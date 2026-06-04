# Conversation Skeleton Engine

更新日: 2026-06-03

## 目的

Episode Seed から、原稿本文の手前にある会話の骨組みを生成する。

このエンジンは本文を生成しない。役割は、話の流れ、かなとタルタルの役割、会話の揺れ、余白、締め方を JSON として固定しすぎずに出すこと。

SHOW_BIBLE より上位の正本ではない。

## 入力

入力はどちらか一つ。

```bash
npm run episode:skeleton -- --theme "なぜ人は通知を開くのか"
npm run episode:skeleton -- --seed-file path/to/seed.json
```

`--theme` の場合は内部で Episode Seed を生成してから Skeleton を作る。

`--seed-file` の場合は既存 Seed を読み込む。

## 出力

```json
{
  "theme": "なぜ人は通知を開くのか",
  "structureTemplate": "deep_night",
  "atmosphere": "rainy",
  "tone": "curious",
  "eventPlan": {
    "selectedEventIds": ["late-night-silence"],
    "supportedEventKinds": ["event", "detour", "accident"],
    "rarityMix": {
      "Common": 0.7,
      "Rare": 0.2,
      "Epic": 0.08,
      "Legendary": 0.02
    },
    "notes": []
  },
  "beats": []
}
```

各 beat は以下を持つ。

- `order`
- `speaker`
- `role`
- `purpose`
- `cue`
- `eventId` optional
- `eventKind` optional
- `rarity` optional
- `required` optional

## 対応する eventKind

- `event`
- `detour`
- `accident`
- `metaphor`
- `thought_experiment`
- `inside_joke`
- `atmosphere`
- `reality_reference`
- `emotion`
- `reaction`

`events.json` は日本語 category と英語 type のどちらでも扱える。

例:

- `脱線` / `detour`
- `事故` / `accident`
- `例え` / `metaphor`
- `思考実験` / `thought_experiment`
- `内輪ネタ` / `inside_joke`
- `空気` / `atmosphere`
- `現実参照` / `reality_reference`
- `感情` / `emotion`
- `反応` / `reaction`

## rarity

対応 rarity:

- `Common`
- `Rare`
- `Epic`
- `Legendary`

Seed 生成時点の rarity mix を `eventPlan.rarityMix` に保持し、Skeleton の event beat には選ばれた event の `rarity` を残す。

## 脱線の扱い

脱線は番組らしさを作るが、毎話必須にはしない。

Skeleton では脱線に近い template beat を `required: false` として扱い、Seed で detour event が選ばれていない場合は「小さな反応や笑いに留める」 cue に変える。

これにより、毎回同じ脱線パターンへ落ちることを避ける。

## Event Metadata

現段階では履歴をDB保存しない。

以下の event metadata を扱う。

- `weight`
- `cooldownEpisodes`
- `avoidWhen`
- `correlation`
- `temperatureBias`

`temperatureBias` は selected events から `conversationTemperature` の推定へ反映する。

`cooldownEpisodes` と `correlation` は Seed selection 側で重みに反映する。Skeleton は選ばれた結果と notes を受け取り、Draft / review で追跡できるようにする。

## 今回やらないこと

- 原稿本文生成
- AI API 接続
- DB 導入
- ログイン
- SNS 化
- ランキング
- 通知機能
- UI 追加
