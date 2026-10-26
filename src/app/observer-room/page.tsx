import { Metadata } from "next";
import { ObserverStudyRoot } from "@/components/observer-room/ObserverStudyRoot";

export const metadata: Metadata = {
  title: "観察者の部屋 | 考察箱",
  description: "夜の街を望む静かな部屋。CRT端末から保存された考察と収集記事を読む。",
};

export default function ObserverRoomPage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <ObserverStudyRoot />
    </main>
  );
}
