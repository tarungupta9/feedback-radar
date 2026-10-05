// @vitest-environment node
import {
  execFile,
  execFileSync,
  spawn,
  type ChildProcess,
} from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { admissionKeys, admissionArgs } from "@/lib/abuse/admission";
import { ADMIT_SCRIPT, RELEASE_SCRIPT } from "@/lib/abuse/scripts";
import type { AbuseConfig } from "@/lib/abuse/config";

const serverBin = process.env.REDIS_SERVER_BIN ?? "redis-server";
const cliBin = process.env.REDIS_CLI_BIN ?? "redis-cli";
const exec = promisify(execFile);
let available = true;
try {
  execFileSync(serverBin, ["--version"], { stdio: "ignore" });
  execFileSync(cliBin, ["--version"], { stdio: "ignore" });
} catch {
  available = false;
}

// Isolated real Redis, Unix socket only, no persistence or external connections.
// Set REDIS_SERVER_BIN/REDIS_CLI_BIN when binaries are outside PATH.
describe.skipIf(!available)("atomic admission against real Redis", () => {
  let server: ChildProcess;
  let directory: string;
  let socket: string;
  const config: AbuseConfig = {
    url: "https://unused.example",
    token: "unused",
    secret: "a".repeat(32),
    namespace: "test",
    burst: 100,
    refill: 100,
    ipDaily: 100,
    globalDaily: 100,
    ipActive: 100,
    globalActive: 100,
  };
  async function command(...args: (string | number)[]): Promise<unknown> {
    const { stdout } = await exec(cliBin, [
      "-s",
      socket,
      "--json",
      ...args.map(String),
    ]);
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed === "string" && /^(ERR|WRONGTYPE)/.test(parsed))
      throw new Error(parsed);
    return parsed;
  }
  async function admit(
    namespace: string,
    identity = "ip1",
    overrides: Partial<AbuseConfig> = {},
    leaseMs = 45000,
  ) {
    const args = admissionArgs({ ...config, ...overrides }, randomUUID());
    args[6] = leaseMs;
    return (await command(
      "EVAL",
      ADMIT_SCRIPT,
      5,
      ...admissionKeys(namespace, identity),
      ...args,
    )) as [number, string, number?, number?];
  }
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "radar-redis-"));
    socket = join(directory, "redis.sock");
    server = spawn(
      serverBin,
      [
        "--port",
        "0",
        "--unixsocket",
        socket,
        "--unixsocketperm",
        "700",
        "--save",
        "",
        "--appendonly",
        "no",
        "--locale-collate",
        "C",
        "--dir",
        directory,
      ],
      { stdio: "ignore", env: { ...process.env, LC_ALL: "C", LANG: "C" } },
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await command("PING")) === "PONG") return;
      } catch {
        /* wait for isolated server */
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Redis did not start");
  }, 10000);
  afterAll(async () => {
    if (server?.exitCode === null) {
      const closed = new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
      );
      server.kill("SIGTERM");
      await closed;
    }
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("admits exactly the final global allowance across parallel identities", async () => {
    const namespace = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        admit(namespace, `ip${i}`, { globalDaily: 1 }),
      ),
    );
    expect(results.filter((result) => result[0] === 1)).toHaveLength(1);
    expect(
      results.filter((result) => result[1] === "global_quota"),
    ).toHaveLength(29);
  });
  it("reserves one final concurrency slot, releases idempotently and retains daily debit", async () => {
    const namespace = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        admit(namespace, `ip${i}`, { globalActive: 1 }),
      ),
    );
    const index = results.findIndex((result) => result[0] === 1);
    expect(results.filter((result) => result[0] === 1)).toHaveLength(1);
    const keys = admissionKeys(namespace, `ip${index}`);
    await command(
      "EVAL",
      RELEASE_SCRIPT,
      2,
      ...keys.slice(3),
      results[index][1],
    );
    await command(
      "EVAL",
      RELEASE_SCRIPT,
      2,
      ...keys.slice(3),
      results[index][1],
    );
    expect(await command("HGET", keys[2], "count")).toBe("1");
    expect((await admit(namespace, "new-ip", { globalActive: 1 }))[0]).toBe(1);
  });
  it("blocks IP quota without incrementing global quota", async () => {
    const namespace = randomUUID();
    expect((await admit(namespace, "ip1", { ipDaily: 1 }))[0]).toBe(1);
    const denied = await admit(namespace, "ip1", { ipDaily: 1 });
    expect(denied[1]).toBe("ip_quota");
    expect(
      await command("HGET", admissionKeys(namespace, "ip1")[2], "count"),
    ).toBe("1");
    expect(new Date(denied[3]!).getUTCHours()).toBe(0);
  });
  it("refills a token bucket and expires orphaned leases", async () => {
    const namespace = randomUUID();
    const options = { burst: 1, refill: 100, ipActive: 1, globalActive: 1 };
    expect((await admit(namespace, "ip1", options, 80))[0]).toBe(1);
    expect((await admit(namespace, "ip1", options, 80))[0]).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await admit(namespace, "ip1", options, 80))[0]).toBe(1);
  });
  it("applies TTLs to every admitted key and rejects rate without daily debit", async () => {
    const namespace = randomUUID();
    await admit(namespace, "ip1", { burst: 1, refill: 1 });
    expect((await admit(namespace, "ip1", { burst: 1, refill: 1 }))[1]).toBe(
      "rate",
    );
    const keys = admissionKeys(namespace, "ip1");
    for (const key of keys)
      expect(Number(await command("PTTL", key))).toBeGreaterThan(0);
    expect(await command("HGET", keys[2], "count")).toBe("1");
  });
  it("resets previous UTC-day counters", async () => {
    const namespace = randomUUID();
    const keys = admissionKeys(namespace, "ip1");
    await command("HSET", keys[1], "day", 1, "count", 500);
    await command("HSET", keys[2], "day", 1, "count", 500);
    expect(
      (await admit(namespace, "ip1", { ipDaily: 1, globalDaily: 1 }))[0],
    ).toBe(1);
    expect(await command("HGET", keys[2], "count")).toBe("1");
  });
  it("rejects invalid key types before any quota write", async () => {
    const namespace = randomUUID();
    const keys = admissionKeys(namespace, "ip1");
    await command("SET", keys[4], "corrupt");
    await expect(admit(namespace)).rejects.toThrow();
    expect(await command("EXISTS", keys[2])).toBe(0);
  });
});
