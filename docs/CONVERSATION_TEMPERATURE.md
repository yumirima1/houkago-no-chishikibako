# Conversation Temperature

更新日: 2026-06-04

## 目的

Conversation Temperature は、会話の熱量、静けさ、笑い、深さを制御するための実装済みの制御値である。

知識量を増やすためのパラメータではない。深夜の放送室として、その回がどんな温度で進むかを決める。

## 温度タイプ

| temperature | 役割 | 向くテーマ |
| --- | --- | --- |
| `warm` | 帰ってきた感じ、生活感、安心 | 思い出、創作、応援、疲れ |
| `normal` | 標準の深夜雑談 | 通常の違和感テーマ |
| `deep` | 静かに沈む、問いを残す | 記憶、時間、宇宙、理解 |
| `funny` | 小さく笑える、脱線多め | 失敗談、変な道具、UI不満 |
| `quiet` | 間が多い、言い切らない | 眠れない夜、不安、孤独 |

## 制御するもの

- かなの反論量
- タルタルの説明量
- 脱線の数
- 小さな笑いの数
- 沈黙や環境描写の数
- 締めの強さ
- 夜の小物の出し方

## 推奨比率

| temperature | 説明 | 感情 | 笑い | 脱線 | 沈黙/空気 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `warm` | 中 | 高 | 中 | 中 | 中 |
| `normal` | 中 | 中 | 中 | 中 | 中 |
| `deep` | 中 | 高 | 低 | 低 | 高 |
| `funny` | 低 | 中 | 高 | 高 | 低 |
| `quiet` | 低 | 高 | 低 | 低 | 高 |

## Skeletonへの追加

```json
{
  "theme": "検索履歴はもう一人の自分なのか",
  "conversationTemperature": "quiet",
  "temperaturePlan": {
    "explanation": "low",
    "emotion": "high",
    "humor": "low",
    "detour": "low",
    "silence": "high",
    "closing": "soft"
  }
}
```

実装箇所:

- `scripts/lib/conversation-skeleton-generator.ts`
- `scripts/lib/draft-script-generator.ts`

Skeleton は `theme`, `atmosphere`, `tone`, selected events の `temperatureBias` から温度を推定する。

温度分布の例:

- `warm`: ニュース、創作、応援、昔のインターネット
- `quiet`: 検索履歴、AIの謝罪、ひとりごと、名前をつける問題
- `deep`: 宇宙、理解、正しさ、時間
- `funny`: 充電1%、夜のコンビニ、バグ、プログラミング
- `normal`: 標準の違和感テーマ

## Draftへの影響

`warm`:

- かなは生活の小さな恥ずかしさを出す
- タルタルは失敗談や作る側の話を混ぜる
- 締めは少し安心して終わる

`deep`:

- かなは疑問を急いで回収しない
- タルタルは分からなさを残す
- 沈黙や雨音が意味を持つ

`funny`:

- 小さなボケを1〜2個入れる
- タルタルの変な例えをかなが止める
- ただし漫才化しない

`quiet`:

- 長い説明を避ける
- 不安を受け止める
- 最後は結論より余韻を優先する

## Draft Script Engineでの使い方

Draft Script Engine は、各 beat を2〜3発話の小さい往復へ展開する。

実装された補正:

- 温度別 hook
- 温度別 closing
- analysis を短い往復へ分割
- question / emotion / night air の不足を補う
- 同話者連続を後処理で解消する
- かな比率が偏った場合、タルタルまたはかなの短い補助発話を足す

## Event Metadataとの接続

`content/episode-seed-engine/events.json` の各 event は `temperatureBias` を持てる。

```json
{
  "id": "late-night-silence",
  "temperatureBias": {
    "quiet": 1.5,
    "deep": 1.2,
    "funny": 0.6
  }
}
```

この値は温度を強制しない。theme / atmosphere / tone の推定に対して、selected events が少しだけ温度を傾ける。

同じく `correlation` は event 同士の相性メモとして読み込まれる。現時点では選択済み event のメモ出力に使い、履歴ベースの自動除外はまだ行わない。

## review-scriptとの接続

`review-script` は `source.draftScriptEngine.temperature` と `temperaturePlan` を見て、Draft由来の原稿に追加警告を出す。

例:

- `funny` なのに笑いが少ない
- `quiet` なのに説明語が多い
- `deep` なのに締めが結論型
- `warm` なのに生活の小物がない
- かなが「置いていかれる」「理屈が勝ちすぎ」型に偏る
- タルタルが定義や仕組みの講師役へ寄る

## 残課題

- UI反映
- 自動公開
- temperature履歴の永続化
- cooldown履歴を使った event 選択
