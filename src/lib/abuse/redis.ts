import "server-only";
import { Redis } from "@upstash/redis";
import type { AbuseConfig } from "./config";

export function createAbuseRedis(config: AbuseConfig) {
  return new Redis({
    url: config.url,
    token: config.token,
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(1500),
    enableTelemetry: false,
    enableAutoPipelining: false,
  });
}
