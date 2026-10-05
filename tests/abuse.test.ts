// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getAbuseConfig, analysisEnabled } from "@/lib/abuse/config";
import { canonicalizeIp, resolveIdentity } from "@/lib/abuse/identity";
import { createAbuseRedis } from "@/lib/abuse/redis";
import { admitAnalysis } from "@/lib/abuse/admission";
vi.mock("@/lib/abuse/redis", () => ({ createAbuseRedis: vi.fn() }));
const evalMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of [
    "VERCEL_ENV",
    "RATE_LIMIT_BURST",
    "RATE_LIMIT_REFILL_PER_SECOND",
    "RATE_LIMIT_IP_DAILY",
    "RATE_LIMIT_IP_ACTIVE",
    "RATE_LIMIT_GLOBAL_ACTIVE",
  ])
    vi.stubEnv(key, undefined);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  vi.stubEnv("RATE_LIMIT_IDENTITY_SECRET", "a".repeat(32));
  vi.stubEnv("RATE_LIMIT_NAMESPACE", "production-feedback-radar");
  vi.stubEnv("RATE_LIMIT_GLOBAL_DAILY", "1000");
  vi.stubEnv("ANALYSIS_ENABLED", "true");
  vi.stubEnv("VERCEL", "1");
  vi.mocked(createAbuseRedis).mockReturnValue({
    eval: evalMock,
  } as unknown as ReturnType<typeof createAbuseRedis>);
});
afterEach(() => vi.unstubAllEnvs());

describe("protection configuration", () => {
  it("requires a deliberate global quota", () => {
    vi.stubEnv("RATE_LIMIT_GLOBAL_DAILY", undefined);
    expect(getAbuseConfig).toThrow();
  });
  it.each(["0", "-1", "1.5", "", "Infinity", "1000001"])(
    "rejects invalid policy %s",
    (value) => {
      vi.stubEnv("RATE_LIMIT_IP_DAILY", value);
      expect(getAbuseConfig).toThrow();
    },
  );
  it("requires namespace isolation for Vercel environments", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getAbuseConfig).toThrow();
    vi.stubEnv("RATE_LIMIT_NAMESPACE", "preview-feedback-radar");
    expect(getAbuseConfig().namespace).toBe("preview-feedback-radar");
  });
  it("rejects malformed enable settings and weak identity secrets", () => {
    vi.stubEnv("ANALYSIS_ENABLED", "yes");
    expect(analysisEnabled).toThrow();
    vi.stubEnv("RATE_LIMIT_IDENTITY_SECRET", "weak");
    expect(getAbuseConfig).toThrow();
  });
});

describe("network identity", () => {
  const req = (
    headers: Record<string, string> = {},
    url = "https://feedback.example/api/feedback/analyze",
  ) => new Request(url, { headers });
  it("normalizes equivalent IPv6 and mapped IPv4 addresses", () => {
    expect(canonicalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1",
    );
    expect(canonicalizeIp("::ffff:192.0.2.1")).toBe("192.0.2.1");
    expect(canonicalizeIp("::ffff:c000:201")).toBe("192.0.2.1");
  });
  it.each([
    "",
    "192.0.2.1, 192.0.2.2",
    "fe80::1%eth0",
    "192.0.2.1:80",
    "unknown",
    "999.1.2.3",
  ])("rejects invalid identity %s", (value) =>
    expect(() => canonicalizeIp(value)).toThrow(),
  );
  it("ignores spoofed generic forwarding headers and never exposes raw IP keys", () => {
    expect(() =>
      resolveIdentity(req({ "x-forwarded-for": "192.0.2.1" }), "secret"),
    ).toThrow();
    const identity = resolveIdentity(
      req({
        "x-vercel-forwarded-for": "192.0.2.1",
        "x-forwarded-for": "192.0.2.99",
      }),
      "secret",
    );
    expect(identity).toMatch(/^[a-f0-9]{64}$/);
    expect(identity).toBe(
      resolveIdentity(
        req({ "x-vercel-forwarded-for": "::ffff:c000:201" }),
        "secret",
      ),
    );
    expect(identity).not.toBe(
      resolveIdentity(
        req({ "x-vercel-forwarded-for": "192.0.2.1" }),
        "another-secret",
      ),
    );
  });
  it("only permits explicit loopback identity in local development", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RATE_LIMIT_LOCAL_IDENTITY", "true");
    expect(resolveIdentity(req({}, "http://localhost:3000"), "secret")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(() => resolveIdentity(req(), "secret")).toThrow();
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      resolveIdentity(req({}, "http://localhost:3000"), "secret"),
    ).toThrow();
  });
});

describe("admission transport", () => {
  const req = () =>
    new Request("https://feedback.example", {
      headers: { "x-vercel-forwarded-for": "192.0.2.1" },
    });
  it("validates reservations and releases the same lease idempotently", async () => {
    evalMock.mockResolvedValueOnce([1, "request-1"]).mockResolvedValue(1);
    const result = await admitAnalysis(req(), "request-1");
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error("Expected admission");
    await result.release();
    await result.release();
    expect(evalMock).toHaveBeenCalledTimes(3);
    const [, keys, args] = evalMock.mock.calls[0];
    expect(
      keys.every((key: string) =>
        key.startsWith("{production-feedback-radar:admission-v1}"),
      ),
    ).toBe(true);
    expect(args.at(-1)).toBe("request-1");
    expect(evalMock.mock.calls[1][1]).toEqual(keys.slice(3));
  });
  it.each([
    [1, "wrong-lease"],
    [1],
    [0, "rate", -1, 123],
    [0, "unknown", 1, 123],
  ])("rejects malformed admission response %j", async (...response) => {
    evalMock.mockResolvedValue(response);
    await expect(admitAnalysis(req(), "request-1")).rejects.toThrow();
  });
  it("does not retry uncertain writes", async () => {
    evalMock.mockRejectedValue(new Error("Network timeout"));
    await expect(admitAnalysis(req(), "request-1")).rejects.toThrow();
    expect(evalMock).toHaveBeenCalledOnce();
  });
});
