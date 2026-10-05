import "server-only";
import { z } from "zod";
import { getAbuseConfig, type AbuseConfig } from "./config";
import { resolveIdentity } from "./identity";
import { createAbuseRedis } from "./redis";
import { ADMIT_SCRIPT, RELEASE_SCRIPT } from "./scripts";

const resultSchema = z.union([
  z.tuple([z.literal(1), z.string().min(1)]),
  z.tuple([
    z.literal(0),
    z.enum(["rate", "ip_quota", "global_quota", "capacity"]),
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
]);

export type AdmissionResult =
  | { allowed: true; release: () => Promise<void> }
  | {
      allowed: false;
      reason: "rate" | "ip_quota" | "global_quota" | "capacity";
      retryAfterSeconds: number;
      resumeAt: string;
    };

export function admissionKeys(namespace: string, identity: string) {
  const prefix = `{${namespace}:admission-v1}`;
  return [
    `${prefix}:ip:${identity}:bucket`,
    `${prefix}:ip:${identity}:daily`,
    `${prefix}:global:daily`,
    `${prefix}:ip:${identity}:leases`,
    `${prefix}:global:leases`,
  ];
}

export function admissionArgs(config: AbuseConfig, requestId: string) {
  return [
    config.burst,
    config.refill,
    config.ipDaily,
    config.globalDaily,
    config.ipActive,
    config.globalActive,
    45000,
    requestId,
  ];
}

export async function admitAnalysis(
  request: Request,
  requestId: string,
): Promise<AdmissionResult> {
  const config = getAbuseConfig();
  const identity = resolveIdentity(request, config.secret);
  const redis = createAbuseRedis(config);
  const keys = admissionKeys(config.namespace, identity);
  const result = resultSchema.parse(
    await redis.eval(ADMIT_SCRIPT, keys, admissionArgs(config, requestId)),
  );
  if (result[0] === 0)
    return {
      allowed: false,
      reason: result[1],
      retryAfterSeconds: result[2],
      resumeAt: new Date(result[3]).toISOString(),
    };
  if (result[1] !== requestId)
    throw new Error("Invalid admission reservation.");
  return {
    allowed: true,
    release: async () => {
      await redis.eval(RELEASE_SCRIPT, keys.slice(3), [requestId]);
    },
  };
}
