"use client";

type BgmControlsProps = {
  enabled: boolean;
  isAvailable: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
  volume: number;
};

const MAX_BGM_VOLUME = 0.12;

export function BgmControls({
  enabled,
  isAvailable,
  onEnabledChange,
  onVolumeChange,
  volume,
}: BgmControlsProps) {
  const isOn = enabled && isAvailable;
  const volumePercent = Math.round(volume * 100);

  return (
    <section
      aria-label="BGM設定"
      className="rounded-lg border border-white/10 bg-slate-950/58 p-4 backdrop-blur-md"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Background music
          </p>
          <p className="mt-1 text-sm text-slate-200">
            {isAvailable ? "BGM" : "BGM 準備中"}
          </p>
        </div>

        <button
          aria-checked={isOn}
          className={`min-h-10 rounded-md border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-200/60 ${
            isOn
              ? "border-cyan-100/30 bg-cyan-100/[0.16] text-cyan-50"
              : "border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.08]"
          } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/[0.045]`}
          disabled={!isAvailable}
          onClick={() => onEnabledChange(!enabled)}
          role="switch"
          type="button"
        >
          {isOn ? "ON" : "OFF"}
        </button>
      </div>

      <label className="mt-4 grid gap-2 text-sm text-slate-300">
        <span className="flex items-center justify-between gap-3">
          <span>音量</span>
          <span className="font-mono text-xs text-slate-500">
            {volumePercent}%
          </span>
        </span>
        <input
          aria-label="BGM音量"
          className="w-full accent-cyan-200 disabled:opacity-40"
          disabled={!isAvailable}
          max={MAX_BGM_VOLUME}
          min={0}
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
          step={0.01}
          type="range"
          value={volume}
        />
      </label>
    </section>
  );
}
