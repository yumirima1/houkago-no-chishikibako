import {
  BroadcastThemeCandidate,
  ObservationLog,
  ObservationSubject,
  Relationship,
  RelationshipAtmosphere,
  RoomObjectId,
  SubjectAction,
  SubjectId,
  ThemeSourceExport,
  TimeBand,
} from "@/components/observation/observationTypes";

export const observationSubjects: Record<SubjectId, ObservationSubject> = {
  kana: {
    accent: "#f9a8d4",
    description:
      "本、日記、ランプ、窓、小さなラジオ。疑問と生活感が、眠れない夜の手前に残っている。",
    id: "kana",
    mood: "眠れないけれど、誰かに話すほどでもない顔",
    name: "かな",
    roomObjects: [
      {
        description: "日記の端に、放送で聞き返したい疑問が残っている。",
        id: "memo",
        label: "日記のメモ",
      },
      {
        description: "窓の外は現実時刻と同じ夜。雨の強さだけが少し大きい。",
        id: "window",
        label: "窓",
      },
      {
        description: "スマホの小さな画面に、観察ログと放送テーマ候補が残っている。",
        id: "terminal",
        label: "スマホ",
      },
      {
        description: "放課後の知識箱が小さな音量で流れる。",
        id: "crt",
        label: "小さなラジオ",
      },
      {
        description: "読みかけの本。疑問が日記へ移る前の場所。",
        id: "envelope",
        label: "本",
      },
      {
        description: "暖色のランプ。強くすると部屋が少し現実に戻る。",
        id: "lamp",
        label: "ランプ",
      },
    ],
    roomType: "kana-room",
    shortName: "KANA",
  },
  tartar: {
    accent: "#67e8f9",
    description:
      "CRT、PC、配線、通知、放送機材。考え込むと机の上に理屈が増えていく。",
    id: "tartar",
    mood: "理屈で片づけたいけれど、少しだけ観察者を気にしている",
    name: "タルタル",
    roomObjects: [
      {
        description: "放課後の知識箱のNOW PLAYING。通知と時計が同じ画面にいる。",
        id: "crt",
        label: "CRT",
      },
      {
        description: "配線の横に置かれたPC。観察ログと放送テーマ候補を管理している。",
        id: "terminal",
        label: "PC",
      },
      {
        description: "放送テーマの断片。まだ原稿ではなく、考えかけのネタ。",
        id: "memo",
        label: "机のメモ",
      },
      {
        description: "配線の奥で小さく光る通知。放送前の緊張だけを示している。",
        id: "envelope",
        label: "通知光",
      },
      {
        description: "雨と現実時刻。外の暗さで、考え方の速度が変わる。",
        id: "window",
        label: "窓",
      },
      {
        description: "机のランプ。強めると配線の影が少し動く。",
        id: "lamp",
        label: "ランプ",
      },
    ],
    roomType: "tartar-room",
    shortName: "TARTAR",
  },
};

export const defaultRelationship: Relationship = {
  dependency: 8,
  friendship: 28,
  trust: 24,
};

type SubjectActionContext = {
  date?: Date;
  logs?: ObservationLog[];
  relationship?: Relationship;
};

const subjectActions: Record<SubjectId, SubjectAction[]> = {
  kana: [
    {
      ambientCue: "窓の雨が、返事のない通知みたいに少しだけ長く聞こえる。",
      broadcastHint: "夜の不安を、解決ではなく速度として扱う回にできる。",
      broadcastSeed: "夜の不安は、なぜ昼より大きく聞こえるのか",
      id: "kana-window",
      label: "窓を見ている",
      logText: "かなが窓の外を見ていた",
      mood: "眠れないけれど、誰かに話すほどでもない顔",
      reaction: "また来たんだ。今日は静かだから、足音だけ先に分かった。",
      themeCandidate: "夜の不安と雨音",
      thought: "雨の音って、考えを止めるんじゃなくて、少し遅くするだけかも。",
      timeBands: ["late-night", "night"],
    },
    {
      ambientCue: "スマホの画面が一瞬だけ明るくなって、部屋が現実に戻る。",
      broadcastHint: "通知待ちを、人間関係ではなく部屋の明るさとして話せる。",
      broadcastSeed: "通知を待つ時間は、なぜ少しだけ自分を小さくするのか",
      id: "kana-phone",
      label: "スマホを見ている",
      logText: "かながスマホの通知を一度だけ見た",
      mood: "待っていないふりが、少しだけ下手な顔",
      reaction: "見てない。いや、見たけど。そこまで観察しなくてよくない？",
      themeCandidate: "通知を待つ夜",
      thought: "待ってないふりをしてる時ほど、待ってるのが分かるの変だよね。",
      timeBands: ["night", "late-night"],
    },
    {
      ambientCue: "日記の紙が、ランプの端で少しだけ黄色く見える。",
      broadcastHint: "納得したふりのあとに残る寂しさを、かな側の問いにできる。",
      broadcastSeed: "分かったふりは、なぜあとで寂しくなるのか",
      id: "kana-diary",
      label: "日記を書いている",
      logText: "かなが日記に短い疑問を残した",
      mood: "言葉にすると大げさになることを、短く残している",
      reaction: "読まれる前提で書いてないからね。まあ、少しならいいけど。",
      themeCandidate: "分かったふりと寂しさ",
      thought: "納得してないのに頷くと、自分の部屋から少し外へ出される感じがする。",
      timeBands: ["late-night", "night"],
    },
    {
      ambientCue: "小さなラジオの音量が、聞こえるか聞こえないかの境目にある。",
      broadcastHint: "声が近すぎる時の安心と怖さを、深夜ラジオの距離感で扱える。",
      broadcastSeed: "声が近いと安心するのに、なぜ少し怖い時もあるのか",
      id: "kana-radio",
      label: "小さなラジオを触っている",
      logText: "かなが小さなラジオの音量を少し下げた",
      mood: "音がある方が落ち着くけれど、近すぎる声は少し避けたい顔",
      reaction: "放送って、近いのか遠いのか分からない時があるんだよね。",
      themeCandidate: "声の距離感",
      thought: "誰かの声があると安心するのに、近すぎると急に部屋が狭くなる。",
      trustLevel: "familiar",
    },
    {
      ambientCue: "ランプの下だけが少し暖かくて、部屋の隅はまだ夜のまま。",
      broadcastHint: "安心を明るさではなく、暗さが残る場所として話せる。",
      broadcastSeed: "安心は、部屋を全部明るくすることなのか",
      id: "kana-lamp",
      label: "ランプを見ている",
      logText: "かながランプの明るさを少し落とした",
      mood: "明るすぎる部屋より、少し暗い場所を残したい顔",
      reaction: "全部見えると落ち着く、とは限らないじゃん。",
      themeCandidate: "安心と暗さ",
      thought: "明るくしたら安心すると思ってたけど、少し暗い方が息がしやすい時もある。",
      trustLevel: "close",
    },
  ],
  tartar: [
    {
      ambientCue: "CRTの端に、NOW PLAYINGと時計が同じ明るさで残っている。",
      broadcastHint: "通知を情報ではなく、小さい呼び出し音として扱える。",
      broadcastSeed: "なぜ人は通知を開く前に少し緊張するのか",
      id: "tartar-notification",
      label: "通知を見ている",
      logText: "タルタルが通知を見ていた",
      mood: "理屈で片づけたいけれど、少しだけ観察者を気にしている",
      reaction: "通知を見ただけ。いや、反応を見られると説明したくなるな。",
      themeCandidate: "通知の小さい緊張",
      thought: "通知って、情報というより小さい呼び出し音なんだよな。",
      timeBands: ["night", "late-night"],
    },
    {
      ambientCue: "モニターが一瞬暗くなって、机の上の配線だけが見える。",
      broadcastHint: "小さいWebサイトを、秘密基地や放送室として話せる。",
      broadcastSeed: "小さなWebサイトは、なぜ秘密基地に似ているのか",
      id: "tartar-crt",
      label: "CRTを調整している",
      logText: "タルタルがCRTの明るさを少し下げた",
      mood: "画面の明るさから考えの速度を調整している",
      reaction: "暗くした方が、考えがこっちに戻ってくるんだよ。変だけど。",
      themeCandidate: "小さなWebサイトと秘密基地",
      thought: "画面が暗い方が、なぜか考えが自分のものに戻ってくる。",
      timeBands: ["late-night", "night"],
    },
    {
      ambientCue: "メモの端に、消しかけの矢印と小さい失敗案が残っている。",
      broadcastHint: "失敗した小さい版を、ものづくりの優しさとして扱える。",
      broadcastSeed: "失敗した試作品は、なぜ少しだけかわいいのか",
      id: "tartar-memo",
      label: "メモを書いている",
      logText: "タルタルが放送テーマのメモを書いた",
      mood: "完成形より、先に壊れる小さい版を考えている",
      reaction: "完成品より先に、壊れる場所を見たいんだよね。説明しすぎたな。",
      themeCandidate: "失敗した試作品のかわいさ",
      thought: "作るなら、まず失敗する小さい版から置きたいんだよね。",
      timeBands: ["day", "night", "late-night"],
    },
    {
      ambientCue: "配線の影が机の上で少しずれて、ランプの熱だけが残る。",
      broadcastHint: "便利さの裏側にある配線や手間を、生活の手触りで話せる。",
      broadcastSeed: "便利なものほど、なぜ裏側の配線を忘れやすいのか",
      id: "tartar-cable",
      label: "配線を触っている",
      logText: "タルタルが配線を差し直した",
      mood: "うまく動いているものの裏側を、少し疑っている",
      reaction: "動いてる時ほど、配線を見たくなる。職業病じゃなくて、たぶん趣味。",
      themeCandidate: "便利さの裏側",
      thought: "便利なものって、裏で面倒なものが静かに働いてる時がある。",
      trustLevel: "familiar",
    },
    {
      ambientCue: "時計の秒が、放送前の無音と同じくらいはっきり聞こえる。",
      broadcastHint: "放送テーマが生まれる前の待ち時間を、番組文化として扱える。",
      broadcastSeed: "考えが始まる前の無音には、何が残っているのか",
      id: "tartar-broadcast-seed",
      label: "放送ネタを考えている",
      logText: "タルタルが放送テーマの候補を小さく丸で囲んだ",
      mood: "言葉になる前の違和感を、まだ急いでいない",
      reaction: "まだネタじゃない。ネタになる前の、変な引っかかり。",
      themeCandidate: "放送ネタになる前の違和感",
      thought: "テーマって、言葉にした瞬間に少し固くなるんだよな。",
      trustLevel: "close",
    },
  ],
};

const objectReactions: Record<SubjectId, Record<RoomObjectId, SubjectAction>> = {
  kana: {
    crt: {
      ambientCue: "小さなラジオのノイズが、雨に混ざって一瞬だけ遠くなる。",
      broadcastHint: "放送の声が近いのに遠い感覚を、かなの生活感から扱える。",
      broadcastSeed: "ラジオの声は、なぜ部屋にいるのに少し遠いのか",
      id: "kana-crt",
      label: "小さなラジオを見る",
      logText: "かなの小さなラジオが、低い音量で鳴っていた",
      mood: "声がある場所に、少しだけ寄りかかっている",
      reaction: "これ、聞いてるっていうより、部屋に置いてる感じなんだよね。",
      themeCandidate: "ラジオの声と部屋の距離",
      thought: "声があるだけで落ち着くけど、返事をしなくていい距離がちょうどいい。",
    },
    envelope: {
      ambientCue: "読みかけの本に、日記へ移る前の疑問が挟まっている。",
      broadcastHint: "本を閉じたあとに残る疑問を、生活の中の問いとして扱える。",
      broadcastSeed: "本を閉じたあとに残る疑問は、なぜ少し自分のものになるのか",
      id: "kana-envelope",
      label: "本を見る",
      logText: "かなの本に、日記へ移る前の疑問が挟まっていた",
      mood: "読んだ言葉を、自分の言葉にする前で止まっている",
      reaction: "読んだだけなのに、自分のことみたいに残る時があるんだよね。",
      themeCandidate: "本を閉じたあとに残る疑問",
      thought: "本を閉じてから残る疑問って、読んだ内容より自分の部屋に近い。",
    },
    lamp: {
      ambientCue: "ランプの輪郭が少し揺れて、日記の影が短くなる。",
      broadcastHint: "明るさと安心を単純に結びつけない回にできる。",
      broadcastSeed: "部屋を明るくすれば、本当に不安は減るのか",
      id: "kana-lamp-object",
      label: "ランプを見る",
      logText: "かながランプの明るさを指で確かめた",
      mood: "明かりの強さで、考えの深さを測っている",
      reaction: "明るくしすぎると、考えてる顔まで見えるから嫌なんだよ。",
      themeCandidate: "明るさと不安",
      thought: "不安って、暗いから増えるんじゃなくて、静かだから聞こえる時もある。",
    },
    memo: {
      ambientCue: "日記の余白に、疑問だけが短く残っている。",
      broadcastHint: "生活の中の小さい違和感を、そのまま放送テーマへ渡せる。",
      broadcastSeed: "小さい疑問は、なぜ人に話す前に日記へ逃げるのか",
      id: "kana-memo",
      label: "日記のメモを見る",
      logText: "かなの日記に、放送で聞き返したい疑問があった",
      mood: "聞きたいけれど、聞き方をまだ探している",
      reaction: "そこ、まだ文章じゃない。疑問のまま置いてるだけ。",
      themeCandidate: "日記に残る小さい疑問",
      thought: "ちゃんとした質問にする前の疑問って、変な形のままの方が正直かも。",
    },
    terminal: {
      ambientCue: "スマホの画面に、短いログだけが静かに並んでいる。",
      broadcastHint: "観察ログを、次の放送テーマの種として扱う入口にできる。",
      broadcastSeed: "観察された小さな行動は、どうやって放送のテーマになるのか",
      id: "kana-terminal",
      label: "スマホを見る",
      logText: "かなのスマホに、夜の行動ログが残っていた",
      mood: "見られていることに、少しだけ慣れてきた",
      reaction: "見られてる感じ、少し慣れたかも。でも全部は慣れたくない。",
      themeCandidate: "観察ログと放送ネタ",
      thought: "ログになると、ただの夜更かしにも理由があったみたいに見える。",
    },
    window: {
      ambientCue: "窓の外だけが現実時刻と同じ速度で暗くなっている。",
      broadcastHint: "現実時刻と部屋の気分がずれる瞬間を、深夜感の核にできる。",
      broadcastSeed: "窓の外だけが現実っぽい時、部屋の中はどこにいるのか",
      id: "kana-window-object",
      label: "窓を見る",
      logText: "かなの窓の外で、雨が少し強くなっていた",
      mood: "外の暗さで、自分の考えを測っている",
      reaction: "外が本当に夜だと、考えごとも言い訳できなくなる感じがする。",
      themeCandidate: "窓の外と部屋の内側",
      thought: "窓の外だけが現実っぽいと、部屋の中の考えが少し浮く。",
    },
  },
  tartar: {
    crt: {
      ambientCue: "CRTの走査線が、NOW PLAYINGの文字を少しだけ揺らす。",
      broadcastHint: "画面が暗い方が考えが戻る感覚を、Webサイトの部屋感につなげる。",
      broadcastSeed: "暗い画面は、なぜ考えを自分のものに戻すのか",
      id: "tartar-crt-object",
      label: "CRTを見る",
      logText: "タルタルのCRTに、放課後の知識箱の文字が残っていた",
      mood: "画面の明るさと考えの距離を調整している",
      reaction: "この暗さがちょうどいい。明るいと説明資料みたいになるから。",
      themeCandidate: "暗い画面と考える距離",
      thought: "画面が暗い方が、情報じゃなくて部屋として見えてくる。",
    },
    envelope: {
      ambientCue: "配線の奥で通知光が一度だけ光って、すぐ暗くなる。",
      broadcastHint: "通知を情報ではなく、放送前の小さな緊張として扱える。",
      broadcastSeed: "通知は、なぜ開く前に少しだけ空気を変えるのか",
      id: "tartar-envelope",
      label: "通知光を見る",
      logText: "タルタルの配線の奥で、通知を示す小さな光が点いた",
      mood: "情報を開く前の緊張を、まだ理屈にしていない",
      reaction: "通知は音より光の方が厄介だな。無視しても見えたことは残る。",
      themeCandidate: "通知光と放送前の緊張",
      thought: "小さい光って、開く前の情報をもう部屋に入れてしまう。",
    },
    lamp: {
      ambientCue: "ランプを少し強めると、配線の影が机の奥へ逃げる。",
      broadcastHint: "作業部屋の光と集中の関係を、講義ではなく手触りで話せる。",
      broadcastSeed: "作業机の明かりは、なぜ集中の境界線になるのか",
      id: "tartar-lamp-object",
      label: "ランプを見る",
      logText: "タルタルが机のランプを少し強くした",
      mood: "作業に戻るか、考えに沈むかを明かりで決めている",
      reaction: "ランプはスイッチというより、作業に戻るための合図なんだよ。",
      themeCandidate: "作業机の明かり",
      thought: "明かりを強くすると、考えごとが作業に変換される時がある。",
    },
    memo: {
      ambientCue: "メモには、丸で囲まれた言葉と消されたたとえが残っている。",
      broadcastHint: "放送ネタが完成前の違和感から始まることをUI上で示せる。",
      broadcastSeed: "放送テーマは、なぜ完成した答えより違和感から始まるのか",
      id: "tartar-memo-object",
      label: "机のメモを見る",
      logText: "タルタルのメモに、放送テーマの断片が残っていた",
      mood: "テーマ未満の言葉を、まだ原稿にしていない",
      reaction: "ここで綺麗にすると、たぶんつまらなくなる。まだ汚いままでいい。",
      themeCandidate: "テーマ未満の違和感",
      thought: "放送ネタって、答えじゃなくて引っかかりの方から生まれる。",
    },
    terminal: {
      ambientCue: "PCのログが、まだ原稿ではない行動だけを並べている。",
      broadcastHint: "観察ログを、放送テーマの種として扱える。",
      broadcastSeed: "観察ログは、どうやって放送の種になるのか",
      id: "tartar-terminal",
      label: "PCを見る",
      logText: "タルタルのPCに、放送ネタ候補が並んでいた",
      mood: "ログを原稿にしないように、まだ距離を取っている",
      reaction: "ログは原稿じゃない。けど、原稿になる前の温度は残せる。",
      themeCandidate: "観察ログから放送テーマへ",
      thought: "行動ログって、あとから見るとテーマの下書きみたいに見える時がある。",
    },
    window: {
      ambientCue: "窓の外の雨が、CRTの光を少しだけ薄くする。",
      broadcastHint: "現実時刻同期を、ただの時計ではなく思考速度の変化にできる。",
      broadcastSeed: "外の時間は、なぜ部屋の中の考え方を変えるのか",
      id: "tartar-window-object",
      label: "窓を見る",
      logText: "タルタルが窓の外の雨を一度だけ見た",
      mood: "外の時間で、自分の作業の速度を測っている",
      reaction: "外が夜だと、急に作業が言い訳できる気がするんだよね。",
      themeCandidate: "外の時間と作業部屋",
      thought: "現実の時間が見えると、作業部屋の中だけ別の速度で動いてる気がする。",
    },
  },
};

function getTimeBand(date: Date): TimeBand {
  const hour = date.getHours();

  if (hour >= 0 && hour < 5) {
    return "late-night";
  }

  if (hour >= 5 && hour < 11) {
    return "morning";
  }

  if (hour >= 11 && hour < 18) {
    return "day";
  }

  return "night";
}

function getTrustLevel(relationship: Relationship) {
  if (relationship.trust >= 58 || relationship.friendship >= 62) {
    return "close";
  }

  if (relationship.trust >= 34 || relationship.friendship >= 42) {
    return "familiar";
  }

  return "early";
}

function getDaysSinceVisit(relationship: Relationship, date: Date) {
  if (!relationship.lastVisitedAt) {
    return Number.POSITIVE_INFINITY;
  }

  const lastVisitedAt = new Date(relationship.lastVisitedAt).getTime();

  if (Number.isNaN(lastVisitedAt)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor((date.getTime() - lastVisitedAt) / 86_400_000);
}

function scoreAction(
  action: SubjectAction,
  index: number,
  subjectId: SubjectId,
  context: Required<Pick<SubjectActionContext, "date" | "relationship">> & {
    logs: ObservationLog[];
  },
) {
  const timeBand = getTimeBand(context.date);
  const trustLevel = getTrustLevel(context.relationship);
  const daysSinceVisit = getDaysSinceVisit(context.relationship, context.date);
  const recentActionIds = new Set(context.logs.slice(0, 8).map((log) => log.actionId));
  const base =
    context.date.getHours() * 13 +
    context.date.getMinutes() +
    index * 7 +
    (subjectId === "kana" ? 3 : 0);
  let score = base % 17;

  if (action.timeBands?.includes(timeBand)) {
    score += 18;
  }

  if (!action.timeBands) {
    score += 8;
  }

  if (!action.trustLevel || action.trustLevel === trustLevel) {
    score += 10;
  }

  if (action.trustLevel === "close" && trustLevel === "early") {
    score -= 12;
  }

  if (daysSinceVisit >= 3 && action.id.includes(subjectId === "kana" ? "window" : "crt")) {
    score += 10;
  }

  if (recentActionIds.has(action.id)) {
    score -= 18;
  }

  return score;
}

export function getSubjectAction(
  subjectId: SubjectId,
  context: SubjectActionContext = {},
) {
  const date = context.date ?? new Date();
  const relationship = context.relationship ?? defaultRelationship;
  const logs = context.logs ?? [];
  const actions = subjectActions[subjectId];
  const scoredActions = actions.map((action, index) => ({
    action,
    score: scoreAction(action, index, subjectId, {
      date,
      logs,
      relationship,
    }),
  }));

  scoredActions.sort((first, second) => second.score - first.score);

  return scoredActions[0]?.action ?? actions[0];
}

export function clampRelationship(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function updateRelationship(
  relationship: Relationship,
  source: ObservationLog["source"],
): Relationship {
  const trustDelta = source === "dialogue" ? 3 : source === "room-object" ? 2 : 1;
  const friendshipDelta = source === "visit" ? 2 : 1;
  const dependencyDelta = source === "dialogue" ? 1 : 0;

  return {
    dependency: clampRelationship(relationship.dependency + dependencyDelta),
    friendship: clampRelationship(relationship.friendship + friendshipDelta),
    lastVisitedAt: new Date().toISOString(),
    trust: clampRelationship(relationship.trust + trustDelta),
  };
}

export function getRelationshipAtmosphere(
  subjectId: SubjectId,
  relationship: Relationship,
): RelationshipAtmosphere {
  const trustLevel = getTrustLevel(relationship);
  const isKana = subjectId === "kana";

  if (trustLevel === "close") {
    return {
      dependencyLine: isKana
        ? "全部を見せるつもりはない。でも、来ること自体にはもう驚かない。"
        : "観察される前提で、少しだけメモの置き方が変わっている。",
      friendshipLine: isKana
        ? "また来たね、という言葉が冗談ではなくなってきた。"
        : "説明する前に、相手の反応を一度だけ待つようになった。",
      headline: isKana ? "見られている感じに少し慣れた" : "観察者を作業部屋の一部として扱い始めた",
      trustLine: isKana
        ? "かなは、疑問を隠すより先に小さく口に出す。"
        : "タルタルは、完成前のメモを少しだけそのまま置く。",
    };
  }

  if (trustLevel === "familiar") {
    return {
      dependencyLine: isKana
        ? "近づきすぎると少し身構えるが、足音はもう知らない音ではない。"
        : "見られることを意識しながらも、作業の手は止めない。",
      friendshipLine: isKana
        ? "今日は静かだね、くらいの距離で受け止めている。"
        : "少し皮肉を言いながら、説明を短く切る。",
      headline: isKana ? "観察者の気配を覚え始めている" : "観察されることを理屈で処理し始めている",
      trustLine: isKana
        ? "かなは、日記の端だけなら見られてもいいと思っている。"
        : "タルタルは、まだ原稿ではない断片を机に残す。",
    };
  }

  return {
    dependencyLine: isKana
      ? "見られていることには気づいている。まだ、少し距離を置いている。"
      : "観察者を気にしているが、まだ機材の方を向いている。",
    friendshipLine: isKana
      ? "返事をする前に、窓の外を一度見る。"
      : "皮肉っぽく反応して、すぐ作業へ戻る。",
    headline: isKana ? "まだ少しだけ身構えている" : "まだ観察者を測っている",
    trustLine: isKana
      ? "かなは、疑問を全部は言葉にしない。"
      : "タルタルは、理屈で距離を取ろうとしている。",
  };
}

export function createObservationLog({
  action,
  source,
  subjectId,
}: {
  action: SubjectAction;
  source: ObservationLog["source"];
  subjectId: SubjectId;
}): ObservationLog {
  const timestamp = new Date().toISOString();

  return {
    actionId: action.id,
    broadcastHint: action.broadcastHint,
    createdAt: timestamp,
    id: `${subjectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    logText: action.logText,
    mood: action.mood,
    objectId: action.objectId,
    source,
    subjectId,
    themeCandidate: action.themeCandidate,
    thought: action.thought,
    timestamp,
  };
}

export function roomObjectAction(
  subjectId: SubjectId,
  objectId: RoomObjectId,
): SubjectAction {
  const action = objectReactions[subjectId][objectId];

  return action ? { ...action, objectId } : getSubjectAction(subjectId);
}

function getActionLabelFromLog(log: ObservationLog) {
  const subjectActionsAndObjects = [
    ...subjectActions[log.subjectId],
    ...Object.values(objectReactions[log.subjectId]),
  ];

  return (
    subjectActionsAndObjects.find((action) => action.id === log.actionId)?.label ??
    log.actionId
  );
}

function isBroadcastReadyCandidate(logs: ObservationLog[]) {
  const latestLog = logs[0];
  const hasUsefulSource = logs.some(
    (log) => log.source === "room-object" || log.source === "dialogue",
  );
  const hasConcreteObject = logs.some((log) => log.objectId);

  return Boolean(
    latestLog?.themeCandidate &&
      latestLog.broadcastHint &&
      (logs.length >= 2 || hasUsefulSource || hasConcreteObject),
  );
}

function toThemeSourceExport(candidate: BroadcastThemeCandidate): ThemeSourceExport | null {
  if (!candidate.subjectId || !candidate.createdAt || !candidate.sourceLogIds) {
    return null;
  }

  return {
    actionId: candidate.actionId,
    createdAt: candidate.createdAt,
    hint: candidate.hint,
    mood: candidate.mood,
    objectId: candidate.objectId,
    source: "observation-room",
    sourceLogIds: candidate.sourceLogIds,
    subjectId: candidate.subjectId,
    theme: candidate.theme,
  };
}

export function getBroadcastThemeCandidates(
  logs: ObservationLog[],
  subjectId: SubjectId,
): BroadcastThemeCandidate[] {
  const groupedLogs = logs
    .filter((log) => log.subjectId === subjectId)
    .filter((log) => log.themeCandidate || log.broadcastHint)
    .reduce<Record<string, ObservationLog[]>>((groups, log) => {
      const theme = log.themeCandidate ?? log.thought;

      return {
        ...groups,
        [theme]: [...(groups[theme] ?? []), log],
      };
    }, {});

  return Object.entries(groupedLogs)
    .map(([theme, grouped]) => {
      const sortedLogs = grouped.sort(
        (first, second) =>
          new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime(),
      );
      const latestLog = sortedLogs[0];
      const firstLog = sortedLogs[sortedLogs.length - 1];
      const candidate: BroadcastThemeCandidate = {
        actionId: latestLog.actionId,
        actionLabel: getActionLabelFromLog(latestLog),
        count: sortedLogs.length,
        createdAt: firstLog.createdAt ?? firstLog.timestamp,
        exportable: isBroadcastReadyCandidate(sortedLogs),
        hint:
          latestLog.broadcastHint ??
          "この観察ログは、次の放送テーマ候補として保留できる。",
        id: `${subjectId}-${theme}`,
        lastObservedAt: latestLog.timestamp,
        mood: latestLog.mood,
        objectId: latestLog.objectId,
        source: latestLog.source,
        sourceLogIds: sortedLogs.map((log) => log.id),
        subjectId,
        theme,
        timestamp: latestLog.timestamp,
      };

      return {
        ...candidate,
        exportPreview: toThemeSourceExport(candidate),
      };
    })
    .sort((first, second) => {
      if (first.exportable !== second.exportable) {
        return first.exportable ? -1 : 1;
      }

      return (
        new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime()
      );
    })
    .slice(0, 6);
}
