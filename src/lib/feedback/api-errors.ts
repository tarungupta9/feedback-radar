import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.enum([
    "RATE_LIMITED",
    "CAPACITY_LIMITED",
    "IP_QUOTA_EXHAUSTED",
    "GLOBAL_QUOTA_EXHAUSTED",
    "PROTECTION_UNAVAILABLE",
    "ANALYSIS_DISABLED",
    "PROVIDER_RATE_LIMITED",
  ]),
  retryable: z.boolean(),
  resumeAt: z.iso.datetime().optional(),
});
export type AnalysisApiError = z.infer<typeof apiErrorSchema>;
