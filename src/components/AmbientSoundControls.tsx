"use client";

import {
  AmbienceLayerKey,
  AmbienceVolumes,
} from "@/hooks/useBroadcastAmbience";

type AmbientSoundControlsProps = {
  enabled: boolean;
  isAvailable: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onVolumeChange: (layer: AmbienceLayerKey, volume: number) => void;
  volumes: AmbienceVolumes;
};

const MAX_AMBIENCE_VOLUME = 0.28;
const layers: Array<{
  id: AmbienceLayerKey;
  label: string;
}> = [
  { id: "rain", label: "雨" },
  { id: "wind", label: "夜風" },
  { id: "room", label: "静かな部屋" },
  { id: "thunder", label: "遠くの雷" },
];

export function AmbientSoundControls({
  enabled,
  isAvailable,
  onEnabledChange,
  onVolumeChange,
  volumes,
}: AmbientSoundControlsProps) {
  return (
    <section
      aria-label="環境音"
      className="ambient-sound-panel"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="ambient-sound-header">
        <div>
          <p className="ambient-sound-kicker">Ambient controls</p>
          <h2>放送室の空気</h2>
        </div>

        <button
          aria-checked={enabled && isAvailable}
          className={enabled && isAvailable ? "is-active" : ""}
          disabled={!isAvailable}
          onClick={() => onEnabledChange(!enabled)}
          role="switch"
          type="button"
        >
          {enabled && isAvailable ? "ON" : "OFF"}
        </button>
      </div>

      <div className="ambient-sound-sliders">
        {layers.map((layer) => {
          const volume = volumes[layer.id];

          return (
            <label className="ambient-sound-slider" key={layer.id}>
              <span>
                <span>{layer.label}</span>
                <span>{Math.round(volume * 100)}%</span>
              </span>
              <input
                aria-label={`${layer.label}の音量`}
                disabled={!isAvailable}
                max={MAX_AMBIENCE_VOLUME}
                min={0}
                onChange={(event) =>
                  onVolumeChange(layer.id, Number(event.currentTarget.value))
                }
                step={0.01}
                type="range"
                value={volume}
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
