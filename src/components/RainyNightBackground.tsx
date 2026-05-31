export type BackgroundMode = "room" | "desk" | "window";

type RainyNightBackgroundProps = {
  mode: BackgroundMode;
};

export function RainyNightBackground({ mode }: RainyNightBackgroundProps) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050812]">
      <div className={`night-scene night-scene-${mode}`} />
      <div className="absolute inset-x-0 top-0 h-2/3 opacity-50 rainy-lines" />
      <div className="absolute bottom-[-12rem] left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-cyan-300/8 blur-3xl" />

      {mode === "room" ? (
        <>
          <div className="room-window absolute right-[8%] top-[12%] hidden h-60 w-44 rounded-md border border-cyan-100/10 bg-slate-950/60 shadow-[0_0_70px_rgba(125,211,252,0.08)] sm:block">
            <div className="grid h-full grid-cols-2 grid-rows-3 gap-px p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  className="bg-cyan-100/[0.035]"
                  key={index}
                />
              ))}
            </div>
          </div>
          <div className="room-monitor absolute bottom-[16%] left-[13%] hidden h-28 w-48 rounded-lg border border-cyan-100/10 bg-cyan-100/[0.05] sm:block" />
        </>
      ) : null}

      {mode === "desk" ? (
        <div className="absolute bottom-[8%] left-1/2 hidden w-[34rem] -translate-x-1/2 sm:block">
          <div className="desk-monitor mx-auto h-28 w-80 rounded-lg border border-emerald-100/10 bg-emerald-100/[0.045] shadow-[0_0_80px_rgba(110,231,183,0.08)]" />
          <div className="keyboard-glow mt-8 h-14 rounded-md border border-white/10 bg-slate-950/70" />
          <div className="coffee-cup absolute bottom-4 right-14 h-16 w-16 rounded-full border border-amber-100/10 bg-slate-900/80">
            <span className="steam steam-a" />
            <span className="steam steam-b" />
          </div>
        </div>
      ) : null}

      {mode === "window" ? (
        <div className="window-panel absolute left-1/2 top-[11%] hidden h-[28rem] w-[32rem] -translate-x-1/2 rounded-lg border border-cyan-100/10 bg-slate-950/45 shadow-[0_0_90px_rgba(125,211,252,0.08)] sm:block">
          <div className="h-full rain-drops opacity-70" />
          <div className="window-light" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-cyan-100/10" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-cyan-100/10" />
        </div>
      ) : null}

      <div className="quiet-eyelid absolute left-1/2 top-[42%] hidden h-24 w-96 -translate-x-1/2 rounded-[50%] border-t border-cyan-100/[0.04] sm:block" />
      <div className="absolute bottom-0 h-28 w-full bg-gradient-to-t from-black/70 to-transparent" />
    </div>
  );
}
