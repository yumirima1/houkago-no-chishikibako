# Observation Room Tree

更新日: 2026-06-04

## 目的

考察箱を、放送を聴くサイトから「観察対象を選び、部屋を覗き、放送が生まれるサイト」へ移行する。

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

## Subject Action Engine Phase 2

行動は固定表示ではなく、次を見て選ぶ。

- 現実時刻の時間帯
- subjectごとの relationship
- 直近の observation log
- 前回訪問からの経過

現在の行動例:

- タルタル: CRTを見る、通知を見る、メモを書く、配線を触る、放送ネタを考える。
- かな: 窓を見る、日記を書く、スマホを見る、小さなラジオを触る、ランプの明るさを気にする。

各actionは次を持つ。

- `broadcastSeed`
- `broadcastHint`
- `themeCandidate`
- `ambientCue`
- `reaction`
- `logText`

`broadcastHint` と `themeCandidate` は future theme source の土台であり、まだ自動で Episode Seed へは渡さない。

## Theme Candidate History

Phase 3では、Observation Logから `themeCandidate` を集約し、Room Modeに放送テーマ候補履歴として表示する。

目的は自動生成ではなく、人間が「この観察から放送化できそう」と判断できる棚を作ること。

表示する情報:

- themeCandidate
- subject
- object
- mood
- action
- createdAt
- 重複回数
- broadcastHint

同じ `themeCandidate` は1件にまとめる。複数回観察されたもの、Room Object由来のもの、dialogue由来のものは「放送化できそう」として目立たせる。

まだ `theme -> seed` へは接続しない。

将来渡せる型:

```ts
type ThemeSourceExport = {
  actionId?: string;
  createdAt: string;
  hint: string;
  mood?: string;
  objectId?: RoomObjectId;
  source: "observation-room";
  sourceLogIds: string[];
  subjectId: SubjectId;
  theme: string;
};
```

## Relationship Engine

subjectごとに localStorage へ保存する。

- `trust`
- `friendship`
- `dependency`
- `lastVisitedAt`

dependency は暗い依存演出ではなく、「観察者の存在を少し気にしている」程度の弱い演出に留める。

Phase 2では数値を直接UIに出さない。関係値は次のような空気として見せる。

- また来たね、という距離感
- 見られていることに少し慣れた反応
- 完成前のメモを少しだけ残す
- すべては見せないが、観察者の気配を否定しない

## Observation Log

localStorage へ保存する。

- `id`
- `subjectId`
- `actionId`
- `thought`
- `logText`
- `broadcastHint`
- `themeCandidate`
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
Human Review
  ↓
Episode Seed
  ↓
Conversation Skeleton
  ↓
Draft Script
```

## 軽量Room Scene

Phase 2では重い3Dを追加しない。

代わりに `RoomFallback2D` を導入し、次の描画境界を分離した。

- 背面レイヤー
- 中間の雨/奥行きレイヤー
- 窓
- 机
- 部屋オブジェクト
- ランプ
- 観察対象の気配
- 観察箱端末

将来はこの境界を `react-three-fiber` の Room Scene へ置き換える。

## 今回やらないこと

- DB導入
- ログイン
- SNS化
- 自動公開
- 観察ログからの自動原稿生成
- 重い3Dモデル
