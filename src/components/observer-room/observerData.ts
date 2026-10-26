import { ObserverRoomState } from "./types";

export const initialObserverData: ObserverRoomState = {
  observer: {
    name: "観察者",
    activity: "thinking",
    activityLabel: "仮説の構築と思索",
    currentThought: "「日常の些細な反復の中に、見落とされた因果律の手がかりが隠れているのかもしれない。」",
    lastActiveAt: "2026-10-26 14:15",
  },
  timeOfDay: "afternoon",
  growth: {
    knowledgeLevel: 3,
    noteCount: 42,
    memoryCount: 184,
    unresolvedCount: 5,
  },
  currentNote: {
    id: "note-042",
    title: "観察記録第42号：環境変化と記憶の想起バイアス",
    topic: "認知心理・環境知覚",
    date: "2026-10-26",
    status: "verified",
    summary: "雨音や木々の葉擦れのような一定の自然音が存在する空間において、観察対象の思索の深度と仮説形成速度に有意な相関が認められるかどうかの検証ログ。",
    evidenceCount: 7,
    sources: ["環境心理学基礎論 (1998)", "フィールドワーク日誌 #14", "観測センサ音響ログ"],
    markdown: `### 観察記録第42号：環境変化と記憶の想起バイアス

#### 1. 前提と仮説
思考が停滞した際、観察対象は無意識に窓の外の樹木や遠方の景観を注視する傾向がある。これは単なる視覚的休息ではなく、外部の非周期的な自然の揺らぎ（1/fゆらぎ）が前頭前野の過度な負荷を緩和し、拡散的思考を誘発していると推測される。

#### 2. 収集した証拠
- 窓辺での視線停留時間と、その直後の考察メモ記載頻度（r = 0.68）
- デスクランプ点灯時の集中的論理展開と、自然光下での多角的主張の比較
- 考察箱の過去エピソードとの整合性チェック完了

#### 3. 考察と今後の課題
部屋の温度、採光、木製家具の触覚的要素が思考に与える影響についても継続して記録を行う。`,
  },
  notes: [
    {
      id: "note-042",
      title: "観察記録第42号：環境変化と記憶の想起バイアス",
      topic: "認知心理・環境知覚",
      date: "2026-10-26",
      status: "verified",
      summary: "雨音や木々の葉擦れのような一定の自然音が存在する空間における仮説形成速度の検証ログ。",
      evidenceCount: 7,
      sources: ["環境心理学基礎論 (1998)", "フィールドワーク日誌 #14"],
      markdown: "前提と仮説の構造化検証...",
    },
    {
      id: "note-041",
      title: "考察箱の主題生成における偶発的キーワード結合",
      topic: "情報統合・知識表現",
      date: "2026-10-24",
      status: "hypothetical",
      summary: "タルタルとかなの対話断片から抽出された概念が、いかにして独立したテーマへと昇華されるかについての分析。",
      evidenceCount: 4,
      sources: ["対話断片ログ (Oct 2026)", "意味ネットワーク解析ノート"],
      markdown: "二人の対話における非同期的な着想の交差に関する覚書...",
    },
    {
      id: "note-040",
      title: "古書と近代文献における自然分類体系の変遷",
      topic: "科学史・博物学",
      date: "2026-10-20",
      status: "verified",
      summary: "書架に収められた植物分類図譜と近年のデジタルアーカイブの対応関係の整理。",
      evidenceCount: 12,
      sources: ["リンネ分類学原典翻刻", "現代植物系統分類ノート"],
      markdown: "体系化された知識が持つ美しさと、周縁に取り残された観測事実の救出...",
    },
  ],
  sources: [
    {
      id: "src-01",
      name: "博物学・動植物の生態記録集",
      category: "natural_science",
      itemCount: 148,
      lastChecked: "本日 12:30",
      relevance: 92,
    },
    {
      id: "src-02",
      name: "科学認識論と仮説形成の論理",
      category: "philosophy",
      itemCount: 84,
      lastChecked: "昨日 18:20",
      relevance: 87,
    },
    {
      id: "src-03",
      name: "放課後の知識箱 音声・対話ログアーカイブ",
      category: "history",
      itemCount: 312,
      lastChecked: "本日 09:15",
      relevance: 96,
    },
    {
      id: "src-04",
      name: "計算機知能と記号推論に関する覚書",
      category: "technology",
      itemCount: 65,
      lastChecked: "2日前",
      relevance: 78,
    },
  ],
  jobs: [
    {
      id: "job-108",
      title: "最新学術フィードの論点構造化",
      stage: "仮説と反証の照合",
      status: "running",
      timestamp: "13:30",
      progressPercent: 70,
    },
    {
      id: "job-107",
      title: "観測メモとアーカイブの相互参照",
      stage: "根拠抽出完了",
      status: "completed",
      timestamp: "11:45",
      progressPercent: 100,
    },
    {
      id: "job-106",
      title: "自然言語要約の論理的一貫性検査",
      stage: "検証レポート生成",
      status: "completed",
      timestamp: "09:20",
      progressPercent: 100,
    },
  ],
  openQuestions: [
    {
      id: "q-01",
      question: "二つの独立した観察事象の間にある『無音のインターバル』にはどんな情報が含まれるか？",
      category: "時間認知・情報理論",
      originDate: "2026-10-18",
      hypothesisDraft: "会話の合間や静寂は単なる欠落ではなく、受容者の内部シミュレーションを起動するトリガーである可能性。",
      status: "investigating",
    },
    {
      id: "q-02",
      question: "タルタルが夜間に記録するコードの断片と、かなの日記に出てくる天候記述の一致率の由来は何か？",
      category: "相関関係分析",
      originDate: "2026-10-21",
      hypothesisDraft: "同一の気象環境（低気圧、湿度）が二人の精神状態に異なる形で作用している。",
      status: "unresolved",
    },
    {
      id: "q-03",
      question: "記憶の風化を防ぐために必要な最小限の『反芻の間隔』は数学的にモデル化できるか？",
      category: "記憶工学",
      originDate: "2026-10-23",
      hypothesisDraft: "エビングハウス曲線の変形として、外部からの偶発的刺激（植物、窓外の風）をノイズ項として加味できるか検証中。",
      status: "investigating",
    },
  ],
  experiences: [
    {
      id: "exp-01",
      title: "雨上がりの森での音響採集記録",
      date: "2026-09-15",
      description: "雫の落ちるリズムが心拍数と同期する現象を測定。ピン留めされた写真には濡れた杉林の木道が写っている。",
      tag: "フィールドワーク",
      color: "#3d5a45",
    },
    {
      id: "exp-02",
      title: "最初の考察ノート（第1号）を脱稿した夜",
      date: "2026-08-02",
      description: "手探りで仮説を書き殴った古い羊皮紙風のメモ。ここからすべての観察記録が始まった。",
      tag: "原点の記憶",
      color: "#6b4f3b",
    },
    {
      id: "exp-03",
      title: "深夜2時のラジオから流れた未知のシグナル",
      date: "2026-10-04",
      description: "微弱な短波放送に混ざり込んだホワイトノイズと、遠くの街の鐘の音のスケッチ。",
      tag: "音響観測",
      color: "#2f4058",
    },
  ],
  news: [
    {
      id: "news-01",
      title: "最新科学誌：複雑系ネットワークにおける偶発的創発の数理モデル",
      source: "Cognitive Science Digest",
      time: "1時間前",
      summary: "独立した観測点からの情報が閾値を超えた瞬間、大域的な秩序が形成される過程についての最新論文。",
      relatedTopic: "知識統合",
    },
    {
      id: "news-02",
      title: "気象観測速報：秋季の移動性高気圧と局所的な風向変化",
      source: "地域環境気象ログ",
      time: "3時間前",
      summary: "山麓部における気温逆転層の発生により、遠方の音波が屈折して届きやすくなっている。",
      relatedTopic: "音響心理",
    },
  ],
  radio: {
    station: "放課後の知識箱 短波受信所",
    frequency: "92.4 MHz",
    currentEpisode: "第17回「日常の観測と因果の揺らぎ」",
    status: "on-air",
    description: "タルタルとかなの放課後の思索。窓の外の木漏れ日を聴きながら。",
  },
  ambient: {
    timeLabel: "穏やかな午後",
    weather: "木漏れ日の差す晴れ",
    windowNote: "窓の外には穏やかな森の木々が広がり、時折葉がそよぐ。遠くの山並みは澄んだ空気の中に静かに佇んでいる。",
    plantNote: "鉢植えの緑が日光を浴びて瑞々しい。手入れが行き届いており、静かに研究室の空気を潤している。",
    bedNote: "整えられたリネンとウールのブランケット。思索に疲れた観察者が静かに目を閉じ、記憶を整理する場所。",
  },
};
