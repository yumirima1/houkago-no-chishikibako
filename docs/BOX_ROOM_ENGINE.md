# Box Room Engine

更新日: 2026-06-04

## 目的

箱シリーズ共通で使える「部屋を覗く」演出基盤を作る。

2026-06-03時点で、放課後の知識箱に軽量な3D放送室プロトタイプを導入した。

まだ完成した部屋ではない。目的は、トップページを「背景画像」ではなく「覗き込む部屋」として扱うための基盤を作ること。

2026-06-04時点で、放送室だけでなく「観察対象ごとの部屋」を扱う構造へ拡張した。タルタルの部屋、かなの部屋、放送を聴く部屋は同じ導線上にあるが、同じ生活空間としては扱わない。

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

## three.js / react-three-fiber導入

導入済み:

- `three`
- `@react-three/fiber`
- `@react-three/drei`

実装方針:

- 複雑な3Dモデルを使わない。
- 机、CRT、窓、ランプ、小物をプリミティブ形状で作る。
- カメラ微揺れはかなり弱くする。
- CSS背景を残し、3Dが使えない端末でも部屋感が崩れないようにする。
- `BroadcastRoomBackground` から3D Canvasを動的読み込みする。
- iPhone SE相当の幅ではCSS背景へ軽量切り替えする。

## 現在の実装

- `BoxRoomScene.tsx`
  - 3D空間全体。
  - 机、壁、床、窓、雨、ランプ、小物、ON AIRサインを持つ。
- `BoxRoomMonitor.tsx`
  - 3D CRTモニター。
  - 現在時刻、ON AIR、NOW PLAYING、タイトルを表示する。
- `BoxRoomCamera.tsx`
  - 固定カメラと微揺れ。
- `BoxRoomOverlay.tsx`
  - DOM側の薄い状態表示。
  - 3D非表示時にもCRT情報の気配を残す。
- `roomPresets.ts`
  - `knowledge`
  - `observation`
  - `consultation`
  - 箱シリーズ別の表示差し替え地点。
- `src/components/observation/*`
  - Subject Engine / Relationship Engine / Observation Log の初期実装。
  - `entry` / `listening` / `screensaver` / `room` のUIモードを持つ。
  - Room Mode は2D fallbackベースで、将来の3D Room Sceneへ差し替え可能。
  - Screensaver Mode は観察専用。クリック/タップで Room Mode へ戻る。

## Room Mode と Screensaver Mode

- Screensaver Mode
  - 操作UIを出しすぎない。
  - 観察対象の部屋、現在行動、時計、雨、ランプ、観察箱の気配を見せる。
  - 放送再生UIとは分ける。
- Room Mode
  - CRT、封筒、観察端末、メモ、窓、ランプを調べる。
  - 調べた内容は Observation Log と relationship に反映する。
  - 観察端末は観察箱統合の入口として扱う。

## パフォーマンス注意

- スマホでは3D常時描画を避ける。
- reduce motion環境では3D Canvasを出さない。
- CRT時刻などの重要情報はDOM overlayでも残す。
- 3Dモデルより、光、窓、机、モニターの最小構成を優先する。

## 次の課題

- 3Dシーンの色味をさらに「深夜の放送室」に寄せる。
- Canvasの描画停止条件を追加する。
- 観察箱、よるの相談箱で使う preset の文言とambient初期値を詰める。
- 将来、背景モードと通常UIでカメラ構図を切り替える。
- Room Mode の2D fallbackを、軽い3Dプリミティブへ段階的に置き換える。
