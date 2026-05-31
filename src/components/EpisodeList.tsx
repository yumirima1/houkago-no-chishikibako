import {
  Episode,
  getEpisodeDurationLabel,
  getEpisodeProductionStatusLabel,
  getEpisodeTags,
  getEpisodeType,
  getEpisodeTypeLabel,
  hasPlayableAudio,
} from "@/data/episodes";

type EpisodeListProps = {
  episodes: Episode[];
  onSelectEpisode: (episodeId: string) => void;
  selectedEpisodeId: string;
};

export function EpisodeList({
  episodes,
  onSelectEpisode,
  selectedEpisodeId,
}: EpisodeListProps) {
  return (
    <section aria-labelledby="episode-list-title">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2
          id="episode-list-title"
          className="text-lg font-semibold text-slate-100"
        >
          話を選ぶ
        </h2>
        <span className="text-sm text-slate-400">{episodes.length}本</span>
      </div>

      <div className="grid gap-3">
        {episodes.map((episode) => {
          const isPlayable = hasPlayableAudio(episode);

          return (
            <article
              aria-current={episode.id === selectedEpisodeId}
              className={`rounded-lg border p-4 text-left backdrop-blur-sm transition-colors ${
                episode.id === selectedEpisodeId
                  ? "border-cyan-200/40 bg-cyan-100/10"
                  : "border-white/10 bg-white/[0.055]"
              }`}
              key={episode.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs text-slate-400">
                    {episode.publishedAt} / {episode.duration}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full border border-cyan-100/20 bg-cyan-100/[0.1] px-2.5 py-1 text-xs text-cyan-50">
                      {getEpisodeTypeLabel(getEpisodeType(episode))}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1 text-xs text-slate-300">
                      {getEpisodeDurationLabel(episode)}
                    </span>
                    {!isPlayable ? (
                      <span className="rounded-full border border-amber-100/20 bg-amber-100/[0.1] px-2.5 py-1 text-xs text-amber-100">
                        {getEpisodeProductionStatusLabel(episode.productionStatus)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-1 text-base font-semibold leading-7 text-slate-50">
                    {episode.title}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {getEpisodeTags(episode).map((theme) => (
                    <span
                      className="rounded-full border border-cyan-100/15 bg-cyan-100/10 px-2.5 py-1 text-xs text-cyan-100"
                      key={theme}
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>

              <p className="mt-3 text-sm leading-7 text-slate-300">
                {episode.description}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {episode.speakers.science} / {episode.speakers.humanities}
                </p>
                <button
                  className={`min-h-10 rounded-md border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-200/60 ${
                    isPlayable
                      ? "border-cyan-100/20 bg-cyan-100/[0.14] text-cyan-50 hover:bg-cyan-100/[0.2]"
                      : "cursor-not-allowed border-amber-100/15 bg-amber-100/[0.07] text-amber-100/65"
                  }`}
                  disabled={!isPlayable}
                  onClick={() => onSelectEpisode(episode.id)}
                  type="button"
                >
                  {isPlayable ? "▶ 再生" : "⏳ 準備中"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
