import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAudioDurationMatchesTarget,
  assertPublishableReview,
  reviewStatusForWarnings,
} from "../../scripts/lib/production-gates";
import type { EpisodeScript } from "../../scripts/lib/episode-schema";

function script(review: EpisodeScript["review"]): EpisodeScript {
  return {
    createdAt: new Date(0).toISOString(),
    description: "test",
    durationTargetMinutes: 20,
    id: "episode-test",
    review,
    speakers: [
      { id: "rikei", name: "タルタル", text: "test", voice: "rikei" },
      { id: "bunkei", name: "かな", text: "test", voice: "bunkei" },
    ],
    theme: "test",
    themes: ["test"],
    title: "test",
    updatedAt: new Date(0).toISOString(),
  };
}

test("review warnings block the publish gate", () => {
  assert.equal(reviewStatusForWarnings([]), "reviewed");
  assert.equal(reviewStatusForWarnings(["warning"]), "needs_revision");
  assert.throws(
    () =>
      assertPublishableReview(
        script({
          changes: [],
          checks: {
            misinformationRisk: "test",
            narrationEase: "test",
            naturalConversation: "test",
            readability: "test",
            roleSeparation: "test",
          },
          reviewedAt: new Date(0).toISOString(),
          status: "needs_revision",
          warnings: ["warning"],
        }),
      ),
    /has not passed review/,
  );
});

test("actual audio duration must remain near its target", () => {
  assert.doesNotThrow(() => assertAudioDurationMatchesTarget(20 * 60, 20));
  assert.throws(
    () => assertAudioDurationMatchesTarget(3 * 60, 20),
    /differs from target/,
  );
});
