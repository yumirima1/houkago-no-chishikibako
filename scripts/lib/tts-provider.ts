import { writeFile } from "node:fs/promises";

import { VoiceId } from "./episode-schema";

export type TtsProvider = {
  synthesizeToWav(options: {
    speakerName: string;
    text: string;
    voice: VoiceId;
    outputPath: string;
  }): Promise<void>;
};

type VoicevoxConfig = {
  endpoint: string;
  voices: Record<string, number>;
};

const defaultVoicevoxConfig: VoicevoxConfig = {
  endpoint: process.env.VOICEVOX_ENDPOINT ?? "http://127.0.0.1:50021",
  voices: {
    rikei: Number(process.env.VOICEVOX_RIKEI_SPEAKER_ID ?? 3),
    bunkei: Number(process.env.VOICEVOX_BUNKEI_SPEAKER_ID ?? 2),
  },
};

function toVoicevoxError(error: unknown) {
  if (error instanceof TypeError || error instanceof Error) {
    return new Error(
      [
        "VOICEVOXが起動していません。",
        "VOICEVOX Engine を起動してください。",
        `接続先: ${defaultVoicevoxConfig.endpoint}`,
        `詳細: ${error.message}`,
      ].join("\n"),
    );
  }

  return error;
}

export class VoicevoxProvider implements TtsProvider {
  private readonly config: VoicevoxConfig;

  constructor(config: Partial<VoicevoxConfig> = {}) {
    this.config = {
      ...defaultVoicevoxConfig,
      ...config,
      voices: {
        ...defaultVoicevoxConfig.voices,
        ...config.voices,
      },
    };
  }

  private speakerIdForVoice(voice: VoiceId) {
    if (/^\d+$/.test(voice)) {
      return Number(voice);
    }

    const speakerId = this.config.voices[voice];

    if (typeof speakerId !== "number" || Number.isNaN(speakerId)) {
      throw new Error(
        `VOICEVOX speaker id is not configured for voice "${voice}".`,
      );
    }

    return speakerId;
  }

  async assertAvailable() {
    try {
      const response = await fetch(`${this.config.endpoint}/version`);

      if (!response.ok) {
        throw new Error(`VOICEVOX /version returned ${response.status}`);
      }
    } catch (error) {
      throw toVoicevoxError(error);
    }
  }

  async synthesizeToWav({
    speakerName,
    text,
    voice,
    outputPath,
  }: {
    speakerName: string;
    text: string;
    voice: VoiceId;
    outputPath: string;
  }) {
    const speaker = this.speakerIdForVoice(voice);

    try {
      const queryResponse = await fetch(
        `${this.config.endpoint}/audio_query?${new URLSearchParams({
          speaker: String(speaker),
          text,
        })}`,
        { method: "POST" },
      );

      if (!queryResponse.ok) {
        throw new Error(
          `audio_query failed for ${speakerName}: ${queryResponse.status}`,
        );
      }

      const audioQuery = await queryResponse.json();
      const synthesisResponse = await fetch(
        `${this.config.endpoint}/synthesis?${new URLSearchParams({
          speaker: String(speaker),
        })}`,
        {
          body: JSON.stringify(audioQuery),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );

      if (!synthesisResponse.ok) {
        throw new Error(
          `synthesis failed for ${speakerName}: ${synthesisResponse.status}`,
        );
      }

      const wav = Buffer.from(await synthesisResponse.arrayBuffer());
      await writeFile(outputPath, wav);
    } catch (error) {
      throw toVoicevoxError(error);
    }
  }
}
