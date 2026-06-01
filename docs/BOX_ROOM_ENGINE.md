# Box Room Engine

更新日: 2026-06-02

## 目的

箱シリーズ共通で使える「部屋を覗く」演出基盤を作る。

今回の作業では本実装しない。まずは既存背景を `BroadcastRoomBackground` で包み、将来の3D差し替え地点を作った。

## 想定構成

```txt
src/components/box-room/
  BoxRoomScene.tsx
  BoxRoomMonitor.tsx
  BoxRoomCamera.tsx
  BoxRoomOverlay.tsx
  roomPresets.ts
```

## room preset案

- `knowledge`
  - status: `ON AIR`
  - primaryLine: `NOW PLAYING`
  - secondaryLine: episode title
  - ambient: rain / night room

- `observation`
  - status: `OBSERVING`
  - primaryLine: `今日の観察`
  - secondaryLine: observation status
  - ambient: quiet room / distant city

- `consultation`
  - status: `LISTENING`
  - primaryLine: `相談受付中`
  - secondaryLine: anonymous post status
  - ambient: night room / low rain

## three.js / react-three-fiber検討

現時点の `package.json` にはthree系依存はない。

今回は以下の理由で本格導入しない。

- ユーザー要望でBox Room Engine本実装は今回やらない対象。
- 公開面の未完成データ非表示が優先。
- 現在の2D背景とCRT演出で、低負荷に方向性を検証できている。

次に導入する場合は、まず軽量な固定カメラ・低ポリゴン・Canvas停止条件を決める。

## パフォーマンス注意

- スマホでは3D常時描画を避ける。
- 背景モード時だけ描画、通常UIでは静止画フォールバックを検討する。
- CRT時刻などのテキストはDOM overlayで持つ方が運用しやすい。
- 3Dモデルより、光、窓、机、モニターの最小構成を優先する。
