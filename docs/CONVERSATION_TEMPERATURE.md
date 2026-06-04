# Conversation Temperature

更新日: 2026-06-04

## 目的

Conversation Temperature は、会話の熱量、静けさ、笑い、深さを制御するための設計案である。

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

## Skeletonへの追加案

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

## review-scriptとの接続

将来、`source.draftScriptEngine.temperature` または `conversationTemperature` を見て、警告しきい値を変える。

例:

- `funny` なのに笑いが少ない
- `quiet` なのに説明語が多い
- `deep` なのに締めが結論型
- `warm` なのに生活の小物がない

## 今回やらないこと

- 実装
- UI反映
- 自動公開
- temperature履歴の永続化
