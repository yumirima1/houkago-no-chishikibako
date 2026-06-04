# Observation Room Tree

更新日: 2026-06-04

## 目的

放課後の知識箱を、放送を聴くサイトから「観察対象を選び、部屋を覗き、放送が生まれるサイト」へ移行する。

今回の実装は完成形ではない。大きな構造を先に置き、後で3D、行動生成、放送テーマ生成を差し替えられるようにする。

## 体験ツリー

```txt
Entry Mode
  観察対象選択
  ├─ タルタル
  │   └─ TartarRoom
  │       ├─ Room Mode
  │       ├─ Screensaver Mode
  │       └─ Listening Mode
  └─ かな
      └─ KanaRoom
          ├─ Room Mode
          ├─ Screensaver Mode
          └─ Listening Mode
```

## RoomMode

- `entry`: 観察対象を選ぶ。
- `listening`: 既存の放送再生UI。episode-017、NOW PLAYING、Ambient、放送記録を維持する。
- `screensaver`: 観察専用。3D背景または軽量fallbackで部屋を眺める。操作UIは最小限。
- `room`: 操作可能な部屋。CRT、封筒、観察端末、メモ、窓、ランプを調べられる。

## Subject Engine

観察対象は `Subject` として扱う。

- `id`
- `name`
- `roomType`
- `mood`
- `currentAction`
- `relationship`

対象:

- タルタル: PC、CRT、配線、通知、メモ、放送機材。
- かな: 本、日記、ランプ、窓、スマホ、小さなラジオ。

二人は同じ部屋に住んでいない。仲の良い友達だが、部屋の空気と行動は別物として作る。

## Relationship Engine

subjectごとに localStorage へ保存する。

- `trust`
- `friendship`
- `dependency`
- `lastVisitedAt`

dependency は暗い依存演出ではなく、「観察者の存在を少し気にしている」程度の弱い演出に留める。

## Observation Log

localStorage へ保存する。

- `id`
- `subjectId`
- `actionId`
- `thought`
- `timestamp`
- `source`

ログは将来の `theme -> seed -> skeleton -> draft -> review` の theme source 候補になる。

例:

```txt
23:41 タルタルが通知を見ていた
23:42 「なぜ人は通知を開くのか」と考えた
23:45 かなに話したくなった
```

## 放送との接続

今回、生成パイプラインへは自動接続しない。

ただし Room Mode の「メモ」と「観察端末」は、将来の放送テーマ生成元として扱う。

```txt
Observation Log
  ↓
Future Theme Source
  ↓
Episode Seed
  ↓
Conversation Skeleton
  ↓
Draft Script
```

## 今回やらないこと

- DB導入
- ログイン
- SNS化
- 自動公開
- 観察ログからの自動原稿生成
- 重い3Dモデル
