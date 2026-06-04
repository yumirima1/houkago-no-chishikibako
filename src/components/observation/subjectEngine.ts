import {
  ObservationLog,
  ObservationSubject,
  Relationship,
  RoomObjectId,
  SubjectAction,
  SubjectId,
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
        description: "小さな端末に、観察ログと観察箱の入口がある。",
        id: "terminal",
        label: "観察端末",
      },
      {
        description: "放課後の知識箱が小さな音量で流れる。",
        id: "crt",
        label: "小さなラジオ",
      },
      {
        description: "よるの相談箱へつながる封筒。今日はまだ閉じている。",
        id: "envelope",
        label: "封筒",
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
        description: "配線の横に置かれた観察ログ端末。観察箱の入口でもある。",
        id: "terminal",
        label: "観察端末",
      },
      {
        description: "放送テーマの断片。まだ原稿ではなく、考えかけのネタ。",
        id: "memo",
        label: "机のメモ",
      },
      {
        description: "よるの相談箱へつながる封筒。タルタルは少し距離を置いている。",
        id: "envelope",
        label: "封筒",
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

const subjectActions: Record<SubjectId, SubjectAction[]> = {
  kana: [
    {
      broadcastSeed: "夜の不安は、なぜ昼より大きく聞こえるのか",
      id: "kana-window",
      label: "窓を見ている",
      logText: "かなが窓の外を見ていた",
      thought: "雨の音って、考えを止めるんじゃなくて、少し遅くするだけかも。",
    },
    {
      broadcastSeed: "通知を待つ時間は、なぜ少しだけ自分を小さくするのか",
      id: "kana-phone",
      label: "通知を気にしている",
      logText: "かながスマホの通知を一度だけ見た",
      thought: "待ってないふりをしてる時ほど、待ってるのが分かるの変だよね。",
    },
    {
      broadcastSeed: "分かったふりは、なぜあとで寂しくなるのか",
      id: "kana-diary",
      label: "日記を書いている",
      logText: "かなが日記に短い疑問を残した",
      thought: "納得してないのに頷くと、自分の部屋から少し外へ出される感じがする。",
    },
  ],
  tartar: [
    {
      broadcastSeed: "なぜ人は通知を開く前に少し緊張するのか",
      id: "tartar-notification",
      label: "通知を見ている",
      logText: "タルタルが通知を見ていた",
      thought: "通知って、情報というより小さい呼び出し音なんだよな。",
    },
    {
      broadcastSeed: "小さなWebサイトは、なぜ秘密基地に似ているのか",
      id: "tartar-crt",
      label: "CRTを調整している",
      logText: "タルタルがCRTの明るさを少し下げた",
      thought: "画面が暗い方が、なぜか考えが自分のものに戻ってくる。",
    },
    {
      broadcastSeed: "失敗した試作品は、なぜ少しだけかわいいのか",
      id: "tartar-memo",
      label: "メモを書いている",
      logText: "タルタルが放送テーマのメモを書いた",
      thought: "作るなら、まず失敗する小さい版から置きたいんだよね。",
    },
  ],
};

export const defaultRelationship: Relationship = {
  dependency: 8,
  friendship: 28,
  trust: 24,
};

export function getSubjectAction(subjectId: SubjectId, date = new Date()) {
  const actions = subjectActions[subjectId];
  const index =
    (date.getHours() + date.getMinutes() + (subjectId === "kana" ? 1 : 0)) %
    actions.length;

  return actions[index];
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

export function createObservationLog({
  action,
  source,
  subjectId,
}: {
  action: SubjectAction;
  source: ObservationLog["source"];
  subjectId: SubjectId;
}): ObservationLog {
  return {
    actionId: action.id,
    id: `${subjectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    subjectId,
    thought: action.thought,
    timestamp: new Date().toISOString(),
  };
}

export function roomObjectAction(
  subjectId: SubjectId,
  objectId: RoomObjectId,
): SubjectAction {
  const subject = observationSubjects[subjectId];
  const object = subject.roomObjects.find((candidate) => candidate.id === objectId);
  const fallback = getSubjectAction(subjectId);

  if (!object) {
    return fallback;
  }

  return {
    broadcastSeed:
      objectId === "memo"
        ? fallback.broadcastSeed
        : `${subject.name}の${object.label}から、夜の放送ネタが生まれるかもしれない`,
    id: `${subjectId}-${objectId}`,
    label: `${object.label}を見る`,
    logText: `${subject.name}の部屋で${object.label}を見た`,
    thought: object.description,
  };
}

