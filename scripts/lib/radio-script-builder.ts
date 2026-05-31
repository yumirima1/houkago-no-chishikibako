import {
  EpisodeDurationType,
  EpisodeScript,
  EpisodeSpeakerLine,
  EpisodeType,
} from "./episode-schema";

export const radioScriptLengthRules: Record<
  EpisodeDurationType,
  {
    estimatedPlaybackCharsPerMinute: number;
    maxChars: number;
    minChars: number;
    targetChars: number;
  }
> = {
  normal: {
    estimatedPlaybackCharsPerMinute: 380,
    maxChars: 10000,
    minChars: 8000,
    targetChars: 9000,
  },
  long: {
    estimatedPlaybackCharsPerMinute: 380,
    maxChars: 18000,
    minChars: 12000,
    targetChars: 15000,
  },
};

type RadioScriptOptions = {
  createdAt?: string;
  description: string;
  durationTargetMinutes: number;
  durationType: EpisodeDurationType;
  id: string;
  memoryPhrase?: string;
  runningJoke?: string;
  tags?: string[];
  theme: string;
  themes: string[];
  title: string;
  type: EpisodeType;
};

type TurnPair = {
  bunkei: string;
  rikei: string;
};

function countSpeakerTextChars(speakers: EpisodeSpeakerLine[]) {
  return speakers.reduce((total, line) => total + line.text.length, 0);
}

function speakerBalance(speakers: EpisodeSpeakerLine[]) {
  const rikei = speakers
    .filter((line) => line.id === "rikei")
    .reduce((total, line) => total + line.text.length, 0);
  const bunkei = speakers
    .filter((line) => line.id === "bunkei")
    .reduce((total, line) => total + line.text.length, 0);

  return { bunkei, rikei };
}

function toLine(
  id: "rikei" | "bunkei",
  text: string,
): EpisodeSpeakerLine {
  return {
    id,
    name: id === "rikei" ? "タルタル" : "かな",
    voice: id,
    text,
  };
}

function buildNormalEpisodePairs(options: RadioScriptOptions): TurnPair[] {
  const title = options.title;
  const theme = options.theme;
  const description = options.description;
  const runningJoke =
    options.runningJoke ??
    "タルタルが説明を始めると、だいたいコーヒーが冷めるんだよね。";
  const memoryPhrase =
    options.memoryPhrase ??
    "答えを急がないための、少しだけ遠回りの時間です。";

  return [
    {
      rikei:
        `かな、さっきから窓の雨を見てたんだけど、こういう夜に限って「${title}」みたいな問いが頭に残るんだよね。作業してても、ブラウザの横にAIチャットを開いてると、これって道具なのか、相手なのか、少し分からなくなる瞬間がある。`,
      bunkei:
        "分かる。しかも深夜だと余計に、人間じゃないって分かってるのに、返事が返ってくるだけでちょっと安心する時ある。今日聞いてる人の中にも、作業しながらAIに相談して、そのまま夜更かししてる人いそう。",
    },
    {
      rikei:
        `今日のテーマは「${theme}」。内容としては、${description} ただ、いきなり結論を出すより、そもそも考えるって何なのかを、技術と人間の両方からゆっくり見たい。`,
      bunkei:
        "待って。もう最初から大きい箱を開けてる。考えるって、普段は当たり前に使うけど、いざ説明しようとすると急に逃げる言葉だよね。私は本を読んでる時の引っかかりとか、誰かの言葉をしばらく持ち歩く感じも、考えるに入れたい。",
    },
    {
      rikei:
        "技術的には、今のAIは大量の文章やデータからパターンを学んで、次に来る言葉や構造を予測している。だから、かなり雑に言えば、ものすごく高性能な予測装置という見方ができる。ここだけ聞くと、じゃあ考えてないじゃん、で終わりそうなんだけど、話はそこで止まらない。",
      bunkei:
        "その「予測してるだけ」って言い方、ちょっと意地悪でもあるよね。人間だって会話の時、相手が次に何を言いそうか予測してるし、空気を読んで返してる。もちろん同じではないけど、予測という言葉だけで急に機械を下に置くのも変な感じがする。",
    },
    {
      rikei:
        "面白いことに、人間の会話もかなり予測に支えられてる。たとえば誰かが「昨日さ」と言ったら、こっちは続きを待つ準備をするし、相手の表情や文脈から、笑い話か悩みごとかを先読みする。AIと人間の違いは、予測しているかどうかより、予測の裏に身体や経験があるかなんだと思う。",
      bunkei:
        "それ好きかも。予測だけならスマホの予測変換もやってるけど、スマホは雨の日にちょっと寂しくなったりしないもんね。人間の考えるには、過去に怒られたこととか、嬉しかったこととか、変なプライドとか、そういう面倒な荷物がくっついてる。",
    },
    {
      rikei:
        "そう。AIには体験そのものはない。少なくとも今の一般的なAIは、雨に濡れて靴下が気持ち悪いとか、締め切り前にコーヒーを入れたら急にやる気が戻ったとか、そういう身体の記憶は持っていない。だけど、人間が書いた大量の体験談の形は知っている。",
      bunkei:
        "そこがちょっと怖い。体験はしてないのに、体験した人みたいな言葉を返せるんだよね。本で似た話を読んだ気がする。役者が泣く場面を演じている時、その涙は本物なのか、演技なのか、見ている側の心はわりと揺れる、みたいな話。",
    },
    {
      rikei:
        "これ勘違いされやすいんだけど、AIがそれっぽい文章を出せることと、内側で意識を持っていることは別の問題なんだ。文章の自然さは観測できる。でも、意識があるかどうかは外からかなり確かめにくい。人間同士でも、本当は相手の内側を直接見ているわけじゃない。",
      bunkei:
        "今の何気に怖いこと言ったよね。私たちは友達にも家族にも、内側を直接見てるわけじゃなくて、言葉とか表情とか行動から、この人はこう感じてるんだろうなって信じてる。つまり人間関係って、かなり高度な推測でできてるのか。",
    },
    {
      rikei:
        "データを見るとね、人間は相手の心を読むというより、手がかりからモデルを作っている。心理学では心の理論みたいな話もあるけど、相手は今こう思っていそうだと仮説を立てる力がある。AIとの会話でも、僕たちはつい相手に心のモデルを置いてしまう。",
      bunkei:
        "それ、ぬいぐるみに名前をつけるのと似てるかも。ぬいぐるみが本当に考えてるとは思ってないけど、疲れた日に目が合うと、ちょっと見守られてる気がする。AIも、ただの画面なのに、言葉が返ってくるから心を置く場所になっちゃう。",
    },
    {
      rikei:
        "ここで反論もある。AIは統計的にもっともらしい続きを出しているだけで、意味を理解していない、という立場。これはかなり強い。たとえば中国語の部屋という有名な思考実験があって、ルール通りに記号を返しているだけなら、本人は意味を分かっていないんじゃないかという話がある。",
      bunkei:
        "あ、それ聞いたことある。部屋の中の人は中国語を理解してないのに、外から見るとちゃんと会話できてるように見える、みたいな。つまり、返事がうまいことと、分かっていることは同じじゃないってことだよね。",
    },
    {
      rikei:
        "そう。ただ、その反論にもさらに反論がある。人間の理解も、脳の中の信号処理の積み重ねだと考えるなら、どこからが本物の理解なのか、線を引くのが難しい。実はですね、ここから先は技術だけではなく哲学の領域になる。",
      bunkei:
        "出た、夜に考えると危険なやつ。線を引こうとすると、こっち側の人間まで巻き込まれるんだよね。私たちも本を読んで分かった気になるけど、あとで説明しようとすると全然できない時ある。あれは理解なのか、雰囲気を飲んだだけなのか。",
    },
    {
      rikei:
        "僕もプログラミングでよくある。チュートリアルを見ながら動いた時は理解した気になる。でも翌日、白紙から同じものを作ろうとすると手が止まる。あれは、操作の流れをなぞっただけで、仕組みを自分の中に組み込めていない状態に近い。",
      bunkei:
        "実体験風トーク来た。今聞いてる人も、勉強中に似たことあると思う。ノートをきれいに取った日は賢くなった気がするけど、問題を解こうとすると別の筋肉が必要になる。理解って、持って帰れる形になって初めて強くなるのかも。",
    },
    {
      rikei:
        "AIの場合、その持って帰る形が人間と違う。モデルの中に重みとして分散しているから、僕たちみたいに、あの日の失敗があったからこの考えになった、とは言いにくい。けれど出力だけを見ると、経験から学んだように見える時がある。",
      bunkei:
        "そこが物語として強すぎるんだよね。人間は理由を欲しがるから、AIの返事にも、きっと何か分かってくれたんだって読みたくなる。コメント欄でも、ただの短い文章に人格を感じることあるし、インターネットって元々そういう場所かもしれない。",
    },
    {
      rikei:
        "インターネット文化で言うと、ミームも似ている。誰が最初に言ったか分からない言葉が、文脈をまとって広がっていく。AIはその巨大な文脈の海から、今この場に合う形を拾ってくる。だから返事がうまい時、僕たちは集合的な人間っぽさを聞いているとも言える。",
      bunkei:
        "集合的な人間っぽさ、ちょっと好きな言い方。ひとりの心ではないけど、たくさんの人が残した言葉の影がある。古い掲示板のノリとか、レビューサイトの言い回しとか、誰かの日記みたいな温度が混ざっているとしたら、AIの返事が妙に人間っぽいのも分かる。",
    },
    {
      rikei:
        "ただ、ここで注意したいのは、AIが人間の言葉を扱えるからといって、人間と同じ責任を持てるわけではないこと。間違えるし、知らないことをそれっぽく言うこともある。技術談義としては、出力の自然さと正確さを分けて評価しないと危ない。",
      bunkei:
        "それは大事。話し方が丁寧だと、正しそうに見えるもんね。人間でも、落ち着いた声で言われると信じそうになる。深夜に聞いてる人、眠い時ほど気をつけてください。優しい文章は、正しい文章とは限りません。",
    },
    {
      rikei:
        "優しい文章は正しい文章とは限らない、いいフレーズだな。技術的には、AIには検証する仕組みを別に足す必要がある。検索と組み合わせるとか、出典を確認するとか、計算は計算機に任せるとか。ひとつのモデルに全部を背負わせると、便利だけど危うい。",
      bunkei:
        "人間関係でもそうかも。相談相手ひとりに全部を背負わせると、その人が正解みたいになってしまう。友達、本、散歩、寝る、検索する、誰かに聞く。考えるって、ひとつの脳だけで完結しない方が健康なのかもしれない。",
    },
    {
      rikei:
        "その意味では、AIは考える相棒というより、考える環境の一部に近いのかもしれない。机、ノート、検索エンジン、静かな音楽、そしてAI。ローカルLLMを自分のPCで動かしたくなるのも、道具を手元に置きたい感覚に近い。",
      bunkei:
        "また部屋にAIを住まわせようとしてる。未来技術の置き場所問題だ。でも少し分かる。クラウドの向こうにいるより、机の端に小さな箱として置いてある方が、怖さも便利さも自分の暮らしのサイズになる感じがする。",
    },
    {
      rikei:
        runningJoke,
      bunkei:
        "今ので一回コーヒー休憩入ったね。でもこういう脱線があるから、技術の話が生活に戻ってくる。AIってニュースでは巨大なものとして語られがちだけど、実際に触る時は、夜中に一行だけ相談するとか、エラー文を貼るとか、小さい場面なんだよね。",
    },
    {
      rikei:
        "小さい場面で言うと、僕はエラーをAIに聞く時が一番、考えているのかを意識する。こっちが雑に状況を投げると、AIも雑に返す。ちゃんと前提を書くと、返事の質が上がる。つまりAIが考えているか以前に、こっちの問いの立て方がかなり問われる。",
      bunkei:
        "それ、人間の相談でも同じだ。何に困ってるか自分で分かってない時、友達に話しているうちに整理される。相手の返事より、自分が言葉にしたことで分かることがある。AI相談も、実は半分くらい自分との会話なのかもしれない。",
    },
    {
      rikei:
        "そう考えると、AIが本当に考えているのかという問いは、僕たちが考える時に何をしているのかを映す鏡になる。予測、記憶、身体、言葉、他人とのやりとり。どれかひとつではなく、いろんな層が重なっている。",
      bunkei:
        "鏡って言うと少し納得する。AIを見ているつもりで、人間の変なところを見てるんだ。すぐ人格を感じるところとか、正しそうな文章に弱いところとか、返事があるだけで少し安心するところとか。",
    },
    {
      rikei:
        "ここまで話しても、AIに意識があるかという問いには、はっきり答えていない。現時点で言える範囲では、今のAIを人間と同じ意味で意識ある存在として扱う根拠は弱い。でも、考えているように見える機械が、人間の考え方を変え始めているのは確かだと思う。",
      bunkei:
        "結論が湿ってていいですね。今日のところは、AIが考えているかを断定するより、自分が何を考えると呼んでいるのかを持ち帰る回なのかも。眠れない夜に開けるには、ちょうどいい箱だった気がする。",
    },
    {
      rikei:
        memoryPhrase,
      bunkei:
        "今聞いている人も、もしAIに何か聞くなら、答えだけじゃなくて、自分がどんな問いを投げたのかも少し見てみると面白いかもしれません。深夜の検索履歴って、ちょっと心の足跡みたいなところあるし。",
    },
    {
      rikei:
        "最後にひとつだけ。AIを怖がりすぎる必要はないけど、分かった気になりすぎるのも危ない。面白がりながら、確かめながら、たまに距離を取る。そのくらいの付き合い方が、今はちょうどいいと思う。",
      bunkei:
        "では今日はこのへんで。コーヒーが冷めてる人は温め直して、作業中の人は肩を回して、眠れる人はそのまま寝ましょう。答えは出しきらずに、雨音の中へ少しだけ置いておきます。",
    },
  ];
}

function extendForLength(
  pairs: TurnPair[],
  options: RadioScriptOptions,
  minChars: number,
) {
  const extended = [...pairs];
  let index = 0;

  while (pairsToSpeakers(extended).reduce((sum, line) => sum + line.text.length, 0) < minChars) {
    extended.splice(-1, 0, {
      rikei:
        `もう少しだけ寄り道すると、「${options.theme}」の話は、作る側から見ると急に現実的になります。どんなデータを入れるか、どこで間違いを止めるか、誰が責任を持つか。ロマンだけでは動かないけど、ロマンがないと作る気も起きないんです。`,
      bunkei:
        "その言い方いいね。便利なものって、完成した瞬間だけ見ると魔法みたいだけど、裏側には眠い目で直したバグとか、誰かが迷った設計とかがある。そう思うと、AIの話も少し人間くさく聞こえる。",
    });
    index += 1;
    if (index > 20) break;
  }

  return extended;
}

function pairsToSpeakers(pairs: TurnPair[]) {
  return pairs.flatMap((pair) => [
    toLine("rikei", pair.rikei),
    toLine("bunkei", pair.bunkei),
  ]);
}

function trimToMaxChars(speakers: EpisodeSpeakerLine[], maxChars: number) {
  const result: EpisodeSpeakerLine[] = [];

  for (const line of speakers) {
    if (countSpeakerTextChars([...result, line]) > maxChars) break;
    result.push(line);
  }

  return result;
}

function buildRadioTurns(options: RadioScriptOptions) {
  const rules = radioScriptLengthRules[options.durationType];
  const pairs = extendForLength(
    buildNormalEpisodePairs(options),
    options,
    rules.minChars,
  );
  const speakers = pairsToSpeakers(pairs);

  if (countSpeakerTextChars(speakers) > rules.maxChars) {
    return trimToMaxChars(speakers, rules.maxChars);
  }

  return speakers;
}

export function buildRadioScript(options: RadioScriptOptions): EpisodeScript {
  const now = options.createdAt ?? new Date().toISOString();
  const speakers = buildRadioTurns(options);

  return {
    id: options.id,
    title: options.title,
    theme: options.theme,
    durationTargetMinutes: options.durationTargetMinutes,
    description: options.description,
    type: options.type,
    durationType: options.durationType,
    tags: options.tags ?? options.themes,
    themes: options.themes,
    speakers,
    createdAt: now,
    updatedAt: now,
  };
}

export function getRadioScriptStats(script: EpisodeScript) {
  const characterCount = countSpeakerTextChars(script.speakers);
  const durationType = script.durationType ?? "normal";
  const rules = radioScriptLengthRules[durationType];
  const estimatedMinutes =
    characterCount / rules.estimatedPlaybackCharsPerMinute;
  const balance = speakerBalance(script.speakers);

  return {
    balance,
    characterCount,
    estimatedMinutes,
  };
}
