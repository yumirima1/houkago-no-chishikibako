export function RainyNightBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050812]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_78%_12%,rgba(125,211,252,0.10),transparent_24%),linear-gradient(180deg,#07111f_0%,#050812_50%,#03040a_100%)]" />
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
      <div className="absolute bottom-0 h-28 w-full bg-gradient-to-t from-black/70 to-transparent" />
    </div>
  );
}
