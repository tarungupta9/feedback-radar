import "server-only";
import { z } from "zod";

const positive = z.coerce.number().int().min(1).max(1_000_000);
const settings = z.object({
  url: z.url().refine((value) => new URL(value).protocol === "https:"),
  token: z.string().trim().min(1),
  secret: z.string().trim().min(32),
  namespace: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  burst: positive.default(20),
  refill: positive.default(2),
  ipDaily: positive.default(500),
  globalDaily: positive,
  ipActive: positive.default(6),
  globalActive: positive.default(20),
});
export type AbuseConfig = z.infer<typeof settings>;

export function analysisEnabled() {
  const value = process.env.ANALYSIS_ENABLED ?? "true";
  if (value !== "true" && value !== "false")
    throw new Error("Invalid analysis configuration.");
  return value === "true";
}

/** Read lazily: builds and non-AI pages never require protection credentials. */
export function getAbuseConfig(): AbuseConfig {
  const config = settings.parse({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    secret: process.env.RATE_LIMIT_IDENTITY_SECRET,
    namespace: process.env.RATE_LIMIT_NAMESPACE,
    burst: process.env.RATE_LIMIT_BURST,
    refill: process.env.RATE_LIMIT_REFILL_PER_SECOND,
    ipDaily: process.env.RATE_LIMIT_IP_DAILY,
    globalDaily: process.env.RATE_LIMIT_GLOBAL_DAILY,
    ipActive: process.env.RATE_LIMIT_IP_ACTIVE,
    globalActive: process.env.RATE_LIMIT_GLOBAL_ACTIVE,
  });
  if (
    process.env.VERCEL_ENV &&
    !config.namespace.startsWith(`${process.env.VERCEL_ENV}-`)
  )
    throw new Error(
      "Protection namespace must match the deployment environment.",
    );
  return config;
}
