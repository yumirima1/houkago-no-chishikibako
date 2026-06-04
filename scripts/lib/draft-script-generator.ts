import {
  ConversationBeat,
  ConversationEventKind,
  ConversationSkeleton,
  ConversationTemperature,
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
  conversationTemperature: ConversationSkeleton["conversationTemperature"];
  temperaturePlan: ConversationSkeleton["temperaturePlan"];
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

type TurnDraft = {
  speaker: DraftScriptSpeaker;
  text: string;
};

const defaultTemperaturePlan: ConversationSkeleton["temperaturePlan"] = {
  closing: "soft",
  detour: "medium",
  emotion: "medium",
  explanation: "medium",
  humor: "medium",
  silence: "medium",
};

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
    .replace(/考える$/g, "考えてみる。")
    .replace(/差し込む/g, "置いてみる。");
}

function temperatureOf(skeleton: ConversationSkeleton): ConversationTemperature {
  return skeleton.conversationTemperature ?? "normal";
}

function temperaturePlanOf(skeleton: ConversationSkeleton) {
  return skeleton.temperaturePlan ?? defaultTemperaturePlan;
}

function everydayExample(theme: string) {
  if (theme.includes("通知") || theme.includes("既読")) {
    return "スマホを伏せたのに、画面の光だけ気にしてる時間";
  }

  if (theme.includes("ニュース")) {
    return "見なきゃと思って開いた記事で、かえって眠れなくなる夜";
  }

  if (theme.includes("検索履歴")) {
    return "検索欄だけが、自分より正直に焦っている感じ";
  }

  if (theme.includes("充電")) {
    return "残り1%の表示を見てから急に現実になる感じ";
  }

  if (theme.includes("コンビニ")) {
    return "深夜の白い明かりだけが、外の時間から浮いている感じ";
  }

  if (theme.includes("バグ")) {
    return "寝る直前にだけ、エラーの行番号が急に人懐っこくなる感じ";
  }

  if (theme.includes("お金") || theme.includes("マネタイズ")) {
    return "好きなものに値段がついた瞬間、応援と寂しさが同時に来る感じ";
  }

  if (theme.includes("記憶") || theme.includes("思い出")) {
    return "忘れたつもりの場面だけ、布団に入ってから戻ってくる感じ";
  }

  if (theme.includes("AI")) {
    return "入力欄に言葉を置いたあと、返事を待ってしまう感じ";
  }

  return "昼間なら流せるのに、夜だけ少し大きく見える感じ";
}

function nightTexture(skeleton: ConversationSkeleton, seed: string) {
  const common = [
    "窓の外だけ、少し雨が強くなった気がする。",
    "モニターの明かりで、机の端だけぼんやり見えてる。",
    "時計を見たら、さっきより深夜になってた。",
    "コーヒーが冷めたのに、まだ少し匂いだけ残ってる。",
  ];
  const quiet = [
    "今の間、雨の音が返事みたいに聞こえた。",
    "言葉を急がない方が、部屋の音が戻ってくる。",
    "少し黙ると、画面の明るさだけが残るね。",
  ];
  const funny = [
    "机の上のケーブルまで、今の話に巻き込まれた顔してる。",
    "こういう時だけ、消しゴムが妙に冷静に見える。",
    "モニターの端っこが、今の例えを聞かなかったことにしてる。",
  ];

  if (temperatureOf(skeleton) === "quiet" || temperatureOf(skeleton) === "deep") {
    return pick([...quiet, ...common], seed);
  }

  if (temperatureOf(skeleton) === "funny") {
    return pick([...funny, ...common], seed);
  }

  return pick(common, seed);
}

function makeHook(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  const theme = skeleton.theme;
  const texture = everydayExample(theme);

  if (temperatureOf(skeleton) === "funny") {
    return [
      {
        speaker: "かな",
        text: `ねえ、${texture}って、ちょっと人間の負け方として味があるよね。`,
      },
      {
        speaker: "タルタル",
        text: "負け方から始まる回、だいぶ深夜っぽいな。でもその観察は嫌いじゃない。",
      },
      {
        speaker: "かな",
        text: "褒められてるのか分からないけど、今日はそこから開けてみたい。",
      },
    ];
  }

  if (temperatureOf(skeleton) === "quiet") {
    return [
      {
        speaker: "かな",
        text: `${texture}って、便利とか怖いとかの前に、少し黙りたくなる。`,
      },
      {
        speaker: "タルタル",
        text: "分かる。急いで名前をつけると、そこで感じてたものが少し薄くなる。",
      },
      {
        speaker: "かな",
        text: "うん。だから今日は、すぐ結論にしないで見たい。",
      },
    ];
  }

  return [
    {
      speaker: "かな",
      text: `${texture}って、なんでこんなに引っかかるんだろう。`,
    },
    {
      speaker: "タルタル",
      text: pick(
        [
          "その引っかかり、雑に片づけない方が面白いと思う。",
          "いい入口だね。たぶん知識より先に、暮らしの感覚がある。",
          "そこから入ると、テーマが急に人間のサイズになるね。",
        ],
        `${beat.cue}:${theme}`,
      ),
    },
    {
      speaker: "かな",
      text: "じゃあ今日は、その人間のサイズのまま話そう。",
    },
  ];
}

function makeReception(skeleton: ConversationSkeleton): TurnDraft[] {
  return [
    {
      speaker: "かな",
      text: pick(
        [
          "でも、分かったことにして進むのはちょっと違う気がする。",
          "そこ、便利な説明で包むと見えなくなる部分ありそう。",
          "聞いてる人の生活に戻すと、たぶんまだ変なところが残るよね。",
        ],
        `${skeleton.theme}:reception:kana`,
      ),
    },
    {
      speaker: "タルタル",
      text: pick(
        [
          "たしかに。先に受け止めないと、ただの整理整頓になる。",
          "そこは一回止まろう。急いで説明すると、夜の番組じゃなくなる。",
          "分かる。こっちが理屈で楽をしすぎる場面だね。",
        ],
        `${skeleton.theme}:reception:tartar`,
      ),
    },
  ];
}

function makeAnalysis(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  const theme = skeleton.theme;
  const plan = temperaturePlanOf(skeleton);
  const shortAnalysis =
    plan.explanation === "low"
      ? `一つだけ言うと、${theme}は気持ちの問題だけじゃなくて、入口の近さにも左右される。`
      : `${theme}は、気持ち、仕組み、場の空気が重なって起きていると思う。`;

  return [
    {
      speaker: "タルタル",
      text: shortAnalysis,
    },
    {
      speaker: "かな",
      text: pick(
        [
          "入口の近さって、ちょっと嫌な言い方だけど分かる。近いものほど開いちゃう。",
          "場の空気まで入るなら、ちゃんと部屋の話として聞けそう。",
          "それなら、悪い癖ってだけで片づけなくてよさそうだね。",
        ],
        `${beat.order}:${theme}:analysis-kana`,
      ),
    },
    {
      speaker: "タルタル",
      text: pick(
        [
          "そう。責めるより、どういう配置でそうなるのかを見る方が優しい。",
          "うん。人間を弱いって切るより、弱くなる条件を見たい。",
          "そのくらいの距離なら、話が説教にならずに済む。",
        ],
        `${beat.cue}:${theme}:analysis-tartar`,
      ),
    },
  ];
}

function makeQuestion(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  const theme = skeleton.theme;

  return [
    {
      speaker: "かな",
      text: pick(
        [
          `待って。${theme}って、ほんとに便利さだけの話なの？`,
          "それ、本当にみんな同じ理由で動いてるのかな。",
          "でもさ、分かっててもやめられない部分はどう扱うの？",
          "その説明だと、少しだけ人間がきれいに整いすぎてる気がする。",
        ],
        `${beat.order}:${beat.cue}:question`,
      ),
    },
    {
      speaker: "タルタル",
      text: pick(
        [
          "そこは疑っていい。むしろ疑ったところから会話になる。",
          "うん、同じ理由にまとめると雑になる。たぶん夜ごとに違う。",
          "その引っかかりは大事。仕組みの話だけだと落とす部分だと思う。",
        ],
        `${theme}:${beat.order}:question-reply`,
      ),
    },
  ];
}

function makeReaction(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  const cue = stripInstructionWords(beat.cue);

  return [
    {
      speaker: "かな",
      text:
        beat.eventKind === "emotion"
          ? `${cue} そこを軽く扱うと、聞いてる側は少し寂しいかも。`
          : pick(
              [
                "なんか少し怖いね。便利なのに、自分の癖まで見られてる感じがする。",
                "それ、分かるけど一回反対側から見たい。",
                "今の話、好きだけど油断するときれいごとになりそう。",
              ],
              `${beat.order}:${cue}:reaction`,
            ),
    },
    {
      speaker: "タルタル",
      text: pick(
        [
          "その怖さは自然だと思う。怖いからこそ、ゆっくり見た方がいい。",
          "分かる。ここで急に正しさへ逃げると、会話が痩せる。",
          "いい止め方だね。じゃあ少しだけ角度を変えよう。",
        ],
        `${skeleton.theme}:${beat.order}:reaction-reply`,
      ),
    },
  ];
}

function makeAtmosphere(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  return [
    {
      speaker: "かな",
      text: nightTexture(skeleton, `${beat.order}:${beat.cue}:kana`),
    },
    {
      speaker: "タルタル",
      text: pick(
        [
          "今の間、説明よりちゃんと仕事してたね。",
          "こういう沈黙があると、話が急に自分の部屋に戻ってくる。",
          "うん。急がない方が、このテーマには合ってる。",
        ],
        `${beat.order}:${skeleton.theme}:atmosphere`,
      ),
    },
  ];
}

function makeEventLine(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  const cue = stripInstructionWords(beat.cue);
  const theme = skeleton.theme;

  if (beat.eventKind === "detour") {
    return [
      {
        speaker: "タルタル",
        text: pick(
          [
            `ちょっと横道だけど、${cue}`,
            `今の話、机の上の小物で考えると少し分かりやすい。${cue}`,
            `一回だけ変な例えを置くね。${cue}`,
          ],
          `${beat.order}:${cue}:detour-tartar`,
        ),
      },
      {
        speaker: "かな",
        text: pick(
          [
            "急に横道。でも今のは少し呼吸できた。",
            "その例え、変だけど忘れにくいのが悔しい。",
            "戻り道だけちゃんと用意してね。迷子になるから。",
          ],
          `${theme}:${beat.order}:detour-kana`,
        ),
      },
    ];
  }

  if (beat.eventKind === "accident") {
    return [
      {
        speaker: "タルタル",
        text: `${cue} いや、今の言い方は少し整いすぎた。撤回していい？`,
      },
      {
        speaker: "かな",
        text: "撤回できる番組でよかった。きれいすぎる話、ちょっと信用できないから。",
      },
    ];
  }

  if (beat.eventKind === "reality_reference") {
    return [
      {
        speaker: "タルタル",
        text: `${cue} こういう現実の話を入れると、急に部屋の温度が戻る。`,
      },
      {
        speaker: "かな",
        text: "うん。現実は冷たいけど、無視すると話がふわふわしすぎる。",
      },
    ];
  }

  if (beat.eventKind === "metaphor") {
    return [
      {
        speaker: "タルタル",
        text: `${cue} 例えとしては少し斜めだけど、今はその斜めさが助かる。`,
      },
      {
        speaker: "かな",
        text: "斜めの例えって言い方、すでに斜めだよ。でも続けて。",
      },
    ];
  }

  if (beat.eventKind === "thought_experiment") {
    return [
      {
        speaker: "タルタル",
        text: `${cue} そのくらい小さく仮定すると、${theme}が少し手に持てる。`,
      },
      {
        speaker: "かな",
        text: "手に持てるくらいなら考えられるね。巨大な答えにされると困るけど。",
      },
    ];
  }

  return [
    {
      speaker: "タルタル",
      text: `${cue} ここは知識の量より、見え方が少し変わるかを見たい。`,
    },
    {
      speaker: "かな",
      text: "見え方が変わるなら聞きたい。答えを配られるだけなら、たぶん眠くなる。",
    },
  ];
}

function makeTurn(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  const theme = skeleton.theme;

  if (temperatureOf(skeleton) === "funny" || beat.eventKind === "detour") {
    return [
      {
        speaker: "タルタル",
        text: pick(
          [
            "ここで一回、話を小さい机まで戻そう。",
            "このままだと理屈が廊下まで伸びるから、少し切ろう。",
            "今の説明、靴ひもみたいにほどけてきた。結び直す。",
          ],
          `${beat.order}:${theme}:funny-turn`,
        ),
      },
      {
        speaker: "かな",
        text: pick(
          [
            "靴ひもで説明する番組だったっけ。でも分かる。",
            "廊下まで伸びた理屈、踏むと危ないからね。",
            "小さい机に戻るのはいい。大きい結論より安心する。",
          ],
          `${beat.order}:${theme}:funny-turn-kana`,
        ),
      },
    ];
  }

  return [
    {
      speaker: "かな",
      text: pick(
        [
          "じゃあ、その見方を生活の方に戻すとどうなる？",
          "ここまで聞いて、少しだけ自分の話に見えてきた。",
          "まだ決めたくないけど、入口は見えてきた気がする。",
        ],
        `${beat.order}:${theme}:turn-kana`,
      ),
    },
    {
      speaker: "タルタル",
      text: pick(
        [
          "生活に戻すと、急に判断じゃなくて付き合い方の話になる。",
          "そのくらいの距離がいいね。近すぎると説教になる。",
          "うん。今夜は入口が見えたくらいで十分だと思う。",
        ],
        `${beat.order}:${theme}:turn-tartar`,
      ),
    },
  ];
}

function makeClosing(beat: ConversationBeat, skeleton: ConversationSkeleton): TurnDraft[] {
  const closing = temperaturePlanOf(skeleton).closing;
  const theme = skeleton.theme;

  if (closing === "light") {
    return [
      {
        speaker: "タルタル",
        text: `${theme}は、今日のところは机の端に置いておこう。落とすとまた話が長くなる。`,
      },
      {
        speaker: "かな",
        text: "落としたら拾うけど、今夜はそのままでいい。少し笑って終われるし。",
      },
    ];
  }

  if (closing === "open") {
    return [
      {
        speaker: "タルタル",
        text: `${theme}に答えを出すより、どこで自分が立ち止まったかを覚えておきたい。`,
      },
      {
        speaker: "かな",
        text: "うん。答えより、立ち止まった場所の方があとで残ることある。",
      },
      {
        speaker: "タルタル",
        text: nightTexture(skeleton, `${beat.order}:${theme}:closing`),
      },
    ];
  }

  return [
    {
      speaker: "タルタル",
      text: `${theme}は、白黒を急がずに、今夜の問いとして少し残しておきたい。`,
    },
    {
      speaker: "かな",
      text: "うん。残しておくくらいが、たぶんこの時間にはちょうどいい。",
    },
  ];
}

function lineTextForBeat(
  beat: ConversationBeat,
  skeleton: ConversationSkeleton,
): TurnDraft[] {
  if (beat.role === "hook") {
    return makeHook(beat, skeleton);
  }

  if (beat.role === "reception") {
    return makeReception(skeleton);
  }

  if (beat.role === "analysis") {
    return makeAnalysis(beat, skeleton);
  }

  if (beat.role === "question") {
    return makeQuestion(beat, skeleton);
  }

  if (beat.role === "reaction") {
    return makeReaction(beat, skeleton);
  }

  if (beat.role === "atmosphere") {
    return makeAtmosphere(beat, skeleton);
  }

  if (beat.role === "event") {
    return makeEventLine(beat, skeleton);
  }

  if (beat.role === "turn") {
    return makeTurn(beat, skeleton);
  }

  if (beat.role === "closing") {
    return makeClosing(beat, skeleton);
  }

  return makeTurn(beat, skeleton);
}

function bridgeFor(
  beat: ConversationBeat,
  speaker: DraftScriptSpeaker,
  skeleton: ConversationSkeleton,
): DraftScriptLine {
  return {
    cue: beat.cue,
    order: 0,
    role: beat.role,
    sourceBeatOrder: beat.order,
    speaker,
    text:
      speaker === "かな"
        ? pick(
            [
              "ちょっと待って、その前に一回だけ生活の方から見たい。",
              "今の流れ、分かるけど少しだけ止めたい。",
              "そのまま進むときれいすぎるから、一回疑っておくね。",
            ],
            `${beat.order}:${skeleton.theme}:bridge-kana`,
          )
        : pick(
            [
              "そこは分かる。じゃあ短く別の角度を置くね。",
              "うん、一回受け止めてから進もう。",
              "たしかに。ここは急がない方がいい。",
            ],
            `${beat.order}:${skeleton.theme}:bridge-tartar`,
          ),
    ...(beat.eventId ? { eventId: beat.eventId } : {}),
    ...(beat.eventKind ? { eventKind: beat.eventKind } : {}),
  };
}

function beatToLines(
  beat: ConversationBeat,
  skeleton: ConversationSkeleton,
  previousSpeaker: DraftScriptSpeaker | undefined,
) {
  const turnDrafts = lineTextForBeat(beat, skeleton);
  const lines: DraftScriptLine[] = [];

  for (const turn of turnDrafts) {
    if (previousSpeaker === turn.speaker && lines.length === 0) {
      const bridgeSpeaker: DraftScriptSpeaker =
        turn.speaker === "かな" ? "タルタル" : "かな";

      lines.push(bridgeFor(beat, bridgeSpeaker, skeleton));
      previousSpeaker = bridgeSpeaker;
    }

    if (previousSpeaker === turn.speaker) {
      continue;
    }

    lines.push({
      cue: beat.cue,
      order: 0,
      speaker: turn.speaker,
      sourceBeatOrder: beat.order,
      role: beat.role,
      ...(beat.eventId ? { eventId: beat.eventId } : {}),
      ...(beat.eventKind ? { eventKind: beat.eventKind } : {}),
      text: turn.text,
    });
    previousSpeaker = turn.speaker;
  }

  return lines;
}

function countSpeakerChars(lines: DraftScriptLine[], speaker: DraftScriptSpeaker) {
  return lines
    .filter((line) => line.speaker === speaker)
    .reduce((total, line) => total + line.text.length, 0);
}

function ensureKanaIsAlive(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const kanaChars = countSpeakerChars(lines, "かな");
  const totalChars = kanaChars + countSpeakerChars(lines, "タルタル");
  const ratio = kanaChars / Math.max(1, totalChars);

  if (ratio >= 0.3 && ratio <= 0.48) {
    return lines;
  }

  const insertAfter = Math.max(
    1,
    lines.findIndex((line) => line.role === "analysis") + 1,
  );
  const previous = lines[insertAfter - 1];
  const additionalSpeaker: DraftScriptSpeaker =
    previous?.speaker === "かな" ? "タルタル" : "かな";
  const additionalLine: DraftScriptLine = {
    cue: "会話バランスを戻す",
    order: 0,
    role: "reaction",
    sourceBeatOrder: previous?.sourceBeatOrder ?? 1,
    speaker: additionalSpeaker,
    text:
      additionalSpeaker === "かな"
        ? pick(
            [
              "それなら少し分かる。でも、自分の生活で起きたらまだ迷うと思う。",
              "今のは納得しそうになった。だからこそ、一回疑っておきたい。",
              "説明は分かった。でも気持ちは少し遅れてついてくるね。",
            ],
            `${skeleton.theme}:balance-kana`,
          )
        : pick(
            [
              "そこは分かる。じゃあ結論じゃなくて、条件だけ短く置こう。",
              "うん、その迷いを残したまま進めた方がいい。",
              "いい止め方だね。話が人間の方へ戻ってきた。",
            ],
            `${skeleton.theme}:balance-tartar`,
          ),
  };

  return [
    ...lines.slice(0, insertAfter),
    additionalLine,
    ...lines.slice(insertAfter),
  ];
}

function ensureNightAir(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const nightPattern = /夜|深夜|寝る前|眠れない|雨|窓|机|コーヒー|布団|静か|明かり|モニター|時計/;
  const nightLines = lines.filter((line) => nightPattern.test(line.text));

  if (nightLines.length >= 3) {
    return lines;
  }

  const insertAfter = Math.min(3, Math.max(1, lines.length - 1));
  const previous = lines[insertAfter - 1];
  const speaker: DraftScriptSpeaker = previous?.speaker === "かな" ? "タルタル" : "かな";
  const atmosphereLine: DraftScriptLine = {
    cue: "深夜の放送室の気配を足す",
    order: 0,
    role: "atmosphere",
    sourceBeatOrder: previous?.sourceBeatOrder ?? 1,
    speaker,
    text:
      speaker === "かな"
        ? nightTexture(skeleton, `${skeleton.theme}:night-kana`)
        : "今の間で、話が少し放送室に戻ってきたね。",
  };

  return [
    ...lines.slice(0, insertAfter),
    atmosphereLine,
    ...lines.slice(insertAfter),
  ];
}

function ensureQuestionPulse(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const questionLines = lines.filter((line) => /[？?]/.test(line.text));
  const desiredQuestionCount =
    temperatureOf(skeleton) === "deep" || temperatureOf(skeleton) === "quiet"
      ? 3
      : 2;

  if (questionLines.length >= desiredQuestionCount) {
    return lines;
  }

  const insertAfter = Math.max(
    2,
    lines.findIndex((line) => line.role === "analysis") + 1,
  );
  const result = [...lines];
  const missingQuestionCount = desiredQuestionCount - questionLines.length;

  for (let offset = 0; offset < missingQuestionCount; offset += 1) {
    const previous = result[insertAfter + offset - 1];
    const speaker: DraftScriptSpeaker =
      previous?.speaker === "かな" ? "タルタル" : "かな";
    const questionLine: DraftScriptLine = {
      cue: "問いを一つ増やす",
      order: 0,
      role: "question",
      sourceBeatOrder: previous?.sourceBeatOrder ?? 1,
      speaker,
      text:
        speaker === "かな"
          ? pick(
              [
                "それって、聞いてる人が自分の話として困るところじゃない？",
                "でも、その見方だけで本当に足りるのかな？",
                "ここで一回、逆から疑ってもいい？",
                "それ、寝る前に考えたら余計に分からなくならない？",
              ],
              `${skeleton.theme}:question-pulse-kana:${offset}`,
            )
          : pick(
              [
                "じゃあ逆に、どこまでなら自分で選んでいると言えるんだろう？",
                "ここで問いを小さくすると、何が残るんだろう？",
                "その迷いを残すなら、次に見るべき場所はどこだろう？",
                "答えを急がないなら、何を手元に置いておけばいいんだろう？",
              ],
              `${skeleton.theme}:question-pulse-tartar:${offset}`,
            ),
    };

    result.splice(insertAfter + offset, 0, questionLine);
  }

  return result;
}

function ensureEmotionPulse(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const emotionPattern =
    /怖|不安|困る|嫌|しんど|寂し|さみし|悔しい|好き|助かる|落ち着|疲れ|モヤモヤ|違和感|変じゃない|置いていか|眠れない|気になる|焦って|迷う/;
  const emotionalLines = lines.filter((line) => emotionPattern.test(line.text));

  if (emotionalLines.length >= 4) {
    return lines;
  }

  const insertAfter = Math.min(6, Math.max(2, lines.length - 2));
  const previous = lines[insertAfter - 1];
  const speaker: DraftScriptSpeaker = previous?.speaker === "かな" ? "タルタル" : "かな";
  const emotionLine: DraftScriptLine = {
    cue: "感情の手触りを足す",
    order: 0,
    role: "reaction",
    sourceBeatOrder: previous?.sourceBeatOrder ?? 1,
    speaker,
    text:
      speaker === "かな"
        ? pick(
            [
              "便利なのは分かるのに、少し困る気持ちが残るんだよね。",
              "それ、好きな部分もあるから余計に迷う。",
              "なんか怖いというより、置き場所が分からなくて落ち着かない。",
            ],
            `${skeleton.theme}:emotion-pulse-kana`,
          )
        : pick(
            [
              "その迷いは自然だと思う。便利なものほど、気持ちの置き場所が難しい。",
              "分かる。好きと不安が同じ机に乗ると、判断が急に遅くなる。",
              "そこは無理に片づけなくていい。困る感じも、この回の材料になる。",
            ],
            `${skeleton.theme}:emotion-pulse-tartar`,
          ),
  };

  return [
    ...lines.slice(0, insertAfter),
    emotionLine,
    ...lines.slice(insertAfter),
  ];
}

function ensureConversationRoom(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const desiredLineCount =
    temperatureOf(skeleton) === "quiet" || temperatureOf(skeleton) === "deep"
      ? 34
      : 32;

  if (lines.length >= desiredLineCount) {
    return lines;
  }

  const result = [...lines];
  const closingIndex = Math.max(
    1,
    result.findIndex((line) => line.role === "closing"),
  );
  let insertIndex = closingIndex > 0 ? closingIndex : Math.max(1, result.length - 1);

  while (result.length < desiredLineCount) {
    const previous = result[insertIndex - 1];
    const firstSpeaker: DraftScriptSpeaker =
      previous?.speaker === "かな" ? "タルタル" : "かな";
    const secondSpeaker: DraftScriptSpeaker =
      firstSpeaker === "かな" ? "タルタル" : "かな";
    const sourceBeatOrder = previous?.sourceBeatOrder ?? 1;

    result.splice(
      insertIndex,
      0,
      {
        cue: "短い往復で放送室に戻す",
        order: 0,
        role: "reaction",
        sourceBeatOrder,
        speaker: firstSpeaker,
        text:
          firstSpeaker === "かな"
            ? pick(
                [
                  "今の話、ちょっと机の上に置いたままにしたい。",
                  "そこ、すぐ結論にすると夜の感じが消えそう。",
                  "分かりかけてるけど、まだ窓の外を見ていたい感じがある。",
                ],
                `${insertIndex}:${skeleton.theme}:room-kana`,
              )
            : pick(
                [
                  "うん。じゃあ説明を閉じずに、部屋の中へ一回戻そう。",
                  "たしかに。今のは答えより、置き場所を探す話だね。",
                  "分かる。ここで急ぐと、会話が資料みたいになる。",
                ],
                `${insertIndex}:${skeleton.theme}:room-tartar`,
              ),
      },
      {
        cue: "短い往復で放送室に戻す",
        order: 0,
        role: "atmosphere",
        sourceBeatOrder,
        speaker: secondSpeaker,
        text:
          secondSpeaker === "かな"
            ? pick(
                [
                  "じゃあ今は、雨の音が少し勝ってるくらいでいいか。",
                  "それなら、聞いてる人も置いていかれにくい気がする。",
                  "うん、放送室の時計くらいの速さで進もう。",
                ],
                `${insertIndex}:${skeleton.theme}:room-kana-follow`,
              )
            : pick(
                [
                  "そのくらいがいい。深夜の話は、少し遅れて届く方が残る。",
                  "うん。分かったふりより、分からなさを丁寧に置く方がいい。",
                  "じゃあそのまま、次の角度だけ小さく見る。",
                ],
                `${insertIndex}:${skeleton.theme}:room-tartar-follow`,
              ),
      },
    );

    insertIndex += 2;
  }

  return result;
}

function ensureAlternating(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const result: DraftScriptLine[] = [];

  for (const line of lines) {
    const previous = result.at(-1);

    if (previous?.speaker === line.speaker) {
      const speaker: DraftScriptSpeaker =
        line.speaker === "かな" ? "タルタル" : "かな";

      result.push({
        cue: line.cue,
        order: 0,
        role: line.role,
        sourceBeatOrder: line.sourceBeatOrder,
        speaker,
        text:
          speaker === "かな"
            ? pick(
                [
                  "ちょっと待って。そこは一回、自分の生活に戻して聞きたい。",
                  "うん、でもそのまま進むと少しきれいすぎる気がする。",
                  "分かるけど、聞いてる側の迷いも残しておきたい。",
                ],
                `${line.order}:${skeleton.theme}:alternate-kana`,
              )
            : pick(
                [
                  "たしかに。じゃあ急がず、短く受け止めてから進もう。",
                  "分かる。その迷いを消さないまま、少しだけ理屈を置くね。",
                  "そこは大事だね。会話が一回、人間の方へ戻った。",
                ],
                `${line.order}:${skeleton.theme}:alternate-tartar`,
              ),
        ...(line.eventId ? { eventId: line.eventId } : {}),
        ...(line.eventKind ? { eventKind: line.eventKind } : {}),
      });
    }

    result.push(line);
  }

  return result;
}

function ensureSpeakerBalance(lines: DraftScriptLine[], skeleton: ConversationSkeleton) {
  const kanaChars = countSpeakerChars(lines, "かな");
  const tartarChars = countSpeakerChars(lines, "タルタル");
  const totalChars = kanaChars + tartarChars;
  const kanaRatio = kanaChars / Math.max(1, totalChars);

  if (kanaRatio <= 0.44 && kanaRatio >= 0.32) {
    return lines;
  }

  const speakerToAdd: DraftScriptSpeaker = kanaRatio > 0.46 ? "タルタル" : "かな";

  if (speakerToAdd === "タルタル") {
    let expandedCount = 0;

    return lines.map((line, index) => {
      if (line.speaker !== "タルタル" || line.text.length > 110 || expandedCount >= 8) {
        return line;
      }

      expandedCount += 1;

      return {
        ...line,
        text: `${line.text} ${pick(
          [
            "ただ、ここは結論よりも、手元の感覚を残した方がいい。",
            "机の上に置けるくらいの小さい条件として見たい。",
            "説明で押し切るより、かなの止まり方を材料にしたい。",
            "だから急がず、今の違和感を少し部屋に置いておく。",
          ],
          `${index}:${skeleton.theme}:balance-tartar-expand`,
        )}`,
      };
    });
  }

  const result = [...lines];
  const maxInsertions = 4;
  let insertions = 0;

  for (let index = 1; index < result.length - 1 && insertions < maxInsertions; index += 2) {
    const current = result[index];

    if (!current || current.speaker === speakerToAdd) {
      continue;
    }

    result.splice(index + 1, 0, {
      cue: "会話の文字バランスを整える",
      order: 0,
      role: "reaction",
      sourceBeatOrder: current.sourceBeatOrder,
      speaker: "かな",
      text: pick(
        [
          "それなら少し分かる。でも、自分の生活で起きたらまだ迷うと思う。",
          "今のは納得しそうになった。だからこそ、一回疑っておきたい。",
          "説明は分かった。でも気持ちは少し遅れてついてくるね。",
        ],
        `${index}:${skeleton.theme}:balance-kana-extra`,
      ),
    });
    insertions += 1;
  }

  return result;
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
  let previousSpeaker: DraftScriptSpeaker | undefined;
  const lines = skeleton.beats.flatMap((beat) => {
    const beatLines = beatToLines(beat, skeleton, previousSpeaker);
    previousSpeaker = beatLines.at(-1)?.speaker ?? previousSpeaker;

    return beatLines;
  });
  const balancedLines = renumber(
    ensureAlternating(
      ensureSpeakerBalance(
        ensureConversationRoom(
          ensureEmotionPulse(
            ensureQuestionPulse(
              ensureNightAir(ensureKanaIsAlive(lines, skeleton), skeleton),
              skeleton,
            ),
            skeleton,
          ),
          skeleton,
        ),
        skeleton,
      ),
      skeleton,
    ),
  );

  return {
    theme: skeleton.theme,
    structureTemplate: skeleton.structureTemplate,
    conversationTemperature: temperatureOf(skeleton),
    temperaturePlan: temperaturePlanOf(skeleton),
    atmosphere: skeleton.atmosphere,
    tone: skeleton.tone,
    eventPlan: skeleton.eventPlan,
    lines: balancedLines,
    productionNotes: [
      "This is a deterministic draft, not a final reviewed script.",
      "Conversation Temperature controls explanation, emotion, humor, detour, silence, and closing style.",
      "Keep SHOW_BIBLE above this generator: revise lines if Kana becomes passive or Tartar becomes a lecturer.",
      "Event cues are reflected, but jokes and metaphors should be rewritten when they start to feel fixed.",
    ],
  };
}
