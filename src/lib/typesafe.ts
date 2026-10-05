import "server-only";

import { TypeSafeClient } from "@typesafe-ai/sdk";

let client: TypeSafeClient | undefined;

/** Lazily initialize so builds and non-AI pages do not need credentials. */
export function getTypeSafeClient(): TypeSafeClient {
  if (client) return client;

  const apiKey = process.env.TYPESAFE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "TYPESAFE_API_KEY is required for AI requests. Set it in .env.local or your server environment.",
    );
  }

  client = new TypeSafeClient({ apiKey, logLevel: "off" });
  return client;
}
