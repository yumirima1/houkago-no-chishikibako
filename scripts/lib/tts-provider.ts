import { writeFile } from "node:fs/promises";

import { VoiceId } from "./episode-schema";

export type TtsProvider = {
  getSynthesisSignature(options: {
    speakerName: string;
    text: string;
    voice: VoiceId;
  }): unknown;
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
  voiceProfiles: Record<
    string,
    {
      intonationScale: number;
      pauseLength: number;
      pitchScale: number;
      postPhonemeLength: number;
      prePhonemeLength: number;
      speedScale: number;
      volumeScale: number;
    }
  >;
};

const defaultVoicevoxConfig: VoicevoxConfig = {
  endpoint:
    process.env.VOICEVOX_URL ??
    process.env.VOICEVOX_ENDPOINT ??
    "http://127.0.0.1:50021",
  voices: {
    rikei: Number(process.env.VOICEVOX_RIKEI_SPEAKER_ID ?? 12),
    bunkei: Number(process.env.VOICEVOX_BUNKEI_SPEAKER_ID ?? 2),
  },
  voiceProfiles: {
    rikei: {
      intonationScale: 0.86,
      pauseLength: 0.46,
      pitchScale: 0.01,
      postPhonemeLength: 0.16,
      prePhonemeLength: 0.08,
      speedScale: 1.04,
      volumeScale: 0.9,
    },
    bunkei: {
      intonationScale: 0.9,
      pauseLength: 0.5,
      pitchScale: -0.04,
      postPhonemeLength: 0.18,
      prePhonemeLength: 0.1,
      speedScale: 1,
      volumeScale: 0.88,
    },
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
      voiceProfiles: {
        ...defaultVoicevoxConfig.voiceProfiles,
        ...config.voiceProfiles,
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

  getSynthesisSignature({
    speakerName,
    text,
    voice,
  }: {
    speakerName: string;
    text: string;
    voice: VoiceId;
  }) {
    const speaker = this.speakerIdForVoice(voice);

    return {
      engine: "voicevox",
      speaker,
      speakerName,
      text,
      voice,
      voiceProfile: this.config.voiceProfiles[voice] ?? null,
    };
  }

  private applyVoiceProfile(audioQuery: unknown, voice: VoiceId) {
    if (!audioQuery || typeof audioQuery !== "object") {
      return audioQuery;
    }

    const profile = this.config.voiceProfiles[voice];

    if (!profile) {
      return audioQuery;
    }

    return {
      ...audioQuery,
      intonationScale: profile.intonationScale,
      pauseLength: profile.pauseLength,
      pitchScale: profile.pitchScale,
      postPhonemeLength: profile.postPhonemeLength,
      prePhonemeLength: profile.prePhonemeLength,
      speedScale: profile.speedScale,
      volumeScale: profile.volumeScale,
    };
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

      const audioQuery = this.applyVoiceProfile(await queryResponse.json(), voice);
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
