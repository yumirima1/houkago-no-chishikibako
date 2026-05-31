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
};

export const episodes: Episode[] = [
  {
    id: "after-school-001",
    title: "AIは考えているのか、計算しているのか",
    description:
      "理系担当と文系担当が、AIの仕組みと「考える」という言葉の距離を、夜の作業用ラジオの温度で話します。",
    audioUrl: "/audio/sample.mp3",
    publishedAt: "2026-05-31",
    duration: "00:08",
    themes: ["AI", "コンピュータ", "哲学"],
    speakers: {
      science: "理系担当",
      humanities: "文系担当",
    },
  },
];
