import {
  AuthenticationError,
  RateLimitError,
  APITimeoutError,
} from "@typesafe-ai/sdk";
import { analyzeFeedback } from "@/lib/feedback/analyze";
import { feedbackSchema } from "@/lib/feedback/schema";
import { randomUUID } from "node:crypto";
import { admitAnalysis, type AdmissionResult } from "@/lib/abuse/admission";
import { analysisEnabled } from "@/lib/abuse/config";
import type { AnalysisApiError } from "@/lib/feedback/api-errors";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_REQUEST_BYTES = 32000;

/** Enforce the byte limit while reading, including requests without Content-Length. */
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES)
    return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const respond = (body: unknown, status: number, retryAfter?: number) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    });
  // Reject browser requests from other origins before spending provider credits.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return respond({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return respond({ error: "Send feedback as JSON." }, 415);
  try {
    const text = await readBody(request);
    if (text === null)
      return respond({ error: "Feedback request is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return respond({ error: "Invalid JSON." }, 400);
    }
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success)
      return respond(
        {
          error: "Invalid feedback format. Check the sample file.",
          issues: parsed.error.issues.map((issue) => ({
            column: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    if (!process.env.TYPESAFE_API_KEY?.trim())
      return respond(
        {
          error:
            "AI is not configured. Set the server TYPESAFE_API_KEY, then retry.",
        },
        503,
      );
    const requestId = randomUUID();
    let admission: AdmissionResult;
    try {
      if (!analysisEnabled())
        return respond(
          {
            error:
              "Analysis is temporarily disabled. Your feedback is still available.",
            code: "ANALYSIS_DISABLED",
            retryable: false,
          } satisfies AnalysisApiError,
          503,
        );
      if (request.signal.aborted)
        return respond({ error: "Request was cancelled." }, 499);
      admission = await admitAnalysis(request, requestId);
    } catch {
      console.warn("Analysis protection unavailable", { requestId });
      return respond(
        {
          error:
            "Analysis protection is temporarily unavailable. Please try again later.",
          code: "PROTECTION_UNAVAILABLE",
          retryable: false,
        } satisfies AnalysisApiError,
        503,
      );
    }
    if (!admission.allowed) {
      console.info("Analysis admission denied", {
        requestId,
        reason: admission.reason,
      });
      const codes = {
        rate: "RATE_LIMITED",
        capacity: "CAPACITY_LIMITED",
        ip_quota: "IP_QUOTA_EXHAUSTED",
        global_quota: "GLOBAL_QUOTA_EXHAUSTED",
      } as const;
      const messages = {
        rate: "Too many analysis requests from this network. Waiting before continuing.",
        capacity: "Analysis capacity is busy. Waiting before continuing.",
        ip_quota: "This network has reached its daily analysis allowance.",
        global_quota: "The service has reached its daily analysis allowance.",
      };
      return respond(
        {
          error: messages[admission.reason],
          code: codes[admission.reason],
          retryable:
            admission.reason === "rate" || admission.reason === "capacity",
          resumeAt: admission.resumeAt,
        } satisfies AnalysisApiError,
        admission.reason === "global_quota" ? 503 : 429,
        admission.retryAfterSeconds,
      );
    }
    try {
      // Aborted work retains its reservation because provider billing is uncertain.
      if (request.signal.aborted)
        return respond({ error: "Request was cancelled." }, 499);
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(25000),
      ]);
      return respond(await analyzeFeedback(parsed.data, signal), 200);
    } finally {
      try {
        await admission.release();
      } catch {
        console.warn("Analysis lease cleanup failed", { requestId });
      }
    }
  } catch (error) {
    if (error instanceof AuthenticationError)
      return respond(
        {
          error:
            "AI credentials were rejected. Check the server API key, then retry.",
        },
        503,
      );
    if (error instanceof RateLimitError)
      return respond(
        {
          error:
            "AI is busy or its usage limit was reached. Wait, then retry this row.",
          code: "PROVIDER_RATE_LIMITED",
          retryable: false,
        },
        429,
      );
    if (
      error instanceof APITimeoutError ||
      (error instanceof Error &&
        ["TimeoutError", "AbortError", "APIUserAbortError"].includes(
          error.name,
        ))
    )
      return respond({ error: "Analysis timed out. Retry this row." }, 504);
    return respond(
      {
        error:
          "AI analysis failed. Retry this row; your feedback is still available.",
      },
      502,
    );
  }
}
