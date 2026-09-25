import { describe, expect, test } from "vitest";
import { parseImportPayload, validateAll, validateSemantics } from "../../src/index.js";
import type { WorkflowEditorDocument, WorkflowSession } from "../../src/index.js";

function parse(version: string) {
  return parseImportPayload(JSON.stringify({
    importMode: "MERGE",
    workflows: [{
      version, name: "w", initialState: "A", active: true,
      states: { A: { transitions: [] } },
    }],
  }));
}

function sessionWithVersion(version: string): WorkflowSession {
  return {
    entity: null,
    importMode: "MERGE",
    workflows: [{
      version, name: "w", initialState: "A", active: true,
      states: { A: { transitions: [] } },
    }],
  };
}

describe("workflow schema version tag (spec §4)", () => {
  test.each(["1", "1.0.0", "1.03", "2.0", "1.5"])("%j is a blocking error", (v) => {
    const issue = parse(v).issues.find((i) => i.code === "workflow-schema-version-malformed");
    expect(issue?.severity).toBe("error");
  });

  test("1.0 is a warning carrying a fix, not an error", () => {
    const issue = parse("1.0").issues.find((i) => i.code === "workflow-schema-version-outdated");
    expect(issue?.severity).toBe("warning");
    expect(issue?.fix?.label).toMatch(/1\.4/);
  });

  test("the fix rewrites the tag to the dialect's and bumps meta.revision", () => {
    const parsed = parse("1.0");
    const issue = parsed.issues.find((i) => i.code === "workflow-schema-version-outdated")!;
    const before = parsed.document!.meta.revision;
    const fixed = issue.fix!.apply(parsed.document!);
    expect(fixed.session.workflows[0]!.version).toBe("1.4");
    expect(fixed.meta.revision).toBe(before + 1);
  });

  test("with no document, the dialect falls back to LATEST_CYODA_VERSION and still fires", () => {
    const issues = validateSemantics(sessionWithVersion("1.03"));
    const issue = issues.find((i) => i.code === "workflow-schema-version-malformed");
    expect(issue?.severity).toBe("error");
  });

  test.each(["1.1", "1.2", "1.3", "1.4"])("%j is clean", (v) => {
    const codes = parse(v).issues.map((i) => i.code);
    expect(codes).not.toContain("workflow-schema-version-malformed");
    expect(codes).not.toContain("workflow-schema-version-outdated");
  });
});

describe("a document naming an unresolvable dialect (the 0.8.3 upgrade path)", () => {
  // Every editor document saved by a pre-0.8.3 build of this library carries
  // `meta.cyodaVersion: "0.7"`, and the "0.7" dialect was removed. `validateAll`
  // and the React derive path do not catch, so a throw here tears the editor
  // down on render.
  function legacyDocument(): WorkflowEditorDocument {
    const parsed = parse("1.3");
    return {
      ...parsed.document!,
      meta: { ...parsed.document!.meta, cyodaVersion: "0.7" },
    };
  }

  test("validateAll returns issues rather than throwing", () => {
    expect(() => validateAll(legacyDocument())).not.toThrow();
  });

  test("the unresolvable version is reported, once, as info", () => {
    const issues = validateAll(legacyDocument()).filter(
      (i) => i.code === "cyoda-version-unresolvable",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("info");
    expect(issues[0]!.message).toContain('"0.7"');
  });

  test("the version-tag rule is skipped, not silently mis-evaluated", () => {
    const doc = legacyDocument();
    doc.session.workflows[0]!.version = "1.03";
    const codes = validateAll(doc).map((i) => i.code);
    expect(codes).not.toContain("workflow-schema-version-malformed");
    expect(codes).toContain("cyoda-version-unresolvable");
  });

  test("an unknown (never-shipped) version is reported the same way", () => {
    const parsed = parse("1.3");
    const doc: WorkflowEditorDocument = {
      ...parsed.document!,
      meta: { ...parsed.document!.meta, cyodaVersion: "9.9" },
    };
    expect(() => validateAll(doc)).not.toThrow();
    expect(validateAll(doc).map((i) => i.code)).toContain("cyoda-version-unresolvable");
  });
});

describe("the tag must cover the features the workflow uses", () => {
  function wf(version: string, extra: Record<string, unknown>) {
    return JSON.stringify({
      importMode: "MERGE",
      workflows: [{ version, name: "w", initialState: "A", active: true, ...extra, states: { A: { transitions: [] } } }],
    });
  }
  const not = {
    criterion: {
      type: "group",
      operator: "NOT",
      conditions: [{ type: "simple", jsonPath: "$.a", operation: "EQUALS", value: 1 }],
    },
  };

  test.each(["1.1", "1.2", "1.3"])("NOT under %j is a blocking error with a fix to 1.4", (v) => {
    const parsed = parseImportPayload(wf(v, not));
    const issue = parsed.issues.find((i) => i.code === "workflow-schema-version-below-features");
    expect(issue?.severity).toBe("error");
    expect(issue?.detail).toMatchObject({ required: "1.4", features: ["NOT criterion group"] });
    const fixed = issue!.fix!.apply(parsed.document!);
    expect(fixed.session.workflows[0]!.version).toBe("1.4");
  });

  test("NOT under 1.4 is clean", () => {
    const codes = parseImportPayload(wf("1.4", not)).issues.map((i) => i.code);
    expect(codes).not.toContain("workflow-schema-version-below-features");
  });

  test("the fix raises the tag only as far as the features require", () => {
    const parsed = parseImportPayload(wf("1.1", { criterionAnnotations: { note: "x" } }));
    const issue = parsed.issues.find((i) => i.code === "workflow-schema-version-below-features");
    expect(issue?.detail).toMatchObject({ required: "1.2" });
    expect(issue!.fix!.apply(parsed.document!).session.workflows[0]!.version).toBe("1.2");
  });

  test("a workflow using no gated feature is clean under 1.1", () => {
    const codes = parseImportPayload(wf("1.1", {})).issues.map((i) => i.code);
    expect(codes).not.toContain("workflow-schema-version-below-features");
  });
});
