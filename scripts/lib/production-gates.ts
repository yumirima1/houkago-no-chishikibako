import type { EpisodeScript, ReviewResult } from "./episode-schema";

export function reviewStatusForWarnings(
  warnings: string[],
): ReviewResult["status"] {
  return warnings.length === 0 ? "reviewed" : "needs_revision";
}

export function assertPublishableReview(script: EpisodeScript) {
  if (script.review?.status !== "reviewed" || script.review.warnings.length > 0) {
    throw new Error(
      "The script has not passed review without warnings. Resolve review warnings before publishing.",
    );
  }
}

export function assertAudioDurationMatchesTarget(
  actualDurationSeconds: number,
  targetMinutes: number,
) {
  if (!Number.isFinite(actualDurationSeconds) || actualDurationSeconds <= 0) {
    throw new Error("Audio manifest does not contain a valid actualDurationSeconds value.");
  }
  const actualMinutes = actualDurationSeconds / 60;
  const allowedDifference = Math.max(2, targetMinutes * 0.25);

  if (Math.abs(actualMinutes - targetMinutes) > allowedDifference) {
    throw new Error(
      `Audio duration ${actualMinutes.toFixed(1)} min differs from target ${targetMinutes} min by more than ${allowedDifference.toFixed(1)} min.`,
    );
  }
}
