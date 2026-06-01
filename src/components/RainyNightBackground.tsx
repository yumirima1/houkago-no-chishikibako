export type BackgroundMode = "room" | "desk" | "window";

export const backgroundModeProfiles: Array<{
  id: BackgroundMode;
  imageUrl: string;
  label: string;
  tags: string[];
}> = [
  {
    id: "room",
    imageUrl: "/backgrounds/lofi-pc-room.png",
    label: "深夜のPC部屋",
    tags: ["AI", "コンピュータ", "プログラミング", "Web開発", "ローカルAI"],
  },
  {
    id: "desk",
    imageUrl: "/backgrounds/rainy-cafe.png",
    label: "雨のカフェ",
    tags: ["心理学", "哲学", "相談", "ものづくり"],
  },
  {
    id: "window",
    imageUrl: "/backgrounds/night-library.png",
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
  const profile =
    backgroundModeProfiles.find((backgroundProfile) => backgroundProfile.id === mode) ??
    backgroundModeProfiles[0];

  return (
    <div className={className}>
      <div className={`night-scene night-scene-${mode}`} />
      <div
        className="night-scene-image"
        style={{ backgroundImage: `url(${profile.imageUrl})` }}
      />
      <div className={`night-scene-atmosphere night-scene-atmosphere-${mode}`} />
      <div className="lofi-vignette" />
      {mode === "window" ? (
        <div className="dust-motes" />
      ) : (
        <>
          <div className={`rainy-lines rainy-lines-${mode}`} />
          <div className={`rain-drops rain-drops-${mode}`} />
        </>
      )}
      <div className={`window-glow-layer window-glow-layer-${mode}`} />
      {mode === "desk" ? (
        <div className="steam-layer steam-layer-desk">
          <span className="steam steam-a" />
          <span className="steam steam-b" />
          <span className="steam steam-c" />
        </div>
      ) : null}
      <div className="room-grain" />
      <div className="night-floor" />
    </div>
  );
}
