import { AudioPlayer } from "@/components/AudioPlayer";
import { Clock } from "@/components/Clock";
import { EpisodeList } from "@/components/EpisodeList";
import { RainyNightBackground } from "@/components/RainyNightBackground";
import { episodes } from "@/data/episodes";

export default function Home() {
  const featuredEpisode = episodes[0];

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-100">
      <RainyNightBackground />

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium tracking-[0.28em] text-slate-300">
            放課後の知識箱
          </p>
          <p className="hidden text-sm text-slate-500 sm:block">
            After school knowledge radio
          </p>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div className="max-w-2xl">
            <p className="mb-5 text-sm tracking-[0.28em] text-cyan-100/70">
              RAINY NIGHT / LO-FI AUDIO
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-slate-50 sm:text-6xl">
              放課後の知識箱
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              作業中や寝る前に聞ける、静かな知的ラジオ。理系担当と文系担当が、AI、科学、哲学、言語、宇宙の話をゆっくりほどきます。
            </p>

            <div className="mt-8 grid max-w-xl gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="border-l border-cyan-100/20 pl-4">
                2-20分
                <span className="mt-1 block text-slate-500">短めの会話</span>
              </div>
              <div className="border-l border-cyan-100/20 pl-4">
                AI音声
                <span className="mt-1 block text-slate-500">差し替え可能</span>
              </div>
              <div className="border-l border-cyan-100/20 pl-4">
                DBなし
                <span className="mt-1 block text-slate-500">公開優先</span>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 backdrop-blur-md">
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-slate-500">
                Tokyo time
              </p>
              <Clock />
            </div>
            <AudioPlayer episode={featuredEpisode} />
          </div>
        </section>

        <div className="pb-14">
          <EpisodeList episodes={episodes} />
        </div>
      </div>
    </main>
  );
}
