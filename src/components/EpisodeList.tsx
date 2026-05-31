import { Episode } from "@/data/episodes";

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
          音声一覧
        </h2>
        <span className="text-sm text-slate-400">{episodes.length}本</span>
      </div>

      <div className="grid gap-3">
        {episodes.map((episode) => (
          <button
            aria-current={episode.id === selectedEpisodeId}
            className={`rounded-lg border p-4 text-left backdrop-blur-sm transition-colors hover:border-cyan-200/30 hover:bg-white/[0.075] focus:outline-none focus:ring-2 focus:ring-cyan-200/60 ${
              episode.id === selectedEpisodeId
                ? "border-cyan-200/40 bg-cyan-100/10"
                : "border-white/10 bg-white/[0.055]"
            }`}
            key={episode.id}
            onClick={() => onSelectEpisode(episode.id)}
            type="button"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs text-slate-400">
                  {episode.publishedAt} / {episode.duration}
                </p>
                <h3 className="mt-1 text-base font-semibold leading-7 text-slate-50">
                  {episode.title}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {episode.themes.map((theme) => (
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
            <p className="mt-3 text-xs text-slate-500">
              {episode.speakers.science} / {episode.speakers.humanities}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
