import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function canonicalizeIp(value: string): string {
  const ip = value.trim();
  const family = isIP(ip);
  if (family === 4) return ip;
  // Scoped addresses have no stable public-client meaning here.
  if (family !== 6 || ip.includes("%"))
    throw new Error("Invalid client identity.");
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return canonical;
}

export function resolveIdentity(request: Request, secret: string): string {
  let ip: string;
  if (process.env.VERCEL === "1") {
    const established = request.headers.get("x-vercel-forwarded-for");
    if (!established) throw new Error("Client identity unavailable.");
    ip = canonicalizeIp(established);
  } else if (
    process.env.NODE_ENV === "development" &&
    process.env.RATE_LIMIT_LOCAL_IDENTITY === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  ) {
    // Explicit local development only; forwarded headers never select identity.
    ip = "127.0.0.1";
  } else throw new Error("Trusted ingress unavailable.");
  return createHmac("sha256", secret).update(ip).digest("hex");
}
