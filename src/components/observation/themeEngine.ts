import {
  ObservationLog,
  SubjectId,
} from "@/components/observation/observationTypes";

export type WindowRarityState =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type WindowRainState = "none" | "light" | "normal" | "heavy";

export type WindowState = {
  id: string;
  label: string;
  rain: WindowRainState;
  rarity: WindowRarityState;
  timeStateLabel: string;
};

export type RoomState = {
  latestLog?: ObservationLog;
  subjectId: SubjectId;
  window: WindowState;
};

export type ObservationThemeCandidate = {
  emotion: string;
  hint: string;
  id: string;
  source: "window-state" | "observation-log";
  theme: string;
  windowStateId: string;
};

export type ObservationEpisodeSeed = {
  atmosphere: string;
  candidateId: string;
  episodeQuestion: string;
  seed: string;
  source: "observation-world";
  subjectId: SubjectId;
};

const windowThemeMap: Record<
  string,
  {
    emotion: string;
    question: string;
    theme: string;
  }
> = {
  dawn: {
    emotion: "始まり",
    question: "人はなぜ区切りを作るのか",
    theme: "朝焼けと始まり",
  },
  "distant-city": {
    emotion: "距離",
    question: "遠くの明かりを見ると、なぜ少しだけ安心するのか",
    theme: "遠くの街明かり",
  },
  dusk: {
    emotion: "切り替わり",
    question: "夕方は、なぜ一日を途中で終わらせる感じがするのか",
    theme: "夕暮れと区切り",
  },
  "hard-rain": {
    emotion: "孤独",
    question: "なぜ雨の日は考え事が増えるのか",
    theme: "強い雨と思考",
  },
  "light-rain": {
    emotion: "保留",
    question: "小雨の時、考えはなぜ結論まで急がなくなるのか",
    theme: "小雨と保留",
  },
  "midnight-rain": {
    emotion: "孤独",
    question: "なぜ雨の日は考え事が増えるのか",
    theme: "雨と孤独",
  },
  "quiet-night": {
    emotion: "記憶",
    question: "検索できる時代に覚える意味はあるのか",
    theme: "静かな夜と記憶",
  },
};

function fallbackWindowTheme(window: WindowState) {
  if (window.rarity === "legendary") {
    return {
      emotion: "違和感",
      question: "世界が少しだけ変に見える夜、なぜ意味を探してしまうのか",
      theme: `${window.label}と違和感`,
    };
  }

  if (window.rain === "heavy" || window.rain === "normal") {
    return {
      emotion: "孤独",
      question: "なぜ雨の日は考え事が増えるのか",
      theme: `${window.label}と思考`,
    };
  }

  if (window.timeStateLabel === "朝") {
    return {
      emotion: "始まり",
      question: "人はなぜ区切りを作るのか",
      theme: `${window.label}と始まり`,
    };
  }

  if (window.timeStateLabel === "深夜") {
    return {
      emotion: "記憶",
      question: "検索できる時代に覚える意味はあるのか",
      theme: `${window.label}と記憶`,
    };
  }

  return {
    emotion: "距離",
    question: "外の景色を見る時、なぜ自分の考えも少し外へ出るのか",
    theme: `${window.label}と距離`,
  };
}

export function createThemeCandidateFromRoomState(
  roomState: RoomState,
): ObservationThemeCandidate {
  const fromLog = roomState.latestLog?.themeCandidate;
  const windowTheme =
    windowThemeMap[roomState.window.id] ?? fallbackWindowTheme(roomState.window);

  return {
    emotion: windowTheme.emotion,
    hint:
      roomState.latestLog?.broadcastHint ??
      `${roomState.window.label}の窓外状態を、${windowTheme.emotion}として放送テーマへ渡す。`,
    id: `${roomState.subjectId}-${roomState.window.id}-${roomState.window.timeStateLabel}`,
    source: fromLog ? "observation-log" : "window-state",
    theme: fromLog ?? windowTheme.theme,
    windowStateId: roomState.window.id,
  };
}

export function createEpisodeSeedFromThemeCandidate({
  candidate,
  roomState,
}: {
  candidate: ObservationThemeCandidate;
  roomState: RoomState;
}): ObservationEpisodeSeed {
  const windowTheme =
    windowThemeMap[roomState.window.id] ?? fallbackWindowTheme(roomState.window);

  return {
    atmosphere: `${roomState.window.timeStateLabel} / ${roomState.window.label} / ${candidate.emotion}`,
    candidateId: candidate.id,
    episodeQuestion: windowTheme.question,
    seed: `${candidate.theme} -> ${candidate.emotion} -> ${windowTheme.question}`,
    source: "observation-world",
    subjectId: roomState.subjectId,
  };
}
