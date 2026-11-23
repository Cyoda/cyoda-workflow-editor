import { describe, expect, test } from "vitest";
import {
  parseImportPayload,
  serializeImportPayload,
  validateSession,
} from "../../src/index.js";

function parseDocument(payload: unknown) {
  const result = parseImportPayload(JSON.stringify(payload));
  expect(result.document).toBeDefined();
  return result.document!;
}

function baseTransition(overrides: Record<string, unknown> = {}) {
  return {
    name: "go",
    next: "done",
    manual: false,
    disabled: false,
    ...overrides,
  };
}

function basePayload(processors: unknown[]) {
  return {
    importMode: "MERGE",
    workflows: [
      {
        version: "1.3",
        name: "wf",
        initialState: "start",
        active: true,
        states: {
          start: {
            transitions: [baseTransition({ processors })],
          },
          done: { transitions: [] },
        },
      },
    ],
  };
}

describe("processor OpenAPI contract", () => {
  test("externalized processor serializes lowercase type, explicit ASYNC_NEW_TX, and startNewTxOnDispatch", () => {
    const doc = parseDocument(
      basePayload([
        {
          type: "externalized",
          name: "notify",
          executionMode: "ASYNC_NEW_TX",
          startNewTxOnDispatch: true,
          config: {
            attachEntity: true,
            calculationNodesTags: "alpha,beta",
            context: "ctx",
            responseTimeoutMs: 2500,
            retryPolicy: "retry",
            idempotent: true,
            asyncResult: true,
            crossoverToAsyncMs: 500,
          },
        },
      ]),
    );

    const serialized = JSON.parse(serializeImportPayload(doc));
    const processor = serialized.workflows[0].states.start.transitions[0].processors[0];

    expect(processor).toMatchObject({
      type: "externalized",
      name: "notify",
      executionMode: "ASYNC_NEW_TX",
    });
    // cyoda-go 0.9.0: processor-level, beside executionMode; refused in config.
    expect(processor.startNewTxOnDispatch).toBe(true);
    expect(processor.config).not.toHaveProperty("startNewTxOnDispatch");
    expect(processor.config).toMatchObject({ idempotent: true });
  });

  test("missing processor type is normalized to externalized", () => {
    const doc = parseDocument(
      basePayload([
        {
          name: "notify",
          executionMode: "SYNC",
          config: { calculationNodesTags: "probe" },
        },
      ]),
    );

    expect(doc.session.workflows[0]?.states.start?.transitions[0]?.processors?.[0]).toMatchObject({
      type: "externalized",
      name: "notify",
      executionMode: "SYNC",
    });
  });

  test("externalized processor without executionMode omits it in serialized output", () => {
    const doc = parseDocument(
      basePayload([
        {
          type: "externalized",
          name: "proc",
          // no executionMode field
          config: { calculationNodesTags: "probe" },
        },
      ]),
    );

    const serialized = JSON.parse(serializeImportPayload(doc));
    const processor = serialized.workflows[0].states.start.transitions[0].processors[0];
    expect(processor).not.toHaveProperty("executionMode");
  });

  test("unknown externalized config keys are not preserved", () => {
    const doc = parseDocument(
      basePayload([
        {
          type: "externalized",
          name: "notify",
          executionMode: "SYNC",
          config: {
            calculationNodesTags: "probe",
            unknownKey: "ignored",
          },
        },
      ]),
    );

    const serialized = serializeImportPayload(doc);
    expect(serialized).not.toContain("unknownKey");
  });

  test("COMMIT_BEFORE_DISPATCH is accepted by schema and semantic validation errors for invalid startNewTxOnDispatch pairing only", () => {
    const validDoc = parseDocument(
      basePayload([
        {
          type: "externalized",
          name: "commit-proc",
          executionMode: "COMMIT_BEFORE_DISPATCH",
          startNewTxOnDispatch: true,
          config: { calculationNodesTags: "probe" },
        },
      ]),
    );
    expect(validateSession(validDoc.session).map((issue) => issue.code)).not.toContain(
      "start-new-tx-without-commit-before-dispatch",
    );

    const invalidDoc = parseDocument(
      basePayload([
        {
          type: "externalized",
          name: "bad-proc",
          executionMode: "SYNC",
          startNewTxOnDispatch: true,
          config: { calculationNodesTags: "probe" },
        },
      ]),
    );
    const invalidIssues = validateSession(invalidDoc.session);
    expect(invalidIssues.map((issue) => issue.code)).toContain(
      "start-new-tx-without-commit-before-dispatch",
    );
    // The server hard-400s on this pairing, so this must be an error, not a
    // warning — a warning would wave through a guaranteed rejection.
    expect(
      invalidIssues.find((issue) => issue.code === "start-new-tx-without-commit-before-dispatch")
        ?.severity,
    ).toBe("error");
  });

  test("negative responseTimeoutMs parses but is a semantic error; negative crossoverToAsyncMs is rejected", () => {
    const responseTimeout = parseImportPayload(
      JSON.stringify(
        basePayload([
          {
            type: "externalized",
            name: "notify",
            executionMode: "SYNC",
            config: { responseTimeoutMs: -1 },
          },
        ]),
      ),
    );
    // The document still opens (no Zod bound), but cyoda-go 0.9.0 refuses it.
    expect(responseTimeout.document).toBeDefined();
    expect(
      responseTimeout.issues.find((issue) => issue.code === "response-timeout-negative")?.severity,
    ).toBe("error");

    const crossover = parseImportPayload(
      JSON.stringify(
        basePayload([
          {
            type: "externalized",
            name: "notify",
            executionMode: "SYNC",
            config: { asyncResult: true, crossoverToAsyncMs: -1 },
          },
        ]),
      ),
    );
    expect(crossover.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  test("startNewTxOnDispatch round-trips on the processor, not inside config", () => {
    const raw = JSON.stringify({
      importMode: "MERGE",
      workflows: [{
        version: "1.3", name: "w", initialState: "A", active: true,
        states: { A: { transitions: [{
          name: "t", next: "A", manual: true,
          processors: [{
            type: "externalized", name: "p",
            executionMode: "COMMIT_BEFORE_DISPATCH",
            startNewTxOnDispatch: true,
            config: { calculationNodesTags: "t" },
          }],
        }] } },
      }],
    });
    const parsed = parseImportPayload(raw);
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    const out = JSON.parse(serializeImportPayload(parsed.document!));
    const p = out.workflows[0].states.A.transitions[0].processors[0];
    expect(p.startNewTxOnDispatch).toBe(true);
    expect(p.config).not.toHaveProperty("startNewTxOnDispatch");
  });
});
