import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackWorkspace } from "@/components/feedback/feedback-workspace";
import { FeedbackProvider } from "@/components/feedback/feedback-provider";
import GuidePage from "@/app/guide/page";
import { sampleCsv } from "@/lib/feedback/sample";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));
import { toast } from "sonner";

const result = {
  happiness: "happy",
  topic: "support",
  impact: "minor",
  urgency: "routine",
  action: "thank",
  confidence: 0.9,
  needsReview: false,
};

function file(csv = sampleCsv, name = "customers.csv") {
  const upload = new File([csv], name, { type: "text/csv" });
  Object.defineProperty(upload, "text", { value: async () => csv });
  return upload;
}

function renderWorkspace() {
  return render(
    <FeedbackProvider>
      <FeedbackWorkspace />
    </FeedbackProvider>,
  );
}

function mockSuccess() {
  const fetch = vi.fn(async (_url, init: RequestInit) =>
    Response.json({
      ...result,
      feedback_id: JSON.parse(String(init.body)).feedback_id,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function loadSample(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Try the sample data" }));
  await screen.findByRole("heading", { name: "Your feedback preview" });
}

async function analyzeSample(user: ReturnType<typeof userEvent.setup>) {
  await loadSample(user);
  await user.click(
    screen.getByRole("button", { name: "Analyze 3 feedback rows" }),
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("upload and analysis workflow", () => {
  it("shows original contents beside the file confirmation, then replaces upload with results", async () => {
    const user = userEvent.setup();
    const fetch = mockSuccess();
    renderWorkspace();
    expect(
      screen.getByRole("button", { name: "Analyze feedback" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "See how it works" }),
    ).toHaveAttribute("href", "/guide");
    expect(
      screen.queryByText("Start with the right format"),
    ).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose a feedback file"), file());
    const previewHeading = await screen.findByRole("heading", {
      name: "Your feedback preview",
    });
    expect(previewHeading).toHaveFocus();
    expect(screen.getByText("customers.csv")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace file" }),
    ).toBeInTheDocument();
    const preview = screen.getByRole("table", {
      name: "Uploaded file contents",
    });
    expect(
      within(preview).getByText("Friendly support, resolved my issue quickly."),
    ).toBeInTheDocument();
    expect(within(preview).queryByText("Happiness")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Analyze 3 feedback rows" }),
    );
    await screen.findByText("Analysis finished: 3 succeeded, 0 failed.");
    expect(
      screen.getByRole("heading", { name: "Your feedback insights" }),
    ).toHaveFocus();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      screen.getByRole("region", { name: "Feedback insights" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Choose a feedback file"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your feedback preview" }),
    ).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: /Original feedback/ });
    expect(within(table).getAllByText("Happy")).toHaveLength(3);
    expect(within(table).getAllByText(/Thank the customer/)).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: "How we assess feedback" }),
    ).toHaveAttribute("href", "/guide#assessment");
  });

  it("clears an invalid preview, disables analysis and links directly to format help", async () => {
    const user = userEvent.setup();
    const fetch = mockSuccess();
    renderWorkspace();
    await loadSample(user);
    fireEvent.change(screen.getByLabelText("Choose a feedback file"), {
      target: { files: [file("feedback\nBad", "invalid.csv")] },
    });
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(/Required column is missing/),
    ).toBeInTheDocument();
    expect(
      within(alert).getByRole("link", {
        name: "Compare with the sample format",
      }),
    ).toHaveAttribute("href", "/guide#sample");
    expect(screen.queryByText("Your feedback preview")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Analyze feedback" }),
    ).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid file format"),
      expect.objectContaining({ duration: 10000 }),
    );
  });

  it("expands longer previews and omits absent optional columns", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const csv =
      "feedback_id,feedback\n" +
      Array.from(
        { length: 7 },
        (_, i) => "R" + (i + 1) + ",Response " + (i + 1),
      ).join("\n");
    await user.upload(
      screen.getByLabelText("Choose a feedback file"),
      file(csv),
    );
    await screen.findByText("Showing 5 of 7 rows");
    const table = screen.getByRole("table", { name: "Uploaded file contents" });
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(
      within(table).queryByRole("columnheader", { name: "Service" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: "Date" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: "Rating" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View all 7 rows" }));
    expect(screen.getByText("Showing 7 of 7 rows")).toBeInTheDocument();
    expect(within(table).getByText("Response 7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show first 5 rows" }));
    expect(within(table).queryByText("Response 7")).not.toBeInTheDocument();
  });

  it("allows choosing the same file again and uses a singular analysis label", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const upload = file("feedback_id,feedback\nOne,A single response");
    await user.upload(screen.getByLabelText("Choose a feedback file"), upload);
    await screen.findByRole("button", { name: "Analyze 1 feedback row" });
    await user.upload(screen.getByLabelText("Choose a feedback file"), upload);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "Analyze 1 feedback row" }),
    ).toBeEnabled();
  });

  it("keeps the preview when visiting the guide and returning", async () => {
    const user = userEvent.setup();
    const fetch = mockSuccess();
    const view = renderWorkspace();
    await loadSample(user);
    view.rerender(
      <FeedbackProvider>
        <GuidePage />
      </FeedbackProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "How Feedback Radar works" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Start with the right format" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to your feedback" }),
    ).toHaveAttribute("href", "/");
    view.rerender(
      <FeedbackProvider>
        <FeedbackWorkspace />
      </FeedbackProvider>,
    );
    expect(screen.getByText("sample-feedback.csv")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Uploaded file contents" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Analyze 3 feedback rows" }),
    ).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("continues processing during guide visits without aborting or exposing upload controls", async () => {
    const user = userEvent.setup();
    const responses: Array<{
      id: string;
      signal: AbortSignal;
      resolve: (response: Response) => void;
    }> = [];
    const fetch = vi.fn(
      (_url, init: RequestInit) =>
        new Promise<Response>((resolve) =>
          responses.push({
            id: JSON.parse(String(init.body)).feedback_id,
            signal: init.signal as AbortSignal,
            resolve,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const view = renderWorkspace();
    await analyzeSample(user);
    expect(
      screen.getByRole("heading", { name: "Analyzing your feedback" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Feedback analysis progress" }),
    ).toHaveAttribute("value", "0");
    expect(
      screen.queryByLabelText("Choose a feedback file"),
    ).not.toBeInTheDocument();
    view.rerender(
      <FeedbackProvider>
        <GuidePage />
      </FeedbackProvider>,
    );
    expect(responses.every(({ signal }) => !signal.aborted)).toBe(true);
    await act(async () => {
      responses[0].resolve(
        Response.json({ ...result, feedback_id: responses[0].id }),
      );
    });
    view.rerender(
      <FeedbackProvider>
        <FeedbackWorkspace />
      </FeedbackProvider>,
    );
    expect(
      screen.getByText("Processing feedback: 1 of 3 finished."),
    ).toBeInTheDocument();
    view.rerender(
      <FeedbackProvider>
        <GuidePage />
      </FeedbackProvider>,
    );
    await act(async () => {
      for (const response of responses.slice(1))
        response.resolve(
          Response.json({ ...result, feedback_id: response.id }),
        );
    });
    view.rerender(
      <FeedbackProvider>
        <FeedbackWorkspace />
      </FeedbackProvider>,
    );
    expect(
      screen.getByText("Analysis finished: 3 succeeded, 0 failed."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries only failed feedback while retaining successful insights", async () => {
    const user = userEvent.setup();
    let fail = true;
    let finishRetry: (() => void) | undefined;
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      const id = JSON.parse(String(init.body)).feedback_id;
      if (id === "F002") {
        if (fail)
          return Response.json(
            { error: "AI temporarily unavailable" },
            { status: 502 },
          );
        return new Promise<Response>((resolve) => {
          finishRetry = () =>
            resolve(Response.json({ ...result, feedback_id: id }));
        });
      }
      return Response.json({ ...result, feedback_id: id });
    });
    vi.stubGlobal("fetch", fetch);
    renderWorkspace();
    await analyzeSample(user);
    await screen.findByText("Analysis finished: 2 succeeded, 1 failed.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry F002" }));
    expect(
      screen.getByRole("heading", { name: "Your feedback insights" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Analyze another file" }),
    ).toBeDisabled();
    await act(async () => finishRetry?.());
    await screen.findByText("Analysis finished: 3 succeeded, 0 failed.");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetch.mock.calls[3][1].body)).feedback_id).toBe(
      "F002",
    );
  });

  it("shows recovery when every row fails, then retries the batch successfully", async () => {
    const user = userEvent.setup();
    let fail = true;
    const fetch = vi.fn(async (_url, init: RequestInit) =>
      fail
        ? Response.json(
            { error: "AI temporarily unavailable" },
            { status: 502 },
          )
        : Response.json({
            ...result,
            feedback_id: JSON.parse(String(init.body)).feedback_id,
          }),
    );
    vi.stubGlobal("fetch", fetch);
    renderWorkspace();
    await analyzeSample(user);
    await screen.findByText("We couldn’t analyze your feedback.");
    expect(
      screen.queryByRole("region", { name: "Feedback insights" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Your feedback preview")).not.toBeInTheDocument();
    fail = false;
    await user.click(
      screen.getByRole("button", { name: "Retry 3 failed rows" }),
    );
    await screen.findByText("Analysis finished: 3 succeeded, 0 failed.");
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("preserves prior results through a failed replacement and discards them after a valid replacement", async () => {
    const user = userEvent.setup();
    mockSuccess();
    renderWorkspace();
    await analyzeSample(user);
    await screen.findByText("Analysis finished: 3 succeeded, 0 failed.");
    await user.click(
      screen.getByRole("button", { name: "Analyze another file" }),
    );
    await user.upload(
      screen.getByLabelText("Choose a feedback file"),
      file("feedback\nBad", "invalid.csv"),
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Back to previous results" }),
    );
    expect(
      screen.getByText("Analysis finished: 3 succeeded, 0 failed."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Analyze another file" }),
    );
    await user.upload(
      screen.getByLabelText("Choose a feedback file"),
      file("feedback_id,feedback\nNew,Replacement response", "new.csv"),
    );
    await screen.findByText("new.csv");
    expect(
      screen.getByRole("button", { name: "Analyze 1 feedback row" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Back to previous results" }),
    ).not.toBeInTheDocument();
  });

  it("keeps quota-blocked rows pending, preserves successes and disables resume until reset", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      const id = JSON.parse(String(init.body)).feedback_id;
      if (id === "F001")
        return Response.json(
          {
            error: "This network has reached its daily analysis allowance.",
            code: "IP_QUOTA_EXHAUSTED",
            retryable: false,
            resumeAt: new Date(Date.now() + 60000).toISOString(),
          },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      return Response.json({ ...result, feedback_id: id });
    });
    vi.stubGlobal("fetch", fetch);
    renderWorkspace();
    await analyzeSample(user);
    await screen.findByText(
      "Analysis incomplete: 2 succeeded, 0 failed, 1 waiting.",
    );
    expect(screen.getByText("Analysis on hold")).toBeInTheDocument();
    expect(screen.getByText(/Available again:/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resume remaining feedback" }),
    ).toBeDisabled();
    expect(
      within(
        screen.getByRole("table", { name: /Original feedback/ }),
      ).getAllByText("Happy"),
    ).toHaveLength(2);
    expect(screen.getByText("Waiting to analyze")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("resumes paused feedback without repeating successfully analyzed rows", async () => {
    const user = userEvent.setup();
    let blocked = true;
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      const id = JSON.parse(String(init.body)).feedback_id;
      if (id === "F001" && blocked)
        return Response.json(
          {
            error: "Analysis protection is temporarily unavailable.",
            code: "PROTECTION_UNAVAILABLE",
            retryable: false,
          },
          { status: 503 },
        );
      return Response.json({ ...result, feedback_id: id });
    });
    vi.stubGlobal("fetch", fetch);
    renderWorkspace();
    await analyzeSample(user);
    await screen.findByText(
      "Analysis incomplete: 2 succeeded, 0 failed, 1 waiting.",
    );
    blocked = false;
    await user.click(
      screen.getByRole("button", { name: "Resume remaining feedback" }),
    );
    await screen.findByText("Analysis finished: 3 succeeded, 0 failed.");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetch.mock.calls[3][1].body)).feedback_id).toBe(
      "F001",
    );
  });

  it("allows user pause, drains in-flight results and resumes remaining rows", async () => {
    const user = userEvent.setup();
    const responses: (() => void)[] = [];
    const fetch = vi.fn(
      (_url, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          responses.push(() =>
            resolve(
              Response.json({
                ...result,
                feedback_id: JSON.parse(String(init.body)).feedback_id,
              }),
            ),
          );
        }),
    );
    vi.stubGlobal("fetch", fetch);
    renderWorkspace();
    await user.upload(
      screen.getByLabelText("Choose a feedback file"),
      file(
        "feedback_id,feedback\n" +
          Array.from({ length: 5 }, (_, i) => `R${i},Good`).join("\n"),
      ),
    );
    await user.click(
      await screen.findByRole("button", { name: "Analyze 5 feedback rows" }),
    );
    await user.click(screen.getByRole("button", { name: "Pause analysis" }));
    await act(async () => responses.forEach((resolve) => resolve()));
    await screen.findByText(
      "Analysis incomplete: 3 succeeded, 0 failed, 2 waiting.",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    await user.click(
      screen.getByRole("button", { name: "Resume remaining feedback" }),
    );
    await act(async () => responses.slice(3).forEach((resolve) => resolve()));
    await screen.findByText("Analysis finished: 5 succeeded, 0 failed.");
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it.each([
    { stop: "paused", retrySucceeds: true },
    { stop: "paused", retrySucceeds: false },
    { stop: "blocked", retrySucceeds: true },
    { stop: "blocked", retrySucceeds: false },
  ] as const)(
    "keeps $stop feedback resumable after a single-row retry (success: $retrySucceeds)",
    async ({ stop, retrySucceeds }) => {
      const user = userEvent.setup();
      const responses: Array<{
        id: string;
        resolve: (response: Response) => void;
      }> = [];
      let resuming = false;
      const fetch = vi.fn((_url, init: RequestInit) => {
        const id: string = JSON.parse(String(init.body)).feedback_id;
        if (resuming)
          return Promise.resolve(Response.json({ ...result, feedback_id: id }));
        return new Promise<Response>((resolve) =>
          responses.push({ id, resolve }),
        );
      });
      vi.stubGlobal("fetch", fetch);
      renderWorkspace();
      await user.upload(
        screen.getByLabelText("Choose a feedback file"),
        file(
          "feedback_id,feedback\n" +
            Array.from({ length: 5 }, (_, i) => `R${i},Good`).join("\n"),
        ),
      );
      await user.click(
        await screen.findByRole("button", { name: "Analyze 5 feedback rows" }),
      );
      await waitFor(() => expect(responses).toHaveLength(3));
      if (stop === "paused")
        await user.click(
          screen.getByRole("button", { name: "Pause analysis" }),
        );
      const resumeAt = new Date(Date.now() - 1000).toISOString();
      const providerFailure = () =>
        Response.json({ error: "AI temporarily unavailable" }, { status: 502 });
      await act(async () => {
        responses[0].resolve(providerFailure());
        responses[1].resolve(Response.json({ ...result, feedback_id: "R1" }));
        responses[2].resolve(
          stop === "blocked"
            ? Response.json(
                {
                  error:
                    "This network has reached its daily analysis allowance.",
                  code: "IP_QUOTA_EXHAUSTED",
                  retryable: false,
                  resumeAt,
                },
                { status: 429 },
              )
            : Response.json({ ...result, feedback_id: "R2" }),
        );
      });
      const successes = stop === "paused" ? 2 : 1;
      const waiting = stop === "paused" ? 2 : 3;
      await screen.findByText(
        `Analysis incomplete: ${successes} succeeded, 1 failed, ${waiting} waiting.`,
      );
      expect(fetch).toHaveBeenCalledTimes(3);
      vi.mocked(toast.success).mockClear();
      await user.click(screen.getByRole("button", { name: "Retry R0" }));
      await waitFor(() => expect(responses).toHaveLength(4));
      expect(responses[3].id).toBe("R0");
      await act(async () => {
        responses[3].resolve(
          retrySucceeds
            ? Response.json({ ...result, feedback_id: "R0" })
            : providerFailure(),
        );
      });
      await screen.findByText(
        `Analysis incomplete: ${successes + Number(retrySucceeds)} succeeded, ${retrySucceeds ? 0 : 1} failed, ${waiting} waiting.`,
      );
      expect(
        screen.getByText(
          stop === "paused" ? "Analysis paused" : "Analysis on hold",
        ),
      ).toBeInTheDocument();
      if (stop === "blocked") {
        expect(screen.getByText(/Available again:/)).toHaveTextContent(
          new Date(resumeAt).toLocaleString(),
        );
        expect(
          screen.getByText(/This network has reached/),
        ).toBeInTheDocument();
      }
      expect(toast.success).not.toHaveBeenCalled();
      const resume = screen.getByRole("button", {
        name: "Resume remaining feedback",
      });
      expect(resume).toBeEnabled();
      expect(screen.getAllByText("Waiting to analyze")).toHaveLength(waiting);
      resuming = true;
      await user.click(resume);
      await screen.findByText("Analysis finished: 5 succeeded, 0 failed.");
      const resumedIds = fetch.mock.calls
        .slice(4)
        .map(([, init]) => JSON.parse(String(init.body)).feedback_id);
      expect(resumedIds.sort()).toEqual(
        [
          ...(retrySucceeds ? [] : ["R0"]),
          ...(stop === "blocked" ? ["R2"] : []),
          "R3",
          "R4",
        ].sort(),
      );
      expect(
        screen.queryByRole("button", { name: "Resume remaining feedback" }),
      ).not.toBeInTheDocument();
    },
  );

  it("starts empty after the provider is remounted, matching refresh behavior", async () => {
    const user = userEvent.setup();
    const view = renderWorkspace();
    await loadSample(user);
    view.unmount();
    renderWorkspace();
    expect(
      screen.queryByRole("table", { name: "Uploaded file contents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Analyze feedback" }),
    ).toBeDisabled();
  });
});
