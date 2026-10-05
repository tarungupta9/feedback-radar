"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  analyzeRows,
  type FeedbackRow,
  type BatchControl,
  type RunnerOutcome,
} from "@/lib/feedback/client";
import { parseCsv, parseFeedbackFile } from "@/lib/feedback/parse";
import { sampleCsv } from "@/lib/feedback/sample";
import {
  UploadError,
  type Feedback,
  type UploadIssue,
} from "@/lib/feedback/schema";

type Stage =
  | "empty"
  | "validating"
  | "invalid"
  | "ready"
  | "analyzing"
  | "complete"
  | "paused"
  | "blocked";

interface FeedbackSession {
  stage: Stage;
  fileName: string;
  rows: FeedbackRow[];
  issues: UploadIssue[];
  retrying: boolean;
  control: BatchControl;
}

interface FeedbackContextValue {
  session: FeedbackSession;
  hasPreviousResults: boolean;
  uploadFile: (file: File) => Promise<void>;
  loadSample: () => Promise<void>;
  submit: (onlyId?: string) => Promise<void>;
  pause: () => void;
  canSubmit: boolean;
  startNewUpload: () => void;
  restoreResults: () => void;
}

const emptySession: FeedbackSession = {
  stage: "empty",
  fileName: "",
  rows: [],
  issues: [],
  retrying: false,
  control: { status: "running" },
};
const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<FeedbackSession>(emptySession);
  const [previousResults, setPreviousResults] =
    useState<FeedbackSession | null>(null);
  const uploadVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pauseController = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const resumeAt =
    "resumeAt" in session.control ? session.control.resumeAt : undefined;
  const canSubmit = !resumeAt || Date.parse(resumeAt) <= now;

  useEffect(() => {
    if (!resumeAt || Date.parse(resumeAt) <= now) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(2147483647, Math.max(1, Date.parse(resumeAt) - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [resumeAt, now]);

  useEffect(
    () => () => {
      controller.current?.abort();
      uploadVersion.current++;
    },
    [],
  );

  async function upload(
    name: string,
    parse: () => Feedback[] | Promise<Feedback[]>,
  ) {
    if (controller.current) return;
    const version = ++uploadVersion.current;
    setSession({ ...emptySession, stage: "validating", fileName: name });
    try {
      const feedbacks = await parse();
      if (version !== uploadVersion.current) return;
      setSession({
        ...emptySession,
        stage: "ready",
        fileName: name,
        rows: feedbacks.map((feedback) => ({ feedback, status: "ready" })),
      });
      setPreviousResults(null);
      toast.success(
        feedbacks.length + " feedback rows validated. Ready to analyze.",
      );
    } catch (error) {
      if (version !== uploadVersion.current) return;
      setSession({
        ...emptySession,
        stage: "invalid",
        fileName: name,
        issues:
          error instanceof UploadError
            ? error.issues
            : [{ message: "File could not be read. Check the sample format." }],
      });
      toast.error(
        "Invalid file format. Check the errors or open the upload guide.",
        { duration: 10000 },
      );
    }
  }

  async function submit(onlyId?: string) {
    if (controller.current) return;
    if (
      (session.control.status === "blocked" ||
        session.control.status === "paused") &&
      session.control.resumeAt &&
      Date.parse(session.control.resumeAt) > Date.now()
    )
      return;
    const targets = session.rows.filter((row) =>
      onlyId
        ? row.feedback.feedback_id === onlyId && row.status === "failed"
        : row.status === "ready" || row.status === "failed",
    );
    if (!targets.length) return;
    const targetIds = new Set(targets.map((row) => row.feedback.feedback_id));
    const abort = new AbortController();
    const pauseAbort = new AbortController();
    pauseController.current = pauseAbort;
    controller.current = abort;
    const readyRows: FeedbackRow[] = session.rows.map((row) =>
      targetIds.has(row.feedback.feedback_id)
        ? { feedback: row.feedback, status: "ready" }
        : row,
    );
    let rows = readyRows;
    setSession((previous) => ({
      ...previous,
      stage: "analyzing",
      retrying: ["complete", "paused", "blocked"].includes(previous.stage),
      control: { status: "running" },
      rows: readyRows,
    }));
    let failed = 0;
    const outcome = await analyzeRows(
      targets.map((row) => row.feedback),
      (updated) => {
        if (updated.status === "failed") failed++;
        rows = rows.map((row) =>
          row.feedback.feedback_id === updated.feedback.feedback_id
            ? updated
            : row,
        );
        const updatedRows = rows;
        setSession((previous) => ({
          ...previous,
          rows: updatedRows,
        }));
      },
      abort.signal,
      {
        pauseSignal: pauseAbort.signal,
        onControl: (control) => {
          if (!abort.signal.aborted)
            setSession((previous) => ({ ...previous, control }));
        },
      },
    );
    if (abort.signal.aborted) return;
    controller.current = null;
    pauseController.current = null;
    // A targeted retry can finish while the rest of the batch is still waiting.
    const hasPendingRows = rows.some(
      (row) => row.status === "ready" || row.status === "analyzing",
    );
    const batchOutcome: RunnerOutcome =
      outcome.status === "complete" && hasPendingRows
        ? session.control.status === "paused" ||
          session.control.status === "blocked"
          ? session.control
          : {
              status: "paused",
              message: "Resume to process remaining feedback.",
            }
        : outcome;
    setSession((previous) => ({
      ...previous,
      stage: batchOutcome.status,
      retrying: false,
      control:
        batchOutcome.status === "complete"
          ? { status: "running" }
          : batchOutcome,
    }));
    if (batchOutcome.status !== "complete") return;
    if (failed)
      toast.error(
        failed +
          " feedback " +
          (failed === 1 ? "row needs" : "rows need") +
          " a retry. Details are in the table.",
      );
    else toast.success("Analysis complete. Your feedback insights are ready.");
  }

  function startNewUpload() {
    if (
      controller.current ||
      !["complete", "paused", "blocked"].includes(session.stage)
    )
      return;
    setPreviousResults(session);
    setSession(emptySession);
  }

  function restoreResults() {
    if (!previousResults || controller.current) return;
    uploadVersion.current++;
    setSession(previousResults);
    setPreviousResults(null);
  }

  return (
    <FeedbackContext.Provider
      value={{
        session,
        hasPreviousResults: previousResults !== null,
        uploadFile: (file) => upload(file.name, () => parseFeedbackFile(file)),
        loadSample: () =>
          upload("sample-feedback.csv", () => parseCsv(sampleCsv)),
        submit,
        pause: () => pauseController.current?.abort(),
        canSubmit,
        startNewUpload,
        restoreResults,
      }}
    >
      {children}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context)
    throw new Error("useFeedback must be used within FeedbackProvider.");
  return context;
}
