export type BackgroundMode = "room" | "desk" | "window";

type RainyNightBackgroundProps = {
  mode: BackgroundMode;
};

const modeStyles: Record<BackgroundMode, string> = {
  room: "bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_78%_12%,rgba(125,211,252,0.10),transparent_24%),linear-gradient(180deg,#07111f_0%,#050812_50%,#03040a_100%)]",
  desk: "bg-[radial-gradient(circle_at_55%_66%,rgba(125,211,252,0.16),transparent_25%),radial-gradient(circle_at_28%_72%,rgba(148,163,184,0.10),transparent_18%),linear-gradient(180deg,#06101c_0%,#050812_55%,#020309_100%)]",
  window:
    "bg-[radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.14),transparent_22%),radial-gradient(circle_at_25%_40%,rgba(99,102,241,0.10),transparent_26%),linear-gradient(180deg,#07101d_0%,#040714_58%,#020308_100%)]",
};

export function RainyNightBackground({ mode }: RainyNightBackgroundProps) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050812]">
      <div className={`absolute inset-0 transition-colors ${modeStyles[mode]}`} />
      <div className="absolute inset-x-0 top-0 h-2/3 opacity-50 rainy-lines" />
      <div className="absolute bottom-[-12rem] left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-cyan-300/8 blur-3xl" />
      <div className="absolute right-[8%] top-[12%] hidden h-60 w-44 rounded-md border border-cyan-100/10 bg-slate-950/60 shadow-[0_0_70px_rgba(125,211,252,0.08)] sm:block">
        <div className="grid h-full grid-cols-2 grid-rows-3 gap-px p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              className="bg-cyan-100/[0.035]"
              key={index}
            />
          ))}
        </div>
      </div>
      {mode === "desk" ? (
        <div className="absolute bottom-[8%] left-1/2 hidden w-[34rem] -translate-x-1/2 sm:block">
          <div className="mx-auto h-28 w-80 rounded-lg border border-cyan-100/10 bg-cyan-100/[0.035] shadow-[0_0_80px_rgba(125,211,252,0.08)]" />
          <div className="mt-8 h-14 rounded-md border border-white/10 bg-slate-950/70" />
          <div className="absolute bottom-4 right-14 h-16 w-16 rounded-full border border-cyan-100/10 bg-slate-900/80" />
        </div>
      ) : null}
      {mode === "window" ? (
        <div className="absolute left-[8%] top-[18%] hidden h-80 w-64 rounded-lg border border-cyan-100/10 bg-slate-950/45 shadow-[0_0_90px_rgba(125,211,252,0.08)] sm:block">
          <div className="h-full rain-drops opacity-70" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-cyan-100/10" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-cyan-100/10" />
        </div>
      ) : null}
      <div className="absolute bottom-0 h-28 w-full bg-gradient-to-t from-black/70 to-transparent" />
    </div>
  );
}
