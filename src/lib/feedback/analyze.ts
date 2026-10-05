import "server-only";
import { z } from "zod";
import { getTypeSafeClient } from "@/lib/typesafe";
import type { Feedback } from "./schema";
import { analysisSchema, feedbackQuestions } from "./rubric";

const confidence = z.number().min(0).max(1);
const providerAnswers = z.object({
  happiness: z.object({ choice: analysisSchema.shape.happiness, confidence }),
  topic: z.object({ choice: analysisSchema.shape.topic, confidence }),
  impact: z.object({ choice: analysisSchema.shape.impact, confidence }),
  urgency: z.object({ choice: analysisSchema.shape.urgency, confidence }),
  action: z.object({ choice: analysisSchema.shape.action, confidence }),
});

export async function analyzeFeedback(
  feedback: Feedback,
  signal?: AbortSignal,
) {
  const result = await getTypeSafeClient().systemOne(
    {
      state: {
        feedback: feedback.feedback,
        ...(feedback.service ? { service: feedback.service } : {}),
        ...(feedback.rating ? { rating: feedback.rating } : {}),
      },
      questions: feedbackQuestions,
    },
    { signal, timeout: 20000, retry: { maxRetries: 0 } },
  );
  const answers = providerAnswers.parse(result.answers);
  const lowestConfidence = Math.min(
    ...Object.values(answers).map((answer) => answer.confidence),
  );
  return analysisSchema.parse({
    feedback_id: feedback.feedback_id,
    happiness: answers.happiness.choice,
    topic: answers.topic.choice,
    impact: answers.impact.choice,
    urgency: answers.urgency.choice,
    action: answers.action.choice,
    confidence: lowestConfidence,
    needsReview:
      lowestConfidence < 0.7 || answers.happiness.choice === "unclear",
  });
}
