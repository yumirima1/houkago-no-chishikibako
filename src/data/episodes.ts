export type Episode = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  publishedAt: string;
  duration: string;
  themes: string[];
  speakers: {
    science: string;
    humanities: string;
  };
  productionStatus: "published" | "draft" | "reviewing";
};

export const episodes: Episode[] = [
  {
    id: "after-school-001",
    title: "AIは考えているのか、計算しているのか",
    description:
      "理系担当と文系担当が、AIの仕組みと「考える」という言葉の距離を、夜の作業用ラジオの温度で話します。",
    audioUrl: "/audio/sample.mp3",
    publishedAt: "2026-05-31",
    duration: "00:40",
    themes: ["AI", "コンピュータ", "哲学"],
    speakers: {
      science: "理系担当",
      humanities: "文系担当",
    },
    productionStatus: "published",
  },
  {
    id: "after-school-002",
    title: "人はなぜ陰謀論を信じるのか",
    description:
      "認知バイアスと物語の力を入り口に、不安な時代に人が納得を探す仕組みを会話でたどります。",
    audioUrl: "/audio/sample.mp3",
    publishedAt: "2026-06-01",
    duration: "00:40",
    themes: ["心理学", "哲学", "社会"],
    speakers: {
      science: "理系担当",
      humanities: "文系担当",
    },
    productionStatus: "published",
  },
  {
    id: "after-school-003",
    title: "量子コンピュータとは何か",
    description:
      "普通のコンピュータとの違いから、量子ビット、重ね合わせ、未来の使い道までを静かに整理します。",
    audioUrl: "/audio/sample.mp3",
    publishedAt: "2026-06-02",
    duration: "00:40",
    themes: ["科学", "コンピュータ", "技術ニュース"],
    speakers: {
      science: "理系担当",
      humanities: "文系担当",
    },
    productionStatus: "published",
  },
];
