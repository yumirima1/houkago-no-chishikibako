# UI Direction

更新日: 2026-06-04

## 現状分類

### 1. すでに実装済み

- 深夜の知的ラジオ局としての基本トーン
- 雨、ローファイ、静かな作業部屋、アート背景
- ON AIR / OFF AIR
- CRT Monitor Clock
- BGMとAmbientの分離
- 雨 / 夜風 / 静かな部屋 / 遠くの雷のAmbient Controls
- Ambient音量保存
- Entry Mode: 観察対象選択
- Listening Mode: 既存の放送再生UI
- Screensaver Mode: 観察専用の部屋表示
- Room Mode: 部屋オブジェクトを調べる操作可能モード
- subjectごとの relationship / observation log のlocalStorage保存

### 2. 一部実装済み

- 「今最新話」系トップUIの廃止: 最新回カードは廃止。上部プレイヤーは継続。
- episode-017を最新話として先頭表示: 表示用フィルタと並び順で対応。
- 正式公開済みエピソードだけを新しい順に表示: #018以降を公開面から除外するフィルタを追加。
- 深夜の放送室の空気が伝わるファーストビュー: 文言を説明寄りから放送室寄りへ調整。
- 背景部分の将来3D化準備: `BroadcastRoomBackground` ラッパーを追加。

### 3. 次に詰める

- サイト横断の箱シリーズ共通ルーム切り替え
- 観察ログから放送テーマを生成する接続
- Room Mode の3D化
- 観察対象の行動生成ロジック高度化
- よるの相談箱の部屋内統合

### 4. 現在のトップページ方針

- 最初に「観察対象を選択してください」を見せる。
- タルタル / かなは別々の部屋として表示する。
- 放送再生は Listening Mode として維持する。
- 放送記録は必要な時に見られるが、トップ体験の主役にはしない。
- 観察ログとメモは future theme source として扱う。

### 5. 今回はやらない

- DB導入
- ログイン
- 観察ログからの自動原稿生成
- 24時間編成
- Box Room Engine本実装
- Three.js / react-three-fiberの本格導入
- 既存再生機能の破壊
- 既存音声プレイヤーの破壊的変更

## 公開画面ルール

- `productionStatus: "published"` かつ `audioUrl` があるものだけを出す。
- #004以前の旧seed通常回と#018以降は、正式公開判断ができるまでユーザー画面には出さない。
- 40秒程度の短すぎる音声、preview、test、draft、仮音声は出さない。
- episode-017を現時点の最新公開回として扱う。
- `generatedEpisodes` 自体は制作データとして残し、公開面は表示用フィルタで制御する。

## ファーストビュー方針

- 先に「観察対象を選ぶ」体験を見せる。
- 選択後、対象の部屋、現在行動、観察ログ、放送への接続が見える。
- 「便利な一覧サイト」より「部屋を覗く」時間を優先する。
- episode-017、NOW PLAYING、Ambient Controls、放送記録は Listening Mode で維持する。

## モード分離ルール

- Entry Mode: 対象選択だけに集中する。
- Listening Mode: 放送を聴く。episode-017と既存の再生導線を壊さない。
- Screensaver Mode: 観察専用。操作UIを詰め込まない。
- Room Mode: 部屋のものを調べ、Observation Log を残す。

Room Mode と Screensaver Mode を混同しない。操作したい場合は Room Mode、眺めたい場合は Screensaver Mode。
