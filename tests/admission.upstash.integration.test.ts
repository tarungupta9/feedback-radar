// @vitest-environment node
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Exercise the real route and admission store without spending AI credits.
vi.mock("@/lib/feedback/analyze", () => ({ analyzeFeedback: vi.fn() }));
import { POST } from "@/app/api/feedback/analyze/route";
import { admissionKeys } from "@/lib/abuse/admission";
import { getAbuseConfig, type AbuseConfig } from "@/lib/abuse/config";
import { createAbuseRedis } from "@/lib/abuse/redis";
import { analyzeFeedback } from "@/lib/feedback/analyze";
import { analysis } from "./fixtures/analysis";

// Explicit opt-in: never use remote credentials during ordinary unit tests.
describe.skipIf(process.env.RUN_UPSTASH_INTEGRATION !== "true")(
  "API admission against configured Upstash",
  () => {
    let localEnv: Record<string, string | undefined>;
    let keys: Set<string>;
    let redis: ReturnType<typeof createAbuseRedis>;

    function policy(overrides: Partial<AbuseConfig>) {
      const values = {
        burst: 100,
        refill: 100,
        ipDaily: 100,
        globalDaily: 100,
        ipActive: 100,
        globalActive: 100,
        ...overrides,
      };
      const names = {
        burst: "RATE_LIMIT_BURST",
        refill: "RATE_LIMIT_REFILL_PER_SECOND",
        ipDaily: "RATE_LIMIT_IP_DAILY",
        globalDaily: "RATE_LIMIT_GLOBAL_DAILY",
        ipActive: "RATE_LIMIT_IP_ACTIVE",
        globalActive: "RATE_LIMIT_GLOBAL_ACTIVE",
      } as const;
      for (const key of Object.keys(names) as (keyof typeof names)[])
        vi.stubEnv(names[key], String(values[key]));
    }

    function requestKeys(ip = "127.0.0.1") {
      const config = getAbuseConfig();
      const identity = createHmac("sha256", config.secret)
        .update(ip)
        .digest("hex");
      const owned = admissionKeys(config.namespace, identity);
      for (const key of owned) keys.add(key);
      return owned;
    }

    function post(
      ip?: string,
      body = { feedback_id: "A1", feedback: "Great" },
    ) {
      requestKeys(ip);
      return POST(
        new Request("http://localhost:3000/api/feedback/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(ip ? { "x-vercel-forwarded-for": ip } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    }

    async function expectDenial(
      response: Response,
      status: number,
      code: string,
      retryable: boolean,
    ) {
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const seconds = Number(response.headers.get("retry-after"));
      expect(seconds).toBeGreaterThan(0);
      const body = await response.json();
      expect(body).toMatchObject({ code, retryable });
      expect(Number.isFinite(Date.parse(body.resumeAt))).toBe(true);
      return body as { resumeAt: string };
    }

    beforeEach(() => {
      vi.clearAllMocks();
      localEnv = parseEnv(readFileSync(".env.local", "utf8"));
      for (const [key, value] of Object.entries(localEnv)) {
        if (key.startsWith("RATE_LIMIT_") || key.startsWith("UPSTASH_REDIS_"))
          vi.stubEnv(key, value);
      }
      // Never reuse the application's counters, even if .env.local is production.
      vi.stubEnv("RATE_LIMIT_NAMESPACE", `development-check-${randomUUID()}`);
      vi.stubEnv("VERCEL_ENV", undefined);
      vi.stubEnv("VERCEL", undefined);
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RATE_LIMIT_LOCAL_IDENTITY", "true");
      vi.stubEnv("ANALYSIS_ENABLED", "true");
      vi.stubEnv("TYPESAFE_API_KEY", "mock-provider-only");
      keys = new Set();
      redis = createAbuseRedis(getAbuseConfig());
      vi.mocked(analyzeFeedback).mockResolvedValue(analysis);
    });

    afterEach(async () => {
      try {
        // Delete only this test's exact keys; never scan or flush the database.
        if (keys.size) await redis.del(...keys);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("loads every numeric policy value from .env.local", () => {
      const config = getAbuseConfig();
      for (const [key, name] of Object.entries({
        burst: "RATE_LIMIT_BURST",
        refill: "RATE_LIMIT_REFILL_PER_SECOND",
        ipDaily: "RATE_LIMIT_IP_DAILY",
        globalDaily: "RATE_LIMIT_GLOBAL_DAILY",
        ipActive: "RATE_LIMIT_IP_ACTIVE",
        globalActive: "RATE_LIMIT_GLOBAL_ACTIVE",
      })) {
        if (localEnv[name] !== undefined)
          expect(config[key as keyof AbuseConfig]).toBe(Number(localEnv[name]));
      }
    });

    it("blocks an empty bucket, preserves quota, then admits after refill", async () => {
      policy({ burst: 1, refill: 1 });
      expect((await post()).status).toBe(200);
      const denied = await expectDenial(
        await post(),
        429,
        "RATE_LIMITED",
        true,
      );
      const owned = requestKeys();
      expect(await redis.hget(owned[2], "count")).toBe(1);
      expect(analyzeFeedback).toHaveBeenCalledOnce();
      const waitMs = Math.max(0, Date.parse(denied.resumeAt) - Date.now()) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      expect((await post()).status).toBe(200);
      expect(await redis.hget(owned[2], "count")).toBe(2);
    });

    it("enforces the IP daily boundary without debiting rejected requests", async () => {
      policy({ ipDaily: 2 });
      expect((await post()).status).toBe(200);
      expect((await post()).status).toBe(200);
      const denied = await expectDenial(
        await post(),
        429,
        "IP_QUOTA_EXHAUSTED",
        false,
      );
      expect(
        new Date(denied.resumeAt).toISOString().endsWith("T00:00:00.000Z"),
      ).toBe(true);
      const owned = requestKeys();
      expect(await redis.hget(owned[1], "count")).toBe(2);
      expect(await redis.hget(owned[2], "count")).toBe(2);
      expect(analyzeFeedback).toHaveBeenCalledTimes(2);
    });

    it("atomically reserves the final global allowance across identities", async () => {
      policy({ globalDaily: 2 });
      // Direct handler invocation simulates trusted ingress; no public bypass.
      vi.stubEnv("VERCEL", "1");
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, i) => post(`192.0.2.${i + 1}`)),
      );
      expect(
        responses.filter((response) => response.status === 200),
      ).toHaveLength(2);
      for (const response of responses.filter(
        (response) => response.status !== 200,
      ))
        await expectDenial(response, 503, "GLOBAL_QUOTA_EXHAUSTED", false);
      expect(await redis.hget(requestKeys("192.0.2.1")[2], "count")).toBe(2);
      expect(analyzeFeedback).toHaveBeenCalledTimes(2);
    });

    it.each(["ip", "global"] as const)(
      "holds one %s active slot and releases it when provider work settles",
      async (scope) => {
        policy(scope === "ip" ? { ipActive: 1 } : { globalActive: 1 });
        if (scope === "global") vi.stubEnv("VERCEL", "1");
        const firstIp = scope === "global" ? "192.0.2.1" : undefined;
        const nextIp = scope === "global" ? "192.0.2.2" : undefined;
        let finish!: () => void;
        let started!: () => void;
        const entered = new Promise<void>((resolve) => {
          started = resolve;
        });
        const pending = new Promise<void>((resolve) => {
          finish = resolve;
        });
        vi.mocked(analyzeFeedback).mockImplementationOnce(async () => {
          started();
          await pending;
          return analysis;
        });
        const first = post(firstIp);
        try {
          await Promise.race([
            entered,
            first.then(() => {
              throw new Error("Admission failed before provider execution");
            }),
          ]);
          await expectDenial(await post(nextIp), 429, "CAPACITY_LIMITED", true);
          expect(await redis.hget(requestKeys(firstIp)[2], "count")).toBe(1);
          expect(analyzeFeedback).toHaveBeenCalledOnce();
        } finally {
          finish();
          expect((await first).status).toBe(200);
        }
        expect(await redis.zcard(requestKeys(firstIp)[4])).toBe(0);
        expect((await post(nextIp)).status).toBe(200);
      },
    );

    it("retains a provider failure's daily debit but releases its active slot", async () => {
      policy({ ipActive: 1 });
      vi.mocked(analyzeFeedback).mockRejectedValueOnce(
        new Error("provider failed"),
      );
      expect((await post()).status).toBe(502);
      const owned = requestKeys();
      expect(await redis.hget(owned[2], "count")).toBe(1);
      expect(await redis.zcard(owned[3])).toBe(0);
      expect(await redis.zcard(owned[4])).toBe(0);
      expect((await post()).status).toBe(200);
    });

    it("rejects invalid input without creating quota keys", async () => {
      expect(
        (await post(undefined, { feedback_id: "A1", feedback: "" })).status,
      ).toBe(400);
      expect(await redis.exists(...requestKeys())).toBe(0);
      expect(analyzeFeedback).not.toHaveBeenCalled();
    });

    it("resets previous UTC-day counters and expires every stored limiter key", async () => {
      policy({ ipDaily: 1, globalDaily: 1 });
      const owned = requestKeys();
      const [seconds] = await redis.time();
      const yesterday = Math.floor(Number(seconds) / 86400) - 1;
      // Seed only isolated test-owned keys. Never adjust the Redis clock.
      await redis.hset(owned[1], { day: yesterday, count: 100 });
      await redis.hset(owned[2], { day: yesterday, count: 100 });
      expect((await post()).status).toBe(200);
      expect(await redis.hget(owned[1], "count")).toBe(1);
      expect(await redis.hget(owned[2], "count")).toBe(1);
      for (const key of owned.slice(0, 3))
        expect(await redis.pttl(key)).toBeGreaterThan(0);
      // Successful provider cleanup removes the now-empty lease sets.
      expect(await redis.exists(...owned.slice(3))).toBe(0);
    });

    it("reclaims expired orphan leases without resetting daily quota", async () => {
      policy({ ipActive: 1, globalActive: 1 });
      const owned = requestKeys();
      for (const key of owned.slice(3)) {
        await redis.zadd(key, { score: 1, member: "orphaned-request" });
        await redis.pexpire(key, 60000);
      }
      expect((await post()).status).toBe(200);
      expect(await redis.hget(owned[2], "count")).toBe(1);
      expect(await redis.exists(...owned.slice(3))).toBe(0);
    });

    it("fails closed on corrupted storage before contacting the provider", async () => {
      await redis.set(requestKeys()[4], "wrong-type", { ex: 60 });
      const response = await post();
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: "PROTECTION_UNAVAILABLE",
      });
      expect(await redis.exists(requestKeys()[2])).toBe(0);
      expect(analyzeFeedback).not.toHaveBeenCalled();
    });
  },
);
