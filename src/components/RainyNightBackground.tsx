export type BackgroundMode = "room" | "desk" | "window";

export const backgroundModeProfiles: Array<{
  id: BackgroundMode;
  label: string;
  tags: string[];
}> = [
  {
    id: "room",
    label: "深夜のPC部屋",
    tags: ["AI", "コンピュータ", "プログラミング", "Web開発", "ローカルAI"],
  },
  {
    id: "desk",
    label: "雨のカフェ",
    tags: ["心理学", "哲学", "相談", "ものづくり"],
  },
  {
    id: "window",
    label: "夜の図書館",
    tags: ["科学", "宇宙", "言語", "物語", "知識ラジオ"],
  },
];

export function getBackgroundModeLabel(mode: BackgroundMode) {
  return (
    backgroundModeProfiles.find((profile) => profile.id === mode)?.label ?? mode
  );
}

export function getBackgroundModeForTags(tags: string[]) {
  return (
    backgroundModeProfiles.find((profile) =>
      profile.tags.some((tag) => tags.includes(tag)),
    )?.id ?? "room"
  );
}

type RainyNightBackgroundProps = {
  className?: string;
  mode: BackgroundMode;
};

export function RainyNightBackground({
  className = "pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050812]",
  mode,
}: RainyNightBackgroundProps) {
  return (
    <div className={className}>
      <div className={`night-scene night-scene-${mode}`} />
      <div className="lofi-vignette" />
      <div className="rainy-lines" />
      <div className="rain-drops" />
      <div className="room-grain" />

      {mode === "room" ? (
        <div className="lofi-scene lofi-pc-room">
          <div className="pc-window">
            <div className="grid h-full grid-cols-2 grid-rows-3 gap-px p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  className="bg-cyan-100/[0.035]"
                  key={index}
                />
              ))}
            </div>
          </div>
          <div className="pc-desk">
            <div className="pc-monitor">
              <span />
              <span />
              <span />
            </div>
            <div className="pc-keyboard" />
            <div className="desk-mug">
              <span className="steam steam-a" />
              <span className="steam steam-b" />
            </div>
          </div>
        </div>
      ) : null}

      {mode === "desk" ? (
        <div className="lofi-scene lofi-cafe">
          <div className="cafe-window">
            <div className="window-light" />
          </div>
          <div className="cafe-counter">
            <div className="cafe-lamp" />
            <div className="cafe-cup">
              <span className="steam steam-a" />
              <span className="steam steam-b" />
            </div>
            <div className="cafe-notebook" />
          </div>
        </div>
      ) : null}

      {mode === "window" ? (
        <div className="lofi-scene lofi-library">
          <div className="library-shelves">
            {Array.from({ length: 24 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="observatory-window">
            <div className="observatory-arc" />
            <div className="window-light" />
          </div>
          <div className="reading-table">
            <div className="table-lamp" />
            <div className="open-book" />
            <div className="desk-mug">
              <span className="steam steam-a" />
              <span className="steam steam-b" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="quiet-eyelid" />
      <div className="night-floor" />
    </div>
  );
}
