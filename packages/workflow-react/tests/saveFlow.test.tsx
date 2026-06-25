import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  parseImportPayload,
  WorkflowApiConflictError,
  type EntityIdentity,
  type WorkflowApi,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { useSaveFlow } from "../src/save/useSaveFlow.js";
import { diffSummary } from "../src/save/diff.js";

function fixtureWithEntity(): WorkflowEditorDocument {
  const json = JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "w",
        initialState: "a",
        active: true,
        states: { a: { transitions: [] } },
      },
    ],
  });
  const res = parseImportPayload(json);
  if (!res.document) throw new Error("parse failed");
  const entity: EntityIdentity = { entityName: "Order", modelVersion: 1 };
  return {
    ...res.document,
    session: { ...res.document.session, entity },
  };
}

function mockApi(): WorkflowApi & {
  importSpy: ReturnType<typeof vi.fn>;
} {
  const importSpy = vi.fn();
  return {
    exportWorkflows: vi.fn(),
    importWorkflows: importSpy as unknown as WorkflowApi["importWorkflows"],
    importSpy,
  };
}

afterEach(() => cleanup());

describe("useSaveFlow", () => {
  it("gates MERGE saves behind a single confirm", async () => {
    const api = mockApi();
    api.importSpy.mockResolvedValue({ concurrencyToken: "t2" });
    const onSaved = vi.fn();
    const doc = fixtureWithEntity();

    const { result } = renderHook(() =>
      useSaveFlow({ api, document: doc, concurrencyToken: "t1", onSaved }),
    );

    act(() => result.current.requestSave());
    expect(result.current.status).toMatchObject({
      kind: "confirming",
      mode: "MERGE",
      requiresExplicitConfirm: false,
    });

    await act(async () => {
      await result.current.confirmSave();
    });

    expect(api.importSpy).toHaveBeenCalledTimes(1);
    const call = api.importSpy.mock.calls[0]!;
    expect(call[2]).toEqual({ concurrencyToken: "t1" });
    expect(onSaved).toHaveBeenCalledWith("t2");
  });

  it("enters conflict state on 409", async () => {
    const api = mockApi();
    api.importSpy.mockRejectedValue(
      new WorkflowApiConflictError(
        { entityName: "Order", modelVersion: 1 },
        "server-t",
      ),
    );
    const doc = fixtureWithEntity();

    const { result } = renderHook(() =>
      useSaveFlow({
        api,
        document: doc,
        concurrencyToken: "t1",
        onSaved: vi.fn(),
      }),
    );

    act(() => result.current.requestSave());
    await act(async () => {
      await result.current.confirmSave();
    });

    expect(result.current.status).toMatchObject({
      kind: "conflict",
      serverConcurrencyToken: "server-t",
    });
  });

  it("force-overwrite resends without a token", async () => {
    const api = mockApi();
    api.importSpy.mockResolvedValueOnce({ concurrencyToken: "t3" });
    const onSaved = vi.fn();
    const doc = fixtureWithEntity();

    const { result } = renderHook(() =>
      useSaveFlow({ api, document: doc, concurrencyToken: "t1", onSaved }),
    );

    await act(async () => {
      await result.current.forceOverwrite();
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("t3"));
    const call = api.importSpy.mock.calls[0]!;
    expect(call[2]).toEqual({ concurrencyToken: null });
  });

  it("ignores a second confirmSave while the first save is still in flight", () => {
    const api = mockApi();
    api.importSpy.mockImplementation(() => new Promise(() => {}));
    const onSaved = vi.fn();
    const doc = fixtureWithEntity();

    const { result } = renderHook(() =>
      useSaveFlow({ api, document: doc, concurrencyToken: "t1", onSaved }),
    );

    act(() => {
      void result.current.confirmSave();
      void result.current.confirmSave();
    });

    expect(api.importSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects save when session has no entity identity", async () => {
    const api = mockApi();
    const res = parseImportPayload(
      JSON.stringify({
        importMode: "MERGE",
        workflows: [
          {
            version: "1.0",
            name: "w",
            initialState: "a",
            active: true,
            states: { a: { transitions: [] } },
          },
        ],
      }),
    );
    if (!res.document) throw new Error("parse failed");

    const { result } = renderHook(() =>
      useSaveFlow({
        api,
        document: res.document!,
        concurrencyToken: null,
        onSaved: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.confirmSave();
    });
    expect(result.current.status.kind).toBe("error");
  });
});

describe("diffSummary", () => {
  it("returns null when no server document", () => {
    const doc = fixtureWithEntity();
    expect(diffSummary(null, doc)).toBeNull();
  });

  it("detects added / removed / changed workflows", () => {
    const base = fixtureWithEntity();
    const modified: WorkflowEditorDocument = {
      ...base,
      session: {
        ...base.session,
        workflows: [
          {
            ...base.session.workflows[0]!,
            name: "renamed",
          },
        ],
      },
    };
    const summary = diffSummary(base, modified)!;
    expect(summary).toContain("added: renamed");
    expect(summary).toContain("removed: w");
  });
});
