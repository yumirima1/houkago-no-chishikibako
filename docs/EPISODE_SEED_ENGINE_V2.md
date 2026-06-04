# Episode Seed Engine V2

更新日: 2026-06-04

## 目的

Episode Seed Engine V2 は、毎回似た脱線、似た小物、似た比喩へ落ちることを避けるための設計案である。

SHOW_BIBLEより上位の正本ではない。番組文化を壊さないための補助エンジンである。

## 現在の課題

Draft品質監査では、次の傾向が出た。

- 同じ足場文が残る
- 「雨」「消しゴム」「サーバー代」などの小物が固定化しやすい
- 脱線がある回とない回の差が大きい
- 深夜感がテーマ固有の場面ではなく装飾になりやすい
- かなの違和感が同じ言い回しに寄る

## V2で追加する概念

### weight

イベントの出やすさ。

```json
{
  "id": "cold-coffee",
  "type": "atmosphere",
  "weight": 0.7
}
```

高すぎる weight は番組の決め台詞化を生む。定番小物ほど低めにする。

### cooldown

直近で使ったイベントを休ませる。

```json
{
  "id": "eraser-face",
  "cooldownEpisodes": 8
}
```

使い道:

- 同じ小物の連発防止
- 同じ内輪ネタの連発防止
- 同じ比喩の連発防止

### correlation

イベント同士の相性。

```json
{
  "id": "window-rain",
  "correlation": {
    "pairsWellWith": ["quiet-pause", "crt-flicker"],
    "avoidWith": ["high-energy-joke"]
  }
}
```

雨と静かな間は相性が良い。雨と過剰なボケは、回によっては空気を壊す。

### temperatureBias

Conversation Temperature とイベントを接続する。

```json
{
  "id": "small-failed-metaphor",
  "temperatureBias": {
    "funny": 1.4,
    "quiet": 0.4
  }
}
```

## Seed出力案

```json
{
  "theme": "夜のコンビニはなぜ少しだけ異世界なのか",
  "structureTemplate": "deep_night",
  "conversationTemperature": "warm",
  "events": ["fluorescent-light", "quiet-cash-register"],
  "cooldownNotes": ["eraser-face skipped: used recently"],
  "correlationNotes": ["fluorescent-light pairs with quiet-cash-register"]
}
```

## 履歴の持ち方

DBは使わない。

候補:

- `content/memory/episode-seed-history.json`
- 直近の `content/reviewed/*.json` の `source.draftScriptEngine.eventPlan` を読む
- `content/episodes/*.json` の source を読む

最初はファイル読み取りだけで十分。永続的なDBやユーザー状態は不要。

## review-scriptとの接続

review-scriptは、V2の結果そのものを正解扱いしない。

見るべきもの:

- cooldown対象の小物が本文に出ていないか
- temperatureと本文の温度がズレていないか
- selected events が本文で説明文のまま残っていないか

## 実装順

1. `events.json` に `cooldownEpisodes`, `temperatureBias`, `correlation` を追加する。
2. Seed生成時に直近使用イベントを読む。
3. `conversationTemperature` をSeedへ入れる。
4. Skeletonへ `temperaturePlan` を渡す。
5. Draft生成で説明、感情、笑い、脱線、空気の比率を変える。
6. review-scriptでtemperature不一致を警告する。

## 今回やらないこと

- DB導入
- ユーザー別履歴
- 自動公開
- 複雑なスケジューラー
- 24時間編成
