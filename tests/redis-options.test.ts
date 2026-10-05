// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { constructor } = vi.hoisted(() => ({
  constructor: vi.fn(function (_options: { signal: () => AbortSignal }) {
    void _options;
  }),
}));
vi.mock("@upstash/redis", () => ({ Redis: constructor }));
import { createAbuseRedis } from "@/lib/abuse/redis";
import type { AbuseConfig } from "@/lib/abuse/config";
it("disables automatic write retries and applies a fresh bounded request signal", () => {
  createAbuseRedis({
    url: "https://example.upstash.io",
    token: "test-token",
  } as AbuseConfig);
  const options = constructor.mock.calls[0][0];
  expect(options).toMatchObject({
    retry: { retries: 0 },
    enableAutoPipelining: false,
  });
  expect(options.signal()).not.toBe(options.signal());
});
