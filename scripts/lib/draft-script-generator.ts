import {
  ConversationBeat,
  ConversationEventKind,
  ConversationSkeleton,
} from "./conversation-skeleton-generator";

export type DraftScriptSpeaker = "かな" | "タルタル";

export type DraftScriptLine = {
  order: number;
  speaker: DraftScriptSpeaker;
  sourceBeatOrder: number;
  role: ConversationBeat["role"];
  eventId?: string;
  eventKind?: ConversationEventKind;
  cue: string;
  text: string;
};

export type DraftScript = {
  theme: string;
  structureTemplate: string;
  atmosphere: ConversationSkeleton["atmosphere"];
  tone: ConversationSkeleton["tone"];
  eventPlan: ConversationSkeleton["eventPlan"];
  lines: DraftScriptLine[];
  productionNotes: string[];
  source?: {
    generatedAt?: string;
    generator: "draft-script-engine";
    skeletonFile?: string;
    theme?: string;
  };
};

type GenerateDraftScriptOptions = {
  skeleton: ConversationSkeleton;
};

const kanaOpenings = [
  "これさ、寝る前に考え始めるとちょっと止まらないやつなんだけど。",
  "今日の話、たぶん昼間にすると普通なのに、夜だと急に変に見えるやつ。",
  "なんかさ、分かってるつもりなのに引っかかることがあって。",
];

const tartarOpenings = [
  "あー、それはいい引っかかり方してる。",
  "その違和感、たぶん雑に消さない方が面白い。",
  "分かる。こういう話って、正解より先にモヤモヤが来るんだよね。",
];

function variantIndex(seed: string, length: number) {
  const total = [...seed].reduce(
    (currentTotal, char) => currentTotal + char.charCodeAt(0),
    0,
  );

  return Math.abs(total) % length;
}

function pick<T>(items: T[], seed: string) {
  return items[variantIndex(seed, items.length)];
}

function normalizeCue(cue: string) {
  return cue.replace(/\s+/g, " ").trim();
}

function stripInstructionWords(cue: string) {
  return normalizeCue(cue)
    .replace(/について/g, "のこと")
    .replace(/話$/g, "話。")
    .replace(/出す$/g, "出してみる。")
    .replace(/考える$/g, "考えてみる。");
}

function everydayExample(theme: string) {
  if (theme.includes("通知")) {
    return "通知が来ていないのに、なぜかスマホを伏せたまま気にしてる瞬間";
  }

  if (theme.includes("お金") || theme.includes("マネタイズ")) {
    return "好きだったものに値段がついた瞬間、急に見え方が変わる感じ";
  }

  if (theme.includes("記憶") || theme.includes("思い出")) {
    return "忘れたと思っていたことだけ、変なタイミングで戻ってくる感じ";
  }

  if (theme.includes("AI")) {
    return "入力欄に言葉を置いたあと、返事を待ってしまう感じ";
  }

  return "生活の中では小さいのに、夜になると急に大きく見える感じ";
}

function makeKanaHook(beat: ConversationBeat, skeleton: ConversationSkeleton) {
  const opening = pick(kanaOpenings, `${skeleton.theme}:${beat.order}`);

  return `${opening} ${everydayExample(skeleton.theme)}って、ちょっと変じゃない？`;
}

function makeTartarHook(beat: ConversationBeat, skeleton: ConversationSkeleton) {
  const opening = pick(tartarOpenings, `${beat.cue}:${skeleton.tone}`);

  return `${opening} ${skeleton.theme}って、説明する前にちょっと座って眺めたい感じがある。`;
}

function makeReception() {
  return "あー、それは分かる。いきなり説明されると、自分の感じ方だけ置いていかれる時あるよね。";
}

function makeAnalysis(beat: ConversationBeat, skeleton: ConversationSkeleton) {
  const cueHint =
    beat.eventKind === "reality_reference"
      ? "現実の都合も、気持ちの都合も混ざってる"
      : "気持ちと仕組みの間に、ちょっとした引っかかりがある";

  return `説明っぽくなりすぎないように言うと、${skeleton.theme}って、たぶん一個の理由だけじゃないんだよね。${cueHint}。`;
}

function makeQuestion() {
  return `でもそれ、ちょっと理屈が勝ちすぎてない？ 分かったことにされると、逆に置いていかれる感じがある。`;
}

function makeReaction(beat: ConversationBeat) {
  if (beat.eventKind === "emotion") {
    return `${stripInstructionWords(beat.cue)} そこを置いていかれると、たぶん聞いてる側はさみしい。`;
  }

  if (beat.eventKind === "reaction") {
    return `${stripInstructionWords(beat.cue)} 今のところ、私の中ではまだ半分しか納得してない。`;
  }

  return `${stripInstructionWords(beat.cue)} その方向で話すなら、ちゃんと生活の方にも戻してほしい。`;
}

function makeAtmosphere(beat: ConversationBeat, skeleton: ConversationSkeleton) {
  if (skeleton.atmosphere === "rainy") {
    return `${stripInstructionWords(beat.cue)} こういう間があると、雨の音が急に大きく聞こえる。`;
  }

  return `${stripInstructionWords(beat.cue)} ちょっと黙ると、考えが勝手に続く感じがする。`;
}

function makeEventLine(
  beat: ConversationBeat,
  speaker: DraftScriptSpeaker,
  skeleton: ConversationSkeleton,
) {
  const cue = stripInstructionWords(beat.cue);

  if (beat.eventKind === "reality_reference") {
    return `${cue} こういう急な現実って、話をきれいにしすぎないから嫌いじゃない。`;
  }

  if (beat.eventKind === "metaphor") {
    return `${cue} たとえ話って便利なんだけど、今ちょっと自分で回収しに行ってる。`;
  }

  if (beat.eventKind === "accident") {
    if (speaker === "かな") {
      return `${cue} って、ここで一回止めたくなる。きれいに進みすぎると、逆に信用できない。`;
    }

    return `${cue} いや、今の着地は一回撤回しよう。きれいすぎて逆に怪しい。`;
  }

  if (beat.eventKind === "thought_experiment") {
    return `${cue} それくらい小さく仮定すると、${skeleton.theme}の形が少し見える。`;
  }

  if (beat.eventKind === "inside_joke") {
    return `${cue} 知らない人にも邪魔にならない程度の、番組内の小さい記憶として置いておく。`;
  }

  if (beat.eventKind === "detour") {
    return `${cue} でも脱線はここまで。戻らないと、机の上のどうでもいいものまで番組になる。`;
  }

  return `${cue} ここは知識を増やすというより、見え方を少し変える場所にしたい。`;
}

function makeTurn(beat: ConversationBeat) {
  const cue = normalizeCue(beat.cue);

  if (beat.required === false) {
    return "無理に笑いを入れるより、今は少しだけ肩の力を抜くくらいでいいかも。";
  }

  if (cue.includes("調べたく")) {
    return "ちょっと調べたくなるけど、ここで全部開くと授業になるから、一個だけにしよう。";
  }

  if (cue.includes("情報は一つ")) {
    return "情報を一つだけ置くなら、話が濁らない。多すぎると、夜の机が資料で埋まる。";
  }

  if (cue.includes("別の話題") || cue.includes("ずれる")) {
    return "少しだけ話をずらすと、さっきの違和感が別の角度から見えてくる。";
  }

  if (cue.includes("見方")) {
    return "見方を少し変えるだけで、悪いかどうかより、なぜ引っかかるのかが見えてくる。";
  }

  return "こういう横道があるから、話がただの説明で終わらないんだと思う。";
}

function makeClosing(beat: ConversationBeat, skeleton: ConversationSkeleton) {
  const softLanding =
    skeleton.tone === "melancholic"
      ? "少し静かなまま残しておきたい"
      : "決めつけずに置いておきたい";

  return `だから今日は、${skeleton.theme}に正解を出すというより、${softLanding}。`;
}

function lineTextForBeat(
  beat: ConversationBeat,
  speaker: DraftScriptSpeaker,
  skeleton: ConversationSkeleton,
) {
  if (beat.role === "hook") {
    return speaker === "かな"
      ? makeKanaHook(beat, skeleton)
      : makeTartarHook(beat, skeleton);
  }

  if (beat.role === "reception") {
    return makeReception();
  }

  if (beat.role === "analysis") {
    return makeAnalysis(beat, skeleton);
  }

  if (beat.role === "question") {
    return makeQuestion();
  }

  if (beat.role === "reaction") {
    return makeReaction(beat);
  }

  if (beat.role === "atmosphere") {
    return makeAtmosphere(beat, skeleton);
  }

  if (beat.role === "event") {
    return makeEventLine(beat, speaker, skeleton);
  }

  if (beat.role === "turn") {
    return makeTurn(beat);
  }

  if (beat.role === "closing") {
    return makeClosing(beat, skeleton);
  }

  return `${stripInstructionWords(beat.cue)} ここは二人で、急がずに確かめる。`;
}

function expandSpeaker(beat: ConversationBeat): DraftScriptSpeaker[] {
  if (beat.speaker === "かな") {
    return ["かな"];
  }

  if (beat.speaker === "タルタル") {
    return ["タルタル"];
  }

  if (beat.role === "atmosphere") {
    return ["かな", "タルタル"];
  }

  if (beat.role === "closing") {
    return ["タルタル", "かな"];
  }

  return ["タルタル", "かな"];
}

function followUpLine(
  beat: ConversationBeat,
  speaker: DraftScriptSpeaker,
  previousSpeaker: DraftScriptSpeaker,
) {
  if (speaker === previousSpeaker) {
    return null;
  }

  if (speaker === "かな") {
    if (beat.role === "closing") {
      return "うん。答えじゃなくて、今日はそのへんに座らせておく感じでいい。";
    }

    if (beat.eventKind === "reality_reference") {
      return "急に現実。でも、そこを無視するときれいごとになるのも分かる。";
    }

    if (beat.eventKind === "thought_experiment") {
      return "手紙だったら、たぶん玄関まで取りに行くぶんだけ冷静になれそう。";
    }

    if (beat.eventKind === "detour") {
      if (beat.cue.includes("消しゴム")) {
        return "消しゴムの顔って何。でも、話が固くなりすぎるよりはいいか。";
      }

      return "急に横道。でも、ちょっと呼吸できた感じはある。";
    }

    if (beat.role === "turn") {
      return "戻り方が雑だけど、ちょっと肩の力は抜けた。";
    }

    return pick(
      [
        "いや待って、その言い方だとちょっと分かる気がして悔しい。",
        "分かるけど、まだ一回疑っておきたい。",
        "そこ、納得したふりをすると後で引っかかりそう。",
      ],
      `${beat.order}:${beat.cue}`,
    );
  }

  if (beat.role === "atmosphere") {
    return "今の間、たぶん説明より仕事してた。";
  }

  return "そこは分かる。だから一回、こっちの角度から見てみたい。";
}

function beatToLines(
  beat: ConversationBeat,
  skeleton: ConversationSkeleton,
  currentOrder: number,
) {
  const speakers = expandSpeaker(beat);
  const lines: DraftScriptLine[] = [];

  speakers.forEach((speaker, index) => {
    const text =
      index === 0
        ? lineTextForBeat(beat, speaker, skeleton)
        : followUpLine(beat, speaker, speakers[index - 1]);

    if (!text) {
      return;
    }

    lines.push({
      cue: beat.cue,
      order: currentOrder + lines.length,
      speaker,
      sourceBeatOrder: beat.order,
      role: beat.role,
      ...(beat.eventId ? { eventId: beat.eventId } : {}),
      ...(beat.eventKind ? { eventKind: beat.eventKind } : {}),
      text,
    });
  });

  return lines;
}

function ensureKanaIsAlive(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const kanaLines = lines.filter((line) => line.speaker === "かな");
  const ratio = kanaLines.length / Math.max(1, lines.length);

  if (ratio >= 0.3) {
    return lines;
  }

  const insertAfter = Math.max(
    1,
    lines.findIndex((line) => line.role === "analysis") + 1,
  );
  const additionalLine: DraftScriptLine = {
    cue: "かなが相槌だけにならないように、違和感を追加する",
    order: insertAfter + 1,
    role: "reaction",
    sourceBeatOrder: lines[insertAfter - 1]?.sourceBeatOrder ?? 1,
    speaker: "かな",
    text: `ちょっと待って。${skeleton.theme}って、そんなにきれいに整理していい話なの？`,
  };

  return [
    ...lines.slice(0, insertAfter),
    additionalLine,
    ...lines.slice(insertAfter).map((line) => ({
      ...line,
      order: line.order + 1,
    })),
  ];
}

function renumber(lines: DraftScriptLine[]) {
  return lines.map((line, index) => ({
    ...line,
    order: index + 1,
  }));
}

export function generateDraftScript({
  skeleton,
}: GenerateDraftScriptOptions): DraftScript {
  let nextOrder = 1;
  const lines = skeleton.beats.flatMap((beat) => {
    const beatLines = beatToLines(beat, skeleton, nextOrder);
    nextOrder += beatLines.length;

    return beatLines;
  });
  const balancedLines = renumber(ensureKanaIsAlive(lines, skeleton));

  return {
    theme: skeleton.theme,
    structureTemplate: skeleton.structureTemplate,
    atmosphere: skeleton.atmosphere,
    tone: skeleton.tone,
    eventPlan: skeleton.eventPlan,
    lines: balancedLines,
    productionNotes: [
      "This is a deterministic draft, not a final reviewed script.",
      "Keep SHOW_BIBLE above this generator: revise lines if Kana becomes passive or Tartar becomes a lecturer.",
      "Event cues are reflected, but jokes and metaphors should be rewritten when they start to feel fixed.",
    ],
  };
}
