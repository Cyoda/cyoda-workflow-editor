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
        version: "1.0",
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
      startNewTxOnDispatch: true,
    });
  });

  test("scheduled processor round-trips with lowercase type and required config", () => {
    const doc = parseDocument(
      basePayload([
        {
          type: "scheduled",
          name: "schedule-next",
          config: {
            delayMs: 30000,
            transition: "finish",
            timeoutMs: 1000,
          },
        },
      ]),
    );

    const serialized = JSON.parse(serializeImportPayload(doc));
    expect(serialized.workflows[0].states.start.transitions[0].processors[0]).toEqual({
      type: "scheduled",
      name: "schedule-next",
      config: {
        delayMs: 30000,
        transition: "finish",
        timeoutMs: 1000,
      },
    });
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

  test("externalized processor without executionMode emits ASYNC_NEW_TX in serialized output", () => {
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
    expect(processor.executionMode).toBe("ASYNC_NEW_TX");
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

  test("COMMIT_BEFORE_DISPATCH is accepted by schema and semantic validation warns for invalid startNewTxOnDispatch pairing only", () => {
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
    expect(validateSession(invalidDoc.session).map((issue) => issue.code)).toContain(
      "start-new-tx-without-commit-before-dispatch",
    );
  });

  test("scheduled processor requires delayMs and transition, while timeoutMs remains optional", () => {
    const missingDelay = parseImportPayload(
      JSON.stringify(
        basePayload([
          {
            type: "scheduled",
            name: "schedule-next",
            config: { transition: "finish" },
          },
        ]),
      ),
    );
    expect(missingDelay.issues.some((issue) => issue.severity === "error")).toBe(true);

    const missingTransition = parseImportPayload(
      JSON.stringify(
        basePayload([
          {
            type: "scheduled",
            name: "schedule-next",
            config: { delayMs: 10 },
          },
        ]),
      ),
    );
    expect(missingTransition.issues.some((issue) => issue.severity === "error")).toBe(true);

    const timeoutOptional = parseImportPayload(
      JSON.stringify(
        basePayload([
          {
            type: "scheduled",
            name: "schedule-next",
            config: { delayMs: 10, transition: "finish" },
          },
        ]),
      ),
    );
    expect(timeoutOptional.document).toBeDefined();
  });

  test("negative processor timing values are rejected", () => {
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
    expect(responseTimeout.issues.some((issue) => issue.severity === "error")).toBe(true);

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

    const scheduledDelay = parseImportPayload(
      JSON.stringify(
        basePayload([
          {
            type: "scheduled",
            name: "schedule-next",
            config: { delayMs: -1, transition: "finish" },
          },
        ]),
      ),
    );
    expect(scheduledDelay.issues.some((issue) => issue.severity === "error")).toBe(true);
  });
});
